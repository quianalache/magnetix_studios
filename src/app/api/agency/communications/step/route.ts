import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { qstashIsConfigured, verifyQStashSignature } from "@/lib/automations/qstash";
import { sendEmail, emailIsConfigured } from "@/lib/comms/resend";
import { buildAgencyUnsubscribeUrl } from "@/lib/automations/agency-unsubscribe-token";
import { buildListUnsubscribeHeaders } from "@/lib/broadcasts/compliance";
import {
  renderBroadcastEmailDocumentHtml,
  renderBroadcastEmailDocumentText,
} from "@/lib/broadcasts/render-email";
import { emailDocumentFromBroadcast } from "@/lib/email/adapters";
import { resolveCustomBrand, resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAgencyRecipientPreference } from "@/lib/server/agency-recipient-preferences-service";
import type { AgencyCommunicationDoc, AgencyCommunicationSendDoc } from "@/types/agency-communications";

export const dynamic = "force-dynamic";

interface StepBody {
  communicationId?: string;
  recipientId?: string;
}

/**
 * Per-recipient Agency Communications send — the agency-scope sibling of
 * /api/broadcasts/email/step. Same QStash-driven, idempotent, per-row
 * pattern; the real differences are (1) `sendEmail` (shared platform
 * sender) instead of `sendTenantEmail` — see this route's own module
 * context in the Agency Communications build task — and (2) the
 * unsubscribe-link mailto target and business branding come from
 * `resolveCustomBrand()`/`EMAIL_FROM`, never a sub-account.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash is not configured on this deployment." }, { status: 503 });
  }
  if (!emailIsConfigured()) {
    return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Upstash-Signature header" }, { status: 401 });
  }
  const rawBody = await request.text();
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: StepBody;
  try {
    payload = JSON.parse(rawBody) as StepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const communicationId = payload.communicationId;
  const recipientId = payload.recipientId;
  if (typeof communicationId !== "string" || typeof recipientId !== "string") {
    return NextResponse.json({ error: "Body must include communicationId (string) and recipientId (string)" }, { status: 400 });
  }

  const db = getAdminDb();
  // Exactly one agency per deployment — no ambiguity resolving the parent
  // path from a bare communicationId.
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ ok: true, ignored: "no_agency" });

  const communicationRef = db.doc(`agencies/${agencyId}/communications/${communicationId}`);
  const sendRef = communicationRef.collection("sends").doc(recipientId);

  const [communicationSnap, sendSnap] = await Promise.all([communicationRef.get(), sendRef.get()]);
  if (!communicationSnap.exists || !sendSnap.exists) {
    return NextResponse.json({ ok: true, ignored: "missing" });
  }
  const communication = communicationSnap.data() as AgencyCommunicationDoc;
  const send = sendSnap.data() as AgencyCommunicationSendDoc;

  if (send.status !== "queued") {
    return NextResponse.json({ ok: true, ignored: "already_settled" });
  }
  if (communication.status === "cancelled" || communication.status === "failed") {
    await markSkipped(sendRef, communicationRef, "cancelled");
    return NextResponse.json({ ok: true, ignored: communication.status });
  }

  // Live opt-out re-check — the operator or a bounce/complaint could have
  // suppressed this recipient after fan-out.
  const pref = await getAgencyRecipientPreference(agencyId, send.recipientEmail);
  if (pref?.emailOptedOut) {
    await markSkipped(sendRef, communicationRef, "opted_out");
    await maybeMarkCompleted(communicationRef);
    return NextResponse.json({ ok: true, status: "skipped" });
  }
  if (!send.recipientEmail) {
    await markSkipped(sendRef, communicationRef, "no_email");
    await maybeMarkCompleted(communicationRef);
    return NextResponse.json({ ok: true, status: "skipped" });
  }
  if (!communication.content || !communication.subject) {
    await markFailed(sendRef, communicationRef, "This communication has no renderable content.");
    await maybeMarkCompleted(communicationRef);
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const brand = await resolveCustomBrand();
  const unsubscribeLink = buildAgencyUnsubscribeUrl(send.recipientEmail);
  const renderOpts = { unsubscribeUrl: unsubscribeLink, mailingAddress: "", businessName: brand.name };
  const emailDocument = communication.emailDocument ?? emailDocumentFromBroadcast(communication.content, communication.subject, communication.preheader ?? null);
  const html = renderBroadcastEmailDocumentHtml(emailDocument, renderOpts);
  const text = renderBroadcastEmailDocumentText(emailDocument, renderOpts);

  const rawFrom = process.env.EMAIL_FROM ?? "";
  const mailtoMatch = rawFrom.match(/<([^>]+)>/);
  const mailto = mailtoMatch ? mailtoMatch[1] : rawFrom;
  const unsubscribeHeaders = mailto ? buildListUnsubscribeHeaders(unsubscribeLink, mailto) : undefined;

  let resendMessageId: string | null = null;
  let error: string | null = null;
  try {
    const result = await sendEmail({
      to: send.recipientEmail,
      subject: communication.subject || "(no subject)",
      text,
      html,
      headers: unsubscribeHeaders,
    });
    resendMessageId = result.id;
  } catch (err) {
    error = err instanceof Error ? err.message : "Send failed";
  }

  if (resendMessageId) {
    await sendRef.update({
      status: "sent",
      resendMessageId,
      sentAt: FieldValue.serverTimestamp(),
      attempts: FieldValue.increment(1),
    });
    await communicationRef.update({
      "totals.sent": FieldValue.increment(1),
      "totals.queued": FieldValue.increment(-1),
      ...(communication.status === "queued" ? { status: "sending", startedAt: FieldValue.serverTimestamp() } : {}),
    });
  } else {
    await sendRef.update({
      status: "failed",
      error: error ?? "unknown",
      sentAt: Timestamp.now(),
      attempts: FieldValue.increment(1),
    });
    await communicationRef.update({
      "totals.failed": FieldValue.increment(1),
      "totals.queued": FieldValue.increment(-1),
      ...(communication.status === "queued" ? { status: "sending", startedAt: FieldValue.serverTimestamp() } : {}),
    });
  }

  await maybeMarkCompleted(communicationRef);
  return NextResponse.json({ ok: true });
}

async function markSkipped(
  sendRef: FirebaseFirestore.DocumentReference,
  communicationRef: FirebaseFirestore.DocumentReference,
  reason: "opted_out" | "no_email" | "recipient_missing" | "cancelled",
): Promise<void> {
  await sendRef.update({
    status: "skipped",
    skippedReason: reason,
    sentAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
  });
  await communicationRef.update({
    "totals.skipped": FieldValue.increment(1),
    "totals.queued": FieldValue.increment(-1),
  });
}

async function markFailed(
  sendRef: FirebaseFirestore.DocumentReference,
  communicationRef: FirebaseFirestore.DocumentReference,
  errorMessage: string,
): Promise<void> {
  await sendRef.update({
    status: "failed",
    error: errorMessage,
    sentAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
  });
  await communicationRef.update({
    "totals.failed": FieldValue.increment(1),
    "totals.queued": FieldValue.increment(-1),
  });
}

async function maybeMarkCompleted(communicationRef: FirebaseFirestore.DocumentReference): Promise<void> {
  await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(communicationRef);
    if (!snap.exists) return;
    const data = snap.data() as AgencyCommunicationDoc;
    if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") return;
    if ((data.totals?.queued ?? 0) <= 0) {
      tx.update(communicationRef, { status: "completed", completedAt: FieldValue.serverTimestamp() });
    }
  });
}
