import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import type {
  BroadcastAudienceFilter,
  BroadcastContent,
  BroadcastDoc,
} from "@/types";

export const dynamic = "force-dynamic";

interface DraftSaveBody {
  broadcastId?: string;
  subAccountId?: string;
  subject?: string;
  preheader?: string | null;
  content?: BroadcastContent;
  audienceFilter?: BroadcastAudienceFilter;
  sourceTemplateId?: string | null;
  testMode?: boolean;
  testRecipientIds?: string[];
  /** Stale-write guard — see BroadcastDoc.lastSaveSessionId's doc comment. */
  sessionId?: string;
  clientSeq?: number;
}

/**
 * Persistent Broadcast Drafts V1 (2026-08-27) — create-or-update a draft.
 * `broadcastId` is client-generated (the SAME id already used for
 * draftId-scoped image uploads — see upload-image.ts — so a draft's
 * uploaded images never need to move/rename when the doc is created).
 *
 * Autosave only ever writes `status: "draft"`. It refuses to touch a
 * broadcast that has already been launched (queued/sending/completed/
 * failed/cancelled) — that would mean resurrecting a real send back into
 * an editable state, which is exactly what "Failed Send vs Draft" this
 * feature was told to keep separate.
 */
export async function POST(request: Request) {
  let payload: DraftSaveBody;
  try {
    payload = (await request.json()) as DraftSaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const broadcastId = payload.broadcastId?.trim();
  const subAccountId = payload.subAccountId?.trim();
  const subject = payload.subject ?? "";
  const preheader = payload.preheader?.trim() || null;
  const content = payload.content;
  const audienceFilter = payload.audienceFilter;
  const sourceTemplateId = payload.sourceTemplateId?.trim() || null;
  const testMode = payload.testMode === true;
  const testRecipientIds = Array.isArray(payload.testRecipientIds)
    ? payload.testRecipientIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const sessionId = payload.sessionId?.trim();
  const clientSeq = payload.clientSeq;

  if (!broadcastId || !subAccountId || !content || !audienceFilter || !sessionId || typeof clientSeq !== "number") {
    return NextResponse.json(
      { error: "broadcastId, subAccountId, content, audienceFilter, sessionId, and clientSeq are required" },
      { status: 400 },
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(broadcastId)) {
    return NextResponse.json({ error: "Invalid broadcastId" }, { status: 400 });
  }
  if (!Array.isArray(content.blocks)) {
    return NextResponse.json({ error: "content.blocks must be an array" }, { status: 400 });
  }
  if (
    audienceFilter.kind !== "all" &&
    audienceFilter.kind !== "tag" &&
    audienceFilter.kind !== "pipeline_stage" &&
    audienceFilter.kind !== "conditions"
  ) {
    return NextResponse.json({ error: "Invalid audienceFilter" }, { status: 400 });
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(broadcastRef);

    if (snap.exists) {
      const existing = snap.data() as BroadcastDoc;
      if (existing.subAccountId !== subAccountId) {
        return { kind: "forbidden" as const };
      }
      if (existing.status !== "draft") {
        return { kind: "not_a_draft" as const };
      }
      // Stale-write guard — only reject a write from the SAME session with
      // a seq that's not newer. A different session (another tab) always
      // wins; see BroadcastDoc.lastSaveSessionId's doc comment for why
      // that's an accepted V1 tradeoff rather than real conflict resolution.
      if (
        existing.lastSaveSessionId === sessionId &&
        typeof existing.lastSaveSeq === "number" &&
        clientSeq <= existing.lastSaveSeq
      ) {
        return { kind: "stale" as const };
      }
      tx.update(broadcastRef, {
        subject,
        subjectPreview: subject.slice(0, 200),
        preheader,
        content,
        audienceFilter,
        sourceTemplateId,
        testMode,
        testRecipientContactIds: testMode ? testRecipientIds : null,
        lastSaveSessionId: sessionId,
        lastSaveSeq: clientSeq,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { kind: "updated" as const };
    }

    // Creating the draft doc for the first time — this IS the "first
    // meaningful edit" creation boundary; the composer only calls this
    // route once subject/content/audience has real content, so a briefly
    // opened, untouched composer never creates a doc at all.
    const subSnap = await tx.get(db.doc(`subAccounts/${subAccountId}`));
    if (!subSnap.exists) return { kind: "no_sub_account" as const };
    const agencyId = subSnap.data()?.agencyId as string;

    const doc: Omit<BroadcastDoc, "id"> = {
      agencyId,
      subAccountId,
      channel: "email",
      subjectPreview: subject.slice(0, 200),
      content,
      subject,
      preheader,
      sourceTemplateId,
      audienceFilter,
      status: "draft",
      totals: {
        audienceSize: 0,
        queued: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        complained: 0,
      },
      createdByUid: access.uid,
      createdBy: { displayName: access.email, email: access.email },
      createdAt: FieldValue.serverTimestamp() as unknown as null,
      updatedAt: FieldValue.serverTimestamp() as unknown as null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      testMode,
      testRecipientContactIds: testMode ? testRecipientIds : null,
      confirmedAudienceSize: null,
      lastSaveSessionId: sessionId,
      lastSaveSeq: clientSeq,
    };
    tx.set(broadcastRef, { id: broadcastId, ...doc });
    return { kind: "created" as const };
  });

  if (result.kind === "forbidden") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.kind === "no_sub_account") {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  if (result.kind === "not_a_draft") {
    return NextResponse.json(
      { error: "This broadcast has already been sent and can no longer be edited as a draft." },
      { status: 409 },
    );
  }
  if (result.kind === "stale") {
    return NextResponse.json({ ok: true, ignored: "stale" });
  }

  // Best-effort display-name upgrade — the first save writes the caller's
  // email as createdBy.displayName (cheaper than an admin-auth lookup on
  // every debounced autosave tick); refine it once, off the hot path.
  if (result.kind === "created") {
    getAdminAuth()
      .getUser(access.uid)
      .then((u) => {
        if (u.displayName) {
          broadcastRef.update({ "createdBy.displayName": u.displayName }).catch(() => {});
        }
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, created: result.kind === "created" });
}
