import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { emailIsConfigured } from "@/lib/comms/resend";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { resolveAudience } from "@/lib/broadcasts/audience";
import {
  requireMailingAddress,
  MissingMailingAddressError,
} from "@/lib/broadcasts/compliance";
import type {
  BroadcastAudienceFilter,
  BroadcastContent,
  BroadcastDoc,
  BroadcastSendDoc,
} from "@/types";

export const dynamic = "force-dynamic";

interface SendBody {
  subAccountId?: string;
  content?: BroadcastContent;
  subject?: string;
  preheader?: string | null;
  audienceFilter?: BroadcastAudienceFilter;
  sourceTemplateId?: string | null;
  /** Production safety controls (2026-08-26) — Broadcast Test Mode. */
  testMode?: boolean;
  testRecipientIds?: string[];
  /**
   * The recipient count the operator saw and confirmed in the UI
   * immediately before clicking Send. Required on every request — the
   * server recomputes the audience from scratch and rejects (409) if it
   * doesn't match, rather than ever queuing against a client's possibly
   * stale preview. See the "hard audience count consistency check" below.
   */
  confirmedAudienceSize?: number;
  /**
   * Persistent Broadcast Drafts V1 (2026-08-27) — when the operator is
   * sending a broadcast that started life as a saved draft, this is that
   * draft's own Firestore doc id. The send route reuses the SAME doc
   * (status draft → queued in place) instead of creating a second one —
   * see the "Send from draft" handling below. Omitted entirely for a
   * broadcast sent without ever going through the draft-autosave path.
   */
  draftId?: string;
}

/**
 * QStash fan-out throttle. We send at 5 messages/sec by default — well
 * under Resend's free-tier 10 req/sec API cap, leaving headroom for
 * concurrent one-off sends from the contact-profile UI. Each recipient gets
 * its own delayed QStash message; the batch fully drains in roughly
 * (audienceSize / SEND_RATE) seconds.
 *
 * 200ms × 50,000 = 10,000s ≈ 2h47m. Acceptable for an MVP — Resend's
 * Broadcasts API would beat us at scale, but per-contact merge-tag
 * rendering is the main reason we picked the fan-out route.
 */
const SEND_RATE_PER_SECOND = 5;
const DELAY_BETWEEN_SENDS_MS = 1000 / SEND_RATE_PER_SECOND;

/** Hard cap on per-broadcast audience size to prevent runaway sends. */
const MAX_AUDIENCE_SIZE = 25_000;

