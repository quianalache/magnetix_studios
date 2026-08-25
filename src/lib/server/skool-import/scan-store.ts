import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Scan result — the durable, normalized output of Step 2 (Scan), keyed 1:1
 * by the Step 1 `importSessionId` (see session-store.ts). Lives in its own
 * top-level collection (not nested under the session doc) for the same
 * reason `importJobs`/`skoolImportCheckpoints` are top-level elsewhere in
 * this codebase — simple doc-id lookups, no composite-index risk.
 *
 * Deliberately holds NORMALIZED counts/summaries, not raw Skool payloads —
 * the one exception is `_internal.commentQueue`, a compact list of
 * {postId, shortId} pairs (two short strings per post, not post bodies)
 * needed to make the comments phase genuinely resumable across separate
 * QStash-invoked requests, since nothing survives in memory between them.
 */

const COLLECTION = "skoolScanResults";

export type ScanPhaseKey =
  | "community"
  | "categories"
  | "members"
  | "posts"
  | "comments"
  | "attachments"
  | "points"
  | "pinned"
  | "classroom"
  | "finalize";

export type ScanPhaseStatus = "pending" | "scanning" | "complete" | "warning" | "error";

export interface ScanPhase {
  status: ScanPhaseStatus;
  /** Short human-readable count, e.g. "5 channels", "87 / 120 posts". Set
   *  only once real data is known — never a placeholder/fabricated value. */
  detail: string | null;
  message: string | null;
}

export type ScanStatus = "scanning" | "awaiting_verification" | "complete" | "cancelled" | "failed";

/** Why a scan stopped with `status: "failed"` — kept distinct so the UI can
 *  offer the right recovery action (Retry scan vs. Reconnect to Skool)
 *  instead of one generic dead end. `message` is always sanitized/user-safe
 *  — never a raw Playwright error, ETXTBSY, stack trace, or anything that
 *  could reveal cookies/internal endpoints. */
export interface ScanFailure {
  phase: ScanPhaseKey | null;
  reason: "session-expired" | "phase-error";
  message: string;
  retryable: boolean;
}

