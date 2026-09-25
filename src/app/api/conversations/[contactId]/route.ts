import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUid, requireContactAccessible } from "@/lib/comms/route-auth";
import { smsIsConfigured, subAccountTwilioIsConfigured, subAccountWhatsappIsConfigured } from "@/lib/comms/twilio";
import { emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import { readAgentConfiguration } from "@/lib/comms/ai/agent";
import { conversationChannels, conversationAiAvailability, eligibleConversationMember, parseConversationPatch } from "@/lib/server/conversation-availability";
import { updateConversationWorkflowState } from "@/lib/server/conversations-service";
import type { SubAccountDoc, SubAccountMemberDoc } from "@/types";
import type { Contact } from "@/types/contacts";
import type { ConversationChannel, ConversationDetails } from "@/types/conversations";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ contactId: string }> };

async function accessible(request: Request, ctx: Context) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;
  return requireContactAccessible(auth.uid, (await ctx.params).contactId);
}

async function membersForContact(contact: Contact, sub: SubAccountDoc) {
  const snap = await getAdminDb().collection(`subAccounts/${contact.subAccountId}/subAccountMembers`).where("status", "==", "active").get();
  return snap.docs.filter((doc) => eligibleConversationMember(doc.data() as SubAccountMemberDoc, sub, contact))
    .map((doc) => ({ uid: doc.id, name: String(doc.data().displayName || "Team member") }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
}

export async function GET(request: Request, ctx: Context) {
  const contact = await accessible(request, ctx);
  if (contact instanceof NextResponse) return contact;
  try {
    const db = getAdminDb();
    const [subSnap, agencySnap, conversation, agent, whatsapp, meta] = await Promise.all([
      db.doc(`subAccounts/${contact.subAccountId}`).get(),
      db.doc(`agencies/${contact.agencyId}`).get(),
      db.doc(`conversations/${contact.id}`).get(),
      readAgentConfiguration(contact.subAccountId),
      // Match the existing send routes' bounded window lookup exactly.
      db.collection(`contacts/${contact.id}/whatsappMessages`).orderBy("createdAt", "desc").limit(50).get(),
      db.collection(`contacts/${contact.id}/metaMessages`).orderBy("createdAt", "desc").limit(50).get(),
    ]);
    const sub = subSnap.data() as SubAccountDoc | undefined;
    if (!sub || sub.agencyId !== contact.agencyId) return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
    if (conversation.exists && conversation.data()?.subAccountId !== contact.subAccountId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const latestInbound: Partial<Record<ConversationChannel, number>> = {};
    for (const [channel, snap] of [["whatsapp", whatsapp], ["meta", meta]] as const) {
      for (const doc of snap.docs) {
        const row = doc.data();
        const key = channel === "whatsapp" ? "whatsapp" : row.channel;
        if (row.direction !== "inbound" || !["whatsapp", "messenger", "instagram"].includes(key)) continue;
        const typedKey = key as ConversationChannel;
        if (latestInbound[typedKey] === undefined) {
          const ms = row.createdAt?.toMillis?.();
          if (typeof ms === "number") latestInbound[typedKey] = ms;
        }
      }
    }
    const dedicatedSms = subAccountTwilioIsConfigured(sub.twilioConfig);
    const hours = agent.whatsapp?.whatsapp?.sessionWindowHours ?? 24;
    const channels = conversationChannels({
      contact, sub, dedicatedSms,
      sharedSms: smsIsConfigured() && agencySnap.data()?.sharedSmsAllowed !== false,
      whatsappConfigured: subAccountWhatsappIsConfigured(sub.twilioConfig),
      emailConfigured: emailIsConfigured() && !!tenantFrom(sub),
      latestInbound, whatsappWindowHours: hours, now: Date.now(),
    });
    const result: ConversationDetails = {
      channels,
      ...conversationAiAvailability({
        channel: conversation.data()?.lastChannel as ConversationChannel | undefined,
        channels, sub, dedicatedSms, agent,
        configured: !!process.env.OPENROUTER_API_KEY?.trim(),
      }),
      members: await membersForContact(contact, sub),
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load conversation availability" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Context) {
  const contact = await accessible(request, ctx);
  if (contact instanceof NextResponse) return contact;
  const patch = parseConversationPatch(await request.json().catch(() => null));
  if (!patch) return NextResponse.json({ error: "Provide status (open/closed) and/or assigneeUid (member uid or null)." }, { status: 400 });
  try {
    if (typeof patch.assigneeUid === "string") {
      const sub = (await getAdminDb().doc(`subAccounts/${contact.subAccountId}`).get()).data() as SubAccountDoc | undefined;
      if (!sub || sub.agencyId !== contact.agencyId ||
          !(await membersForContact(contact, sub)).some((member) => member.uid === patch.assigneeUid))
        return NextResponse.json({ error: "Assignee must be an active member with access to this contact." }, { status: 400 });
    }
    const updated = await updateConversationWorkflowState({ contactId: contact.id, subAccountId: contact.subAccountId, ...patch });
    if (!updated) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to update conversation" }, { status: 500 });
  }
}
