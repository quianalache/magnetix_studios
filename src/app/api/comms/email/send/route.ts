import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured, sendTenantEmail, tenantFrom, NoTenantDomainError } from "@/lib/comms/resend";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { recordSend } from "@/lib/comms/usage";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import type { SubAccountDoc } from "@/types";

type Body = { contactId?: string; subject?: string; body?: string };

/**
 * Send an email to a contact — used by two callers: the Contact-profile
 * "Send email" dialog (always passes an explicit `subject`) and the
 * Conversations reply composer (omits it, since a reply box has no subject
 * field — this derives "Re: {last email's subject}" instead, same
 * convention every mail client uses). Either way, this now writes to
 * contacts/{id}/emailMessages and updates the conversation index, so the
 * send shows up in the unified Conversations thread — it previously only
 * logged an activity-feed row, so a manually-sent email was invisible in
 * Conversations even though an inbound reply to it would show up fine.
 */
export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment." },
      { status: 503 },
    );
  }

  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = payload.contactId?.trim();
  const explicitSubject = payload.subject?.trim();
  const body = payload.body?.trim();

  if (!contactId || !body) {
    return NextResponse.json(
      { error: "contactId and body are required" },
      { status: 400 },
    );
  }

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;

  if (!contact.email) {
    return NextResponse.json(
      { error: "This contact has no email address." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subAccountSnap = await db
    .doc(`subAccounts/${contact.subAccountId}`)
    .get();
  const subAccount = subAccountSnap.data() as SubAccountDoc | undefined;

  let subject = explicitSubject;
  if (!subject) {
    const lastEmailSnap = await db
      .collection("contacts")
      .doc(contactId)
      .collection("emailMessages")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    const lastSubject = lastEmailSnap.empty
      ? null
      : (lastEmailSnap.docs[0].data().subject as string | undefined);
    subject = lastSubject
      ? lastSubject.match(/^re:/i)
        ? lastSubject
        : `Re: ${lastSubject}`
      : `Message from ${subAccount?.name ?? "us"}`;
  }

  let messageId: string;
  try {
    const result = await sendTenantEmail({
      sub: subAccount,
      to: contact.email,
      subject,
      text: body,
    });
    messageId = result.id;
  } catch (err) {
    if (err instanceof NoTenantDomainError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("activities")
      .add({
        type: "email_sent",
        content: `Email: ${subject}`,
        createdBy: auth.uid,
        meta: { messageId, subject },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[email/send] activity write failed", err);
  }

  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("emailMessages")
      .doc(messageId)
      .set({
        agencyId: contact.agencyId,
        subAccountId: contact.subAccountId,
        contactId,
        direction: "outbound",
        status: "sent",
        body,
        subject,
        from: tenantFrom(subAccount) ?? "",
        to: contact.email,
        resendEmailId: messageId,
        twilioMessageSid: null,
        sentByUid: auth.uid,
        error: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[email/send] message-row write failed", err);
  }

  await upsertConversationForMessage({
    contactId,
    subAccountId: contact.subAccountId,
    agencyId: contact.agencyId,
    contactName: contact.name ?? "",
    contactPhone: null,
    channel: "email",
    direction: "outbound",
    body: `${subject}\n${body}`,
    pauseBot: true,
  });

  await recordSend(auth.uid, "email");

  return NextResponse.json({ ok: true, id: messageId });
}