export interface ScanCommunityResult {
  name: string;
  displayName: string;
  sourceGroupId: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

export interface ScanCategoryItem {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  postWriteRole: number | null;
  postCount: number | null;
  order: number;
  createdAtIso: string | null;
  updatedAtIso: string | null;
}

export interface ScanMembersResult {
  totalDiscovered: number;
  emailResolvedCount: number;
  byStatus: { active: number; churned: number };
}

export interface ScanContentResult {
  uniquePostCount: number;
  commentCount: number;
  mentionCount: number;
}

export interface ScanAttachmentsResult {
  imageCount: number;
  voiceCount: number;
  fileCount: number;
  videoDeferredCount: number;
}

export interface ScanPointsResult {
  membersWithPointData: number;
}

export interface ScanPinnedResult {
  count: number;
  sourcePostIds: string[];
}

export interface ScanClassroomResult {
  detected: boolean;
  courseCount: number | null;
}

export interface SkoolScanResult {
  id: string;
  importSessionId: string;
  subAccountId: string;
  groupId: string;
  status: ScanStatus;
  phases: Record<ScanPhaseKey, ScanPhase>;
  community: ScanCommunityResult | null;
  categories: { count: number; items: ScanCategoryItem[] } | null;
  members: ScanMembersResult | null;
  content: ScanContentResult | null;
  attachments: ScanAttachmentsResult | null;
  points: ScanPointsResult | null;
  pinned: ScanPinnedResult | null;
  classroom: ScanClassroomResult | null;
  warnings: string[];
  verificationInitiatedAt: Timestamp | null;
  /** Set only when `status === "failed"`. */
  failure: ScanFailure | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Not exposed to the client — see `toPublic`. */
  _internal: {
    skoolGroupId: string | null;
    skoolGroupSlug: string;
    categoriesById: Record<string, string>;
    commentQueue: { postId: string; shortId: string }[];
    commentsCursorIndex: number;
    /** Consecutive failures of the CURRENTLY in-flight phase — reset to 0
     *  every time a phase successfully advances. Lets scan/step give up on
     *  a genuinely broken phase (writing a real `failed` status) instead of
     *  retrying forever with QStash, while still tolerating ordinary
     *  transient hiccups. */
    phaseRetryCount: number;
    /** Members — batched/checkpointed per membership tab so an arbitrarily
     *  large community's member list never has to be fetched in one
     *  all-or-nothing QStash step. `memberRecords` is deliberately lean
     *  (no name/bio/etc — just what's needed to compute the final public
     *  summary counts + dedupe a member appearing in more than one tab,
     *  "active" winning on collision, matching the pre-batching behavior). */
    memberTabsState: Record<
      "active" | "churned" | "cancelling" | "banned",
      { nextPage: number; totalPages: number | null; done: boolean }
    > | null;
    memberRecords: Record<string, { status: "active" | "churned"; hasEmail: boolean; hasPointData: boolean }>;
    /** Posts — same batching idea, one page-cursor instead of per-tab
     *  cursors. `postsById` stays lean for the same reason: enough to
     *  finalize aggregate counts AND build the comment queue, not full
     *  post bodies. */
    postsNextPage: number;
    postsTotal: number | null;
    postsById: Record<string, { pinned: boolean; hasImage: boolean; hasVideo: boolean; shortId: string }>;
  };
}

export type PublicSkoolScanResult = Omit<SkoolScanResult, "_internal">;

function emptyPhase(): ScanPhase {
  return { status: "pending", detail: null, message: null };
}

export function emptyPhases(): Record<ScanPhaseKey, ScanPhase> {
  return {
    community: emptyPhase(),
    categories: emptyPhase(),
    members: emptyPhase(),
    posts: emptyPhase(),
    comments: emptyPhase(),
    attachments: emptyPhase(),
    points: emptyPhase(),
    pinned: emptyPhase(),
    classroom: emptyPhase(),
    finalize: emptyPhase(),
  };
}

function col() {
  return getAdminDb().collection(COLLECTION);
}

function toPublic(doc: SkoolScanResult): PublicSkoolScanResult {
  return {
    id: doc.id,
    importSessionId: doc.importSessionId,
    subAccountId: doc.subAccountId,
    groupId: doc.groupId,
    status: doc.status,
    phases: doc.phases,
    community: doc.community,
    categories: doc.categories,
    members: doc.members,
    content: doc.content,
    attachments: doc.attachments,
    points: doc.points,
    pinned: doc.pinned,
    classroom: doc.classroom,
    warnings: doc.warnings,
    verificationInitiatedAt: doc.verificationInitiatedAt,
    failure: doc.failure,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createScanResult(opts: {
  importSessionId: string;
  subAccountId: string;
  groupId: string;
  skoolGroupSlug: string;
}): Promise<void> {
  const ref = col().doc(opts.importSessionId);
  const now = FieldValue.serverTimestamp();
  const doc: Omit<SkoolScanResult, "id" | "createdAt" | "updatedAt"> & {
    createdAt: FieldValue;
    updatedAt: FieldValue;
  } = {
    importSessionId: opts.importSessionId,
    subAccountId: opts.subAccountId,
    groupId: opts.groupId,
    status: "scanning",
    phases: emptyPhases(),
    community: null,
    categories: null,
    members: null,
    content: null,
    attachments: null,
    points: null,
    pinned: null,
    classroom: null,
    warnings: [],
    verificationInitiatedAt: null,
    failure: null,
    createdAt: now,
    updatedAt: now,
    _internal: {
      skoolGroupId: null,
      skoolGroupSlug: opts.skoolGroupSlug,
      categoriesById: {},
      commentQueue: [],
      commentsCursorIndex: 0,
      phaseRetryCount: 0,
      memberTabsState: null,
      memberRecords: {},
      postsNextPage: 1,
      postsTotal: null,
      postsById: {},
    },
  };
  await ref.set(doc);
}

/** Server-internal — includes `_internal`. Used only by the QStash step route. */
export async function getScanResultInternal(importSessionId: string): Promise<SkoolScanResult | null> {
  const snap = await col().doc(importSessionId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<SkoolScanResult, "id">) };
}

/** Client-facing read — scoped to (subAccountId, groupId), strips `_internal`. */
export async function getScanResult(
  subAccountId: string,
  groupId: string,
  importSessionId: string,
): Promise<PublicSkoolScanResult | null> {
  const snap = await col().doc(importSessionId).get();
  if (!snap.exists) return null;
  const doc = { id: snap.id, ...(snap.data() as Omit<SkoolScanResult, "id">) };
  if (doc.subAccountId !== subAccountId || doc.groupId !== groupId) return null;
  return toPublic(doc);
}

export async function updateScanResult(
  importSessionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await col()
    .doc(importSessionId)
    .update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
}

export async function deleteScanResult(
  subAccountId: string,
  groupId: string,
  importSessionId: string,
): Promise<void> {
  const ref = col().doc(importSessionId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as SkoolScanResult;
  if (data.subAccountId !== subAccountId || data.groupId !== groupId) return;
  await ref.delete();
}