export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment." },
      { status: 503 },
    );
  }
  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "QStash is not configured — bulk send needs the queue." },
      { status: 503 },
    );
  }

  let payload: SendBody;
  try {
    payload = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = payload.subAccountId?.trim();
  const content = payload.content;
  const subject = payload.subject?.trim();
  const preheader = payload.preheader?.trim() || null;
  const audienceFilter = payload.audienceFilter;
  const sourceTemplateId = payload.sourceTemplateId?.trim() || null;
  const testMode = payload.testMode === true;
  const requestedTestRecipientIds = Array.isArray(payload.testRecipientIds)
    ? payload.testRecipientIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const confirmedAudienceSize = payload.confirmedAudienceSize;
  const draftId = payload.draftId?.trim() || null;

  if (!subAccountId || !content || !subject || !audienceFilter) {
    return NextResponse.json(
      { error: "subAccountId, content, subject, and audienceFilter are required" },
      { status: 400 },
    );
  }
  if (typeof confirmedAudienceSize !== "number") {
    return NextResponse.json(
      {
        error:
          "confirmedAudienceSize is required — review the audience count in the UI before sending.",
      },
      { status: 400 },
    );
  }
  if (testMode && requestedTestRecipientIds.length === 0) {
    return NextResponse.json(
      { error: "Test Mode requires at least one test recipient." },
      { status: 400 },
    );
  }
  if (!Array.isArray(content.blocks) || content.blocks.length === 0) {
    return NextResponse.json(
      { error: "content must have at least one block" },
      { status: 400 },
    );
  }
  if (
    audienceFilter.kind !== "all" &&
    audienceFilter.kind !== "tag" &&
    audienceFilter.kind !== "pipeline_stage" &&
    audienceFilter.kind !== "conditions"
  ) {
    return NextResponse.json(
      { error: "audienceFilter.kind must be 'all', 'tag', 'pipeline_stage', or 'conditions'" },
      { status: 400 },
    );
  }
  if (
    audienceFilter.kind === "conditions" &&
    (!audienceFilter.group || !Array.isArray(audienceFilter.group.all))
  ) {
    return NextResponse.json(
      { error: "audienceFilter.group.all must be an array" },
      { status: 400 },
    );
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();

  // Agency-level gate. Sub-account admins can't bypass — the field is
  // server-set via the agency owner's Manage dialog. Default-deny on
  // missing field so legacy sub-accounts stay locked until the agency
  // owner explicitly enables broadcasts.
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  if (subSnap.data()?.broadcastsEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "Broadcasts are disabled for this sub-account. Your agency administrator can enable them from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }

  // CAN-SPAM requires a physical mailing address in every marketing email —
  // checked here (batch-level, not per-recipient) so a broadcast can't even
  // start without one. See src/lib/broadcasts/compliance.ts.
  try {
    requireMailingAddress(subSnap.data());
  } catch (err) {
    if (err instanceof MissingMailingAddressError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // Test Mode allowlist — verify every requested id is a real contact that
  // actually belongs to THIS sub-account before it's trusted as the
  // allowlist. Never trust client-supplied ids blindly, even for a
  // safety feature: a stale/forged id list should just narrow the
  // audience further, not silently include something out of scope.
  let verifiedTestRecipientIds: string[] | null = null;
  if (testMode) {
    const snaps = await Promise.all(
      requestedTestRecipientIds.map((id) => db.doc(`contacts/${id}`).get()),
    );
    verifiedTestRecipientIds = snaps
      .filter((s) => s.exists && s.data()?.subAccountId === subAccountId)
      .map((s) => s.id);
    if (verifiedTestRecipientIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "None of the requested test recipients are valid contacts in this sub-account.",
        },
        { status: 400 },
      );
    }
  }

  // Resolve audience. A scoped collaborator only reaches contacts in
  // their assigned territories; admins / owners / scoping-off pass null.
  // In Test Mode, resolveAudience ALSO intersects with the verified
  // allowlist server-side — see its own doc comment — so no recipient
  // outside the allowlist can ever be queued, regardless of how broad
  // audienceFilter resolves.
  const scope = await loadEffectiveTerritoryScope(access);
  const audience = await resolveAudience(
    subAccountId,
    audienceFilter,
    scope.enforce ? (scope.ids ?? []) : null,
    verifiedTestRecipientIds,
  );
  if (audience.recipients.length === 0) {
    return NextResponse.json(
      {
        error: testMode
          ? "No test recipients match this audience filter (or they're opted out / missing an email)."
          : "Audience is empty after pre-flight (no contacts match, or all are opted-out / missing email).",
        skipped: audience.skipped.length,
      },
      { status: 400 },
    );
  }
  if (audience.recipients.length > MAX_AUDIENCE_SIZE) {
    return NextResponse.json(
      {
        error: `Audience size ${audience.recipients.length} exceeds the per-broadcast cap of ${MAX_AUDIENCE_SIZE}. Narrow the filter and try again.`,
      },
      { status: 400 },
    );
  }

  // Hard audience count consistency check (2026-08-26) — the count the
  // operator confirmed in the UI must match what we just computed
  // server-side, or we refuse to queue anything. Catches both a stale
  // client preview (contacts changed between preview and click) and any
  // future UI bug that could show one number and send to another. The
  // operator has to re-preview and re-confirm rather than the send
  // silently going out against a number nobody actually reviewed.
  if (audience.recipients.length !== confirmedAudienceSize) {
    return NextResponse.json(
      {
        error: `Audience changed since you reviewed it (you confirmed ${confirmedAudienceSize}, it's now ${audience.recipients.length}). Refresh the preview and confirm again.`,
        code: "AUDIENCE_CHANGED",
        currentAudienceSize: audience.recipients.length,
      },
      { status: 409 },
    );
  }

  // Snapshot the trigger user's display name for the broadcast doc.
  let createdByName = access.email;
  try {
    const u = await getAdminAuth().getUser(access.uid);
    createdByName = u.displayName || u.email || access.email;
  } catch {
    // Fall through with the email as the display name.
  }

  const agencyId = subSnap.data()?.agencyId as string;

  // Persistent Broadcast Drafts V1 (2026-08-27) — "Send from draft" reuses
  // the SAME Firestore doc (status draft → queued in place) instead of
  // creating a second one, so the draft's own images/uploads (scoped by
  // this same id — see upload-image.ts) never need to move, and the
  // Broadcasts list never shows a stray leftover draft next to the real
  // send. Falls back to a brand-new doc (today's behavior, unchanged) if
  // no draftId was given, the draft vanished, or it's already been
  // launched by another tab — never blocks the send over it.
  let broadcastRef = db.collection("broadcasts").doc();
  let originalCreatedAt: BroadcastDoc["createdAt"] = FieldValue.serverTimestamp() as unknown as null;
  let originalCreatedByUid = access.uid;
  let originalCreatedBy = { displayName: createdByName, email: access.email };
  if (draftId) {
    const draftSnap = await db.collection("broadcasts").doc(draftId).get();
    if (draftSnap.exists) {
      const draft = draftSnap.data() as BroadcastDoc;
      if (draft.subAccountId === subAccountId && draft.status === "draft") {
        broadcastRef = draftSnap.ref;
        originalCreatedAt = draft.createdAt;
        originalCreatedByUid = draft.createdByUid || access.uid;
        originalCreatedBy = draft.createdBy || originalCreatedBy;
      }
      // If it exists but isn't a draft (or belongs to a different
      // sub-account), silently fall through to a fresh doc rather than
      // erroring the send — the operator's content is still in `content`/
      // `subject` from the composer either way.
    }
  }

  const broadcast: Omit<BroadcastDoc, "id"> = {
    agencyId,
    subAccountId,
    channel: "email",
    subjectPreview: subject.slice(0, 200),
    content,
    subject,
    preheader,
    sourceTemplateId,
    audienceFilter,
    status: "queued",
    totals: {
      audienceSize: audience.recipients.length + audience.skipped.length,
      queued: audience.recipients.length,
      sent: 0,
      skipped: audience.skipped.length,
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
    testMode,
    testRecipientContactIds: verifiedTestRecipientIds,
    confirmedAudienceSize,
  };
  await broadcastRef.set({ id: broadcastRef.id, ...broadcast });

  // Write the per-send rows for recipients (in 500-doc batches — Firestore's
  // hard limit is 500 ops per batch).
  const sendsCol = broadcastRef.collection("sends");
  const recipientsToQueue = audience.recipients;
  for (let i = 0; i < recipientsToQueue.length; i += 500) {
    const slice = recipientsToQueue.slice(i, i + 500);
    const batch = db.batch();
    for (const contact of slice) {
      const sendRef = sendsCol.doc(contact.id);
      const sendDoc: Omit<BroadcastSendDoc, "id"> = {
        broadcastId: broadcastRef.id,
        agencyId,
        subAccountId,
        contactId: contact.id,
        toEmail: contact.email,
        toName: contact.name,
        status: "queued",
        skippedReason: null,
        resendMessageId: null,
        error: null,
        attempts: 0,
        queuedAt: FieldValue.serverTimestamp() as unknown as null,
        sentAt: null,
        engagement: null,
      };
      batch.set(sendRef, { id: contact.id, ...sendDoc });
    }
    await batch.commit();
  }

  // Also write a row per skipped contact so the detail page shows them with
  // their reason. These are terminal — no QStash callback fires.
  const skippedToWrite = audience.skipped;
  for (let i = 0; i < skippedToWrite.length; i += 500) {
    const slice = skippedToWrite.slice(i, i + 500);
    const batch = db.batch();
    for (const { contact, reason } of slice) {
      const sendRef = sendsCol.doc(contact.id);
      const sendDoc: Omit<BroadcastSendDoc, "id"> = {
        broadcastId: broadcastRef.id,
        agencyId,
        subAccountId,
        contactId: contact.id,
        toEmail: contact.email,
        toName: contact.name,
        status: "skipped",
        skippedReason: reason,
        resendMessageId: null,
        error: null,
        attempts: 0,
        queuedAt: FieldValue.serverTimestamp() as unknown as null,
        sentAt: FieldValue.serverTimestamp() as unknown as null,
        engagement: null,
      };
      batch.set(sendRef, { id: contact.id, ...sendDoc });
    }
    await batch.commit();
  }

  // Fan out to QStash — one message per recipient, staggered to honor our
  // 5/sec rate. Each callback POSTs /api/broadcasts/email/step with the
  // broadcastId + contactId; the step route does the actual Resend call.
  let queuedCount = 0;
  let publishFailures = 0;
  for (let i = 0; i < recipientsToQueue.length; i++) {
    const contact = recipientsToQueue[i];
    const delayMs = i * DELAY_BETWEEN_SENDS_MS;
    const result = await publishCallback({
      pathname: "/api/broadcasts/email/step",
      body: { broadcastId: broadcastRef.id, contactId: contact.id },
      // QStash delay is in seconds — round up so two adjacent sends never
      // fire in the same second when the math floors to the same integer.
      delaySeconds: Math.ceil(delayMs / 1000),
      // Per-row dedup key — if the operator double-clicks Send and somehow
      // hits this route twice, the second batch's QStash publishes are
      // dropped at the QStash side rather than producing a duplicate send.
      deduplicationId: `bcast_${broadcastRef.id}_${contact.id}`,
    });
    if (result) {
      queuedCount += 1;
    } else {
      publishFailures += 1;
    }
  }

  // If every QStash publish failed (e.g. NEXT_PUBLIC_APP_URL misconfigured),
  // mark the broadcast failed so the UI shows the error rather than a
  // stuck-queued state. Partial-failures we tolerate: the row is queued in
  // Firestore and an operator can retry from the detail page in v2.
  if (queuedCount === 0 && publishFailures > 0) {
    await broadcastRef.update({
      status: "failed",
      errorMessage: "Every QStash publish failed. Check NEXT_PUBLIC_APP_URL.",
      completedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      { error: "Failed to schedule any sends. Check QStash configuration." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    broadcastId: broadcastRef.id,
    queued: queuedCount,
    skipped: audience.skipped.length,
    publishFailures,
  });
}
