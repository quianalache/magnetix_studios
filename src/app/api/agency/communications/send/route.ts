import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { emailIsConfigured } from "@/lib/comms/resend";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { emailDocumentFromBroadcast } from "@/lib/email/adapters";
import { resolveAgencyAudience } from "@/lib/server/agency-communications-audience-service";
import { getAgencyRecipientPreference } from "@/lib/server/agency-recipient-preferences-service";
import type {
  AgencyAudienceSource,
  AgencyCommunicationDoc,
  AgencyCommunicationSendDoc,
} from "@/types/agency-communications";
import type { BroadcastContent } from "@/types/broadcast-content";

export const dynamic = "force-dynamic";

interface SendBody {
  content?: BroadcastContent;
  subject?: string;
  preheader?: string | null;
  audienceSources?: AgencyAudienceSource[];
  sourceTemplateId?: string | null;
  confirmedAudienceSize?: number;
  draftId?: string;
}

/** Same rate/cap constants as tenant Broadcasts — see that route's own
 *  doc comment for the reasoning. */
const SEND_RATE_PER_SECOND = 5;
const DELAY_BETWEEN_SENDS_MS = 1000 / SEND_RATE_PER_SECOND;
const MAX_AUDIENCE_SIZE = 25_000;

export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    return NextResponse.json({ error: "Email is not configured on this deployment." }, { status: 503 });
  }
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash is not configured — bulk send needs the queue." }, { status: 503 });
  }

  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const agencyId = caller.agencyId!;

  let payload: SendBody;
  try {
    payload = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = payload.content;
  const subject = payload.subject?.trim();
  const preheader = payload.preheader?.trim() || null;
  const audienceSources = Array.isArray(payload.audienceSources) ? payload.audienceSources : [];
  const sourceTemplateId = payload.sourceTemplateId?.trim() || null;
  const confirmedAudienceSize = payload.confirmedAudienceSize;
  const draftId = payload.draftId?.trim() || null;

  if (!content || !subject || audienceSources.length === 0) {
    return NextResponse.json({ error: "content, subject, and at least one audience source are required" }, { status: 400 });
  }
  if (!Array.isArray(content.blocks) || content.blocks.length === 0) {
    return NextResponse.json({ error: "content must have at least one block" }, { status: 400 });
  }
  if (typeof confirmedAudienceSize !== "number") {
    return NextResponse.json({ error: "confirmedAudienceSize is required — review the audience count before sending." }, { status: 400 });
  }

  const db = getAdminDb();

  const resolved = await resolveAgencyAudience(agencyId, audienceSources);
  const recipients: { email: string; name: string; matchedSources: string[]; identity: { kind: "person" | "staffUser"; id: string } }[] = [];
  const skipped: { email: string; name: string; matchedSources: string[]; identity: { kind: "person" | "staffUser"; id: string } }[] = [];
  for (const r of resolved) {
    const pref = await getAgencyRecipientPreference(agencyId, r.email);
    if (pref?.emailOptedOut) {
      skipped.push(r);
    } else {
      recipients.push(r);
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Audience is empty after pre-flight (no recipients match, or all are opted out).", skipped: skipped.length },
      { status: 400 },
    );
  }
  if (recipients.length > MAX_AUDIENCE_SIZE) {
    return NextResponse.json(
      { error: `Audience size ${recipients.length} exceeds the per-communication cap of ${MAX_AUDIENCE_SIZE}. Narrow your audience and try again.` },
      { status: 400 },
    );
  }
  if (recipients.length !== confirmedAudienceSize) {
    return NextResponse.json(
      {
        error: `Audience changed since you reviewed it (you confirmed ${confirmedAudienceSize}, it's now ${recipients.length}). Refresh the preview and confirm again.`,
        code: "AUDIENCE_CHANGED",
        currentAudienceSize: recipients.length,
      },
      { status: 409 },
    );
  }

  let createdByName = caller.email ?? "";
  try {
    const u = await getAdminAuth().getUser(caller.uid);
    createdByName = u.displayName || u.email || createdByName;
  } catch {
    // Fall through with whatever we already have.
  }

  let communicationRef = db.collection(`agencies/${agencyId}/communications`).doc();
  let originalCreatedAt: AgencyCommunicationDoc["createdAt"] = FieldValue.serverTimestamp() as unknown as null;
  let originalCreatedByUid = caller.uid;
  let originalCreatedBy = { displayName: createdByName, email: caller.email ?? "" };
  if (draftId) {
    const draftSnap = await db.collection(`agencies/${agencyId}/communications`).doc(draftId).get();
    if (draftSnap.exists) {
      const draft = draftSnap.data() as AgencyCommunicationDoc;
      if (draft.status === "draft") {
        communicationRef = draftSnap.ref;
        originalCreatedAt = draft.createdAt;
        originalCreatedByUid = draft.createdByUid || caller.uid;
        originalCreatedBy = draft.createdBy || originalCreatedBy;
      }
    }
  }

  const communication: Omit<AgencyCommunicationDoc, "id"> = {
    agencyId,
    subjectPreview: subject.slice(0, 200),
    content,
    emailDocument: emailDocumentFromBroadcast(content, subject, preheader),
    subject,
    preheader,
    sourceTemplateId,
    audienceSources,
    status: "queued",
    totals: {
      audienceSize: recipients.length + skipped.length,
      queued: recipients.length,
      sent: 0,
      skipped: skipped.length,
      failed: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
    },
    createdByUid: originalCreatedByUid,
    createdBy: originalCreatedBy,
    createdAt: originalCreatedAt,
    updatedAt: FieldValue.serverTimestamp() as unknown as null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    confirmedAudienceSize,
  };
  await communicationRef.set({ id: communicationRef.id, ...communication });

  const sendsCol = communicationRef.collection("sends");
  for (let i = 0; i < recipients.length; i += 500) {
    const slice = recipients.slice(i, i + 500);
    const batch = db.batch();
    for (const r of slice) {
      const sendRef = sendsCol.doc(r.email);
      const sendDoc: Omit<AgencyCommunicationSendDoc, "id"> = {
        communicationId: communicationRef.id,
        agencyId,
        recipientEmail: r.email,
        recipientName: r.name,
        matchedSources: r.matchedSources,
        identity: r.identity,
        status: "queued",
        skippedReason: null,
        resendMessageId: null,
        error: null,
        attempts: 0,
        queuedAt: FieldValue.serverTimestamp() as unknown as null,
        sentAt: null,
        engagement: null,
      };
      batch.set(sendRef, { id: r.email, ...sendDoc });
    }
    await batch.commit();
  }
  for (let i = 0; i < skipped.length; i += 500) {
    const slice = skipped.slice(i, i + 500);
    const batch = db.batch();
    for (const r of slice) {
      const sendRef = sendsCol.doc(r.email);
      const sendDoc: Omit<AgencyCommunicationSendDoc, "id"> = {
        communicationId: communicationRef.id,
        agencyId,
        recipientEmail: r.email,
        recipientName: r.name,
        matchedSources: r.matchedSources,
        identity: r.identity,
        status: "skipped",
        skippedReason: "opted_out",
        resendMessageId: null,
        error: null,
        attempts: 0,
        queuedAt: FieldValue.serverTimestamp() as unknown as null,
        sentAt: FieldValue.serverTimestamp() as unknown as null,
        engagement: null,
      };
      batch.set(sendRef, { id: r.email, ...sendDoc });
    }
    await batch.commit();
  }

  let queuedCount = 0;
  let publishFailures = 0;
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const delayMs = i * DELAY_BETWEEN_SENDS_MS;
    const result = await publishCallback({
      pathname: "/api/agency/communications/step",
      body: { communicationId: communicationRef.id, recipientId: r.email },
      delaySeconds: Math.ceil(delayMs / 1000),
      deduplicationId: `agencycomm_${communicationRef.id}_${r.email}`,
    });
    if (result) queuedCount += 1;
    else publishFailures += 1;
  }

  if (queuedCount === 0 && publishFailures > 0) {
    await communicationRef.update({
      status: "failed",
      errorMessage: "Every QStash publish failed. Check NEXT_PUBLIC_APP_URL.",
      completedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ error: "Failed to schedule any sends. Check QStash configuration." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    communicationId: communicationRef.id,
    queued: queuedCount,
    skipped: skipped.length,
    publishFailures,
  });
}
