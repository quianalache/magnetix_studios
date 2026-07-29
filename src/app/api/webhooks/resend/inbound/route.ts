import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getResend } from "@/lib/comms/resend";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Resend inbound-email webhook — the `email.received` event. Every
 * sub-account's dedicated Resend sending domain also receives by default
 * (see `createSendingDomain`/`getSendingDomain` in resend-domains.ts), so
 * any mail sent to that domain lands here and gets dropped into the same
 * unified Conversations inbox SMS/WhatsApp/Meta already use.
 *
 * Contact matching policy (explicit product decision, not an oversight):
 *   - Sender matches an existing contact (by email, scoped to the resolved
 *     sub-account) → message goes on their thread.
 *   - No match → a new contact IS created (so the message has somewhere to
 *     live and shows up in the inbox), but stamped `emailOptedOut: true` and
 *     `source: "email"`. They never consented to being on an email list by
 *     virtue of mail arriving at this address, so this must never silently
 *     enroll them in broadcasts/automations — no `contact.created` webhook
 *     or workflow trigger fires for this path (unlike the normal contact
 *     create service), specifically to keep it inert beyond just being
 *     visible in the inbox.
 *
 * The webhook payload only carries metadata (from/to/subject) — the body
 * requires a follow-up call to Resend's Receiving API, same two-step shape
 * as Twilio's inbound SMS validate-then-fetch pattern.
 *
 * Always returns 200 once the signature is valid, even when nothing matches
 * a configured domain — Resend retries on non-2xx and there's nothing to
 * recover by retrying an unroutable address.
 */

interface ReceivedEmailEventData {
  email_id: string;
  from: string;
  to: string[];
  subject: string;
}

function extractEmail(raw: string): string {
  // Headers commonly arrive as `"Name" <addr@host>` — pull just the address.
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

function extractName(raw: string): string {
  const m = raw.match(/^"?([^"<]*?)"?\s*<[^>]+>$/);
  const name = m?.[1]?.trim();
  return name || extractEmail(raw);
}

function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

async function resolveSubAccountByReceivingDomain(
  toAddresses: string[],
): Promise<{ subAccountId: string; agencyId: string } | null> {
  const db = getAdminDb();
  const domains = [...new Set(toAddresses.map((a) => domainOf(extractEmail(a))))].filter(
    Boolean,
  );
  for (const domain of domains) {
    const snap = await db
      .collection("subAccounts")
      .where("resendConfig.domainName", "==", domain)
      .where("resendConfig.status", "==", "verified")
      .limit(1)
      .get();
    if (!snap.empty) {
      const sa = snap.docs[0].data() as SubAccountDoc;
      return { subAccountId: snap.docs[0].id, agencyId: sa.agencyId };
    }
  }
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[resend/inbound] RESEND_WEBHOOK_SECRET not set — dropping");
    return NextResponse.json({ ok: true });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn("[resend/inbound] missing svix-* headers");
    return new NextResponse("Missing signature headers", { status: 403 });
  }

  let event: { type: string; data: unknown };
  try {
    event = getResend().webhooks.verify({
      payload: rawBody,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret: secret,
    }) as { type: string; data: unknown };
  } catch (err) {
    console.warn("[resend/inbound] signature verification failed", err);
    return new NextResponse("Invalid signature", { status: 403 });
  }

  if (event.type !== "email.received") {
    // Any other subscribed event type (delivery/bounce/etc.) — ack and ignore.
    return NextResponse.json({ ok: true });
  }

  const data = event.data as ReceivedEmailEventData;
  const route = await resolveSubAccountByReceivingDomain(data.to ?? []);
  if (!route) {
    console.warn(
      `[resend/inbound] email to ${(data.to ?? []).join(",")} matched no verified sub-account domain — dropping`,
    );
    return NextResponse.json({ ok: true });
  }

  // Metadata-only payload — fetch the full email for its body.
  const { data: full, error: fetchError } = await getResend().emails.receiving.get(
    data.email_id,
  );
  if (fetchError || !full) {
    console.warn("[resend/inbound] receiving.get failed", fetchError);
    return NextResponse.json({ ok: true });
  }

  const fromEmail = extractEmail(full.from);
  const fromName = extractName(full.from);
  const subject = full.subject || "(no subject)";
  const body = full.text || full.html?.replace(/<[^>]+>/g, " ").trim() || "";

  const db = getAdminDb();
  const contactQuery = await db
    .collection("contacts")
    .where("subAccountId", "==", route.subAccountId)
    .where("email", "==", fromEmail)
    .limit(1)
    .get();

  let contactId: string;
  let contactName: string;
  if (!contactQuery.empty) {
    const doc = contactQuery.docs[0];
    contactId = doc.id;
    contactName = (doc.data().name as string | undefined) || fromName;
  } else {
    // Deliberately bypasses createContactServerSide — see the route doc
    // comment. No contact.created webhook/workflow for this path.
    const ref = db.collection("contacts").doc();
    await ref.set({
      name: fromName,
      email: fromEmail,
      phone: "",
      company: "",
      address: "",
      source: "email",
      tags: [],
      pipelineStage: null,
      attribution: null,
      emailOptedOut: true,
      smsOptedOut: true,
      countryCode: null,
      country: null,
      city: null,
      lat: null,
      lng: null,
      territoryId: GLOBAL_TERRITORY_ID,
      agencyId: route.agencyId,
      subAccountId: route.subAccountId,
      createdByUid: "resend-inbound",
      mode: "live",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    contactId = ref.id;
    contactName = fromName;
  }

  await db
    .collection("contacts")
    .doc(contactId)
    .collection("emailMessages")
    .doc(data.email_id)
    .set(
      {
        agencyId: route.agencyId,
        subAccountId: route.subAccountId,
        contactId,
        direction: "inbound",
        status: "received",
        body,
        subject,
        from: fromEmail,
        to: (data.to ?? []).map(extractEmail).join(", "),
        resendEmailId: data.email_id,
        twilioMessageSid: null,
        sentByUid: null,
        error: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }, // Resend retries on non-2xx → idempotent on email_id
    );

  await upsertConversationForMessage({
    contactId,
    subAccountId: route.subAccountId,
    agencyId: route.agencyId,
    contactName,
    contactPhone: null,
    channel: "email",
    direction: "inbound",
    body: `${subject}\n${body}`,
  });

  return NextResponse.json({ ok: true });
}
