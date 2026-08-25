import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Cookie } from "playwright-core";
import type { SkoolSession } from "./skool-session";
import { CookieSeededHeadlessTransport, triggerSkoolEmailVerification } from "./headless-browser";
import { fetchSkoolPageProps, fetchSkoolFeedPage } from "./skool-client";
import { extractEmailFromRawMember, extractCommentsForPost } from "./skool-extract";
import { splitCategoryLabel } from "./mapping";
import type { SkoolScanResult } from "./scan-store";

/**
 * One function per scan phase (or one BATCH within a phase, for the three
 * phases too large to safely finish in one QStash invocation — Members,
 * Posts, Comments), each a REAL extraction against the real authenticated
 * session. Every function returns a plain Firestore dot-path patch (never
 * writes directly) so the QStash step route (scan/step/route.ts) stays the
 * one place that touches Firestore and decides what runs next — same
 * separation the GHL importer's step route already uses.
 *
 * Browser lifecycle (see headless-browser.ts's CookieSeededHeadlessTransport
 * doc comment for the full "why"): every function below creates exactly ONE
 * transport instance and closes it in a `finally` before returning — one
 * Chromium process per QStash step, no matter how many individual Skool
 * fetches that step makes internally. This replaced a fresh-browser-per-fetch
 * design that real production evidence proved unsafe (`spawn ETXTBSY`,
 * "browser has been closed") the moment a phase made more than a couple of
 * calls — see docs/debug/skool-connect-diagnostic.md for the Connect-side
 * half of that same underlying lesson.
 *
 * Members and Posts are checkpointed/batched (bounded work per QStash call,
 * durable cursor persisted in `_internal`, idempotent on retry) for the same
 * reason Comments already was: this is a self-service importer for
 * communities of unknown size, not just the ~68-member/~125-post source it
 * was proven against — an all-or-nothing phase would eventually exceed
 * Vercel's `maxDuration` (or just take an unreasonably long single request)
 * for a large enough community.
 */

function newTransport(cookies: Cookie[]): CookieSeededHeadlessTransport {
  return new CookieSeededHeadlessTransport(cookies);
}

interface RawCurrentGroupLabel {
  id: string;
  metadata: {
    color?: string;
    displayName?: string;
    postWriteRole?: number;
    posts?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface RawCurrentGroup {
  id: string;
  name: string;
  metadata?: {
    displayName?: string;
    description?: string;
    logoUrl?: string;
    numCourses?: number;
    numDraftCourses?: number;
  };
  labels?: RawCurrentGroupLabel[];
}

export interface CommunityPhaseResult {
  patch: Record<string, unknown>;
  skoolGroupId: string;
  categoriesById: Record<string, string>;
}

/**
 * Community + Categories + Classroom-detection in ONE fetch — all three
 * are already present in the ordinary feed page's own `currentGroup`
 * (confirmed live, see the Scan report), so there is no reason to spend
 * three separate phase-worth of network calls getting them.
 */
export async function runCommunityPhase(
  cookies: Cookie[],
  groupSlug: string,
): Promise<CommunityPhaseResult> {
  const transport = newTransport(cookies);
  try {
    const session: SkoolSession = { transport };
    const props = await fetchSkoolPageProps(`https://www.skool.com/${groupSlug}`, session);
    const cg = props.currentGroup as RawCurrentGroup | undefined;
    if (!cg) throw new Error("currentGroup missing from Skool feed page response");

    const community = {
      name: cg.name,
      displayName: cg.metadata?.displayName?.trim() || cg.name,
      sourceGroupId: cg.id,
      slug: groupSlug,
      description: cg.metadata?.description?.trim() || null,
      logoUrl: cg.metadata?.logoUrl ?? null,
    };

    const rawLabels = cg.labels ?? [];
    const categoriesById: Record<string, string> = {};
    const categoryItems = rawLabels.map((label, i) => {
      const split = splitCategoryLabel(label.metadata.displayName ?? "");
      categoriesById[label.id] = split.name;
      return {
        id: label.id,
        name: split.name,
        icon: split.icon,
        color: label.metadata.color ?? null,
        postWriteRole: label.metadata.postWriteRole ?? null,
        postCount: label.metadata.posts ?? null,
        order: i,
        createdAtIso: label.createdAt ?? null,
        updatedAtIso: label.updatedAt ?? null,
      };
    });

    const numCourses = cg.metadata?.numCourses ?? 0;

    return {
      skoolGroupId: cg.id,
      categoriesById,
      patch: {
        community,
        "phases.community": { status: "complete", detail: community.displayName, message: null },
        categories: { count: categoryItems.length, items: categoryItems },
        "phases.categories": {
          status: "complete",
          detail: `${categoryItems.length} channel${categoryItems.length === 1 ? "" : "s"}`,
          message: null,
        },
        classroom: { detected: numCourses > 0, courseCount: numCourses },
        "phases.classroom": {
          status: "complete",
          detail: numCourses > 0 ? `${numCourses} course${numCourses === 1 ? "" : "s"} detected` : "None detected",
          message: null,
        },
      },
    };
  } finally {
    await transport.close();
  }
}

// ---------------------------------------------------------------------------
// Members — batched per membership tab, one QStash step advances a bounded
// number of (tab, page) fetches, not the whole membership list at once.
// ---------------------------------------------------------------------------

/** Total (tab, page) fetches per QStash step. Deliberately modest — each
 *  fetch is now cheap (one page in an already-running shared browser, not a
 *  fresh Chromium launch), so this is chosen for safety headroom under
 *  `maxDuration`, not because more wouldn't fit. Not sized to any one
 *  community — a larger one just takes more steps, exactly the point of
 *  checkpointing. */
const MEMBERS_BATCH_SIZE = 8;

type MembershipTab = "active" | "churned" | "cancelling" | "banned";
const MEMBERSHIP_TABS: MembershipTab[] = ["active", "churned", "cancelling", "banned"];

type MemberTabsState = SkoolScanResult["_internal"]["memberTabsState"];
type MemberRecords = SkoolScanResult["_internal"]["memberRecords"];

/** Matches skool-extract.ts's own (unexported) `RawMemberUser` shape — just
 *  the fields this batch actually reads (email-recovery fields for
 *  `extractEmailFromRawMember`, plus `spData` for point-data detection). */
interface RawMemberUserLean {
  id: string;
  name: string;
  email?: string;
  metadata?: { spData?: string };
  member?: { metadata?: { mbme?: string; survey?: string } };
}

function initialMemberTabsState(): NonNullable<MemberTabsState> {
  return {
    active: { nextPage: 1, totalPages: null, done: false },
    churned: { nextPage: 1, totalPages: null, done: false },
    cancelling: { nextPage: 1, totalPages: null, done: false },
    banned: { nextPage: 1, totalPages: null, done: false },
  };
}

export interface MembersBatchResult {
  patch: Record<string, unknown>;
  done: boolean;
}

export async function runMembersBatch(
  cookies: Cookie[],
  groupSlug: string,
  tabsStateIn: MemberTabsState,
  recordsIn: MemberRecords,
): Promise<MembersBatchResult> {
  const transport = newTransport(cookies);
  try {
    const session: SkoolSession = { transport };
    const tabsState = tabsStateIn ? { ...tabsStateIn } : initialMemberTabsState();
    const records: MemberRecords = { ...recordsIn };

    let fetchesUsed = 0;
    for (const tab of MEMBERSHIP_TABS) {
      if (fetchesUsed >= MEMBERS_BATCH_SIZE) break;
      const st = tabsState[tab];
      if (st.done) continue;

      const tabQuery = tab === "active" ? "" : `t=${tab}`;
      const params = [tabQuery, st.nextPage > 1 ? `p=${st.nextPage}` : ""].filter(Boolean).join("&");
      const url = `https://www.skool.com/${groupSlug}/-/members${params ? `?${params}` : ""}`;
      const props = await fetchSkoolPageProps(url, session);
      fetchesUsed += 1;

      const users = (Array.isArray(props.users) ? props.users : []) as RawMemberUserLean[];
      if (users.length === 0) {
        tabsState[tab] = { ...st, done: true };
        continue;
      }

      for (const u of users) {
        const hasEmail = !!extractEmailFromRawMember(u);
        let hasPointData = false;
        if (u.metadata?.spData) {
          try {
            const sp = JSON.parse(u.metadata.spData) as { pts?: number };
            hasPointData = typeof sp.pts === "number";
          } catch {
            hasPointData = false;
          }
        }
        const status: "active" | "churned" = tab === "active" ? "active" : "churned";
        const existing = records[u.id];
        // "active" wins on a tab collision — matches the pre-batching
        // dedupe rule (the tabs are meant to be disjoint; this is a safety
        // net, not the expected path).
        if (!existing || status === "active") {
          records[u.id] = { status, hasEmail, hasPointData };
        }
      }

      const totalPages = typeof props.totalPages === "number" ? props.totalPages : 1;
      if (st.nextPage >= totalPages) {
        tabsState[tab] = { ...st, totalPages, done: true };
      } else {
        tabsState[tab] = { ...st, totalPages, nextPage: st.nextPage + 1 };
      }
    }

    const allDone = MEMBERSHIP_TABS.every((t) => tabsState[t].done);
    const totalDiscovered = Object.keys(records).length;
    const emailResolvedCount = Object.values(records).filter((r) => r.hasEmail).length;
    const activeCount = Object.values(records).filter((r) => r.status === "active").length;
    const churnedCount = totalDiscovered - activeCount;
    const membersWithPointData = Object.values(records).filter((r) => r.hasPointData).length;

    const patch: Record<string, unknown> = {
      "_internal.memberTabsState": tabsState,
      "_internal.memberRecords": records,
    };

    if (allDone) {
      patch.members = {
        totalDiscovered,
        emailResolvedCount,
        byStatus: { active: activeCount, churned: churnedCount },
      };
      patch["phases.members"] = {
        status: "complete",
        detail: `${totalDiscovered} member${totalDiscovered === 1 ? "" : "s"}`,
        message: null,
      };
      patch.points = { membersWithPointData };
      patch["phases.points"] = {
        status: "complete",
        detail: membersWithPointData > 0 ? `${membersWithPointData} with point data` : "No point data found",
        message: null,
      };
    } else {
      patch["phases.members"] = {
        status: "scanning",
        detail: `${totalDiscovered} found so far`,
        message: null,
      };
    }

    return { patch, done: allDone };
  } finally {
    await transport.close();
  }
}

// ---------------------------------------------------------------------------
// Posts — batched by feed page, same checkpoint idea as Members.
// ---------------------------------------------------------------------------

const POSTS_BATCH_SIZE = 10;

interface RawFeedPostLean {
  id: string;
  labelId?: string;
  metadata: {
    pinned?: number | boolean;
    videoIds?: string;
    imagePreview?: string;
    lastCommentId?: string;
  };
}

function parsePinnedFlag(v: number | boolean | undefined): boolean {
  return v === 1 || v === true;
}

type PostsById = SkoolScanResult["_internal"]["postsById"];

export interface PostsBatchResult {
  patch: Record<string, unknown>;
  done: boolean;
  /** Only set once `done` — the full comment queue built from every
   *  discovered post, handed to the step route to seed the Comments phase. */
  commentQueue?: { postId: string; shortId: string }[];
}

export async function runPostsBatch(
  cookies: Cookie[],
  groupSlug: string,
  nextPageIn: number,
  totalIn: number | null,
  postsByIdIn: PostsById,
): Promise<PostsBatchResult> {
  const transport = newTransport(cookies);
  try {
    const session: SkoolSession = { transport };
    const postsById: PostsById = { ...postsByIdIn };
    let page = nextPageIn;
    let total = totalIn;
    let pagesFetched = 0;
    let sawEmptyPage = false;

    while (pagesFetched < POSTS_BATCH_SIZE) {
      const { postTrees, total: pageTotal } = await fetchSkoolFeedPage(groupSlug, page, session);
      pagesFetched += 1;
      if (total === null) total = pageTotal;
      if (postTrees.length === 0) {
        sawEmptyPage = true;
        break;
      }
      for (const tree of postTrees as { post?: RawFeedPostLean }[]) {
        if (!tree.post) continue;
        const p = tree.post;
        const pinnedHere = parsePinnedFlag(p.metadata.pinned);
        const existing = postsById[p.id];
        postsById[p.id] = {
          // A pinned post's second natural-order occurrence can report
          // `pinned: undefined` — once true from ANY occurrence, stays
          // true, regardless of processing order or which batch saw it.
          pinned: pinnedHere || existing?.pinned || false,
          hasImage: !!p.metadata.imagePreview,
          hasVideo: !!p.metadata.videoIds,
          shortId: p.metadata.lastCommentId?.slice(0, 8) ?? existing?.shortId ?? "",
        };
      }
      page += 1;
      const discovered = Object.keys(postsById).length;
      if (total !== null && discovered >= total) break;
      if (page > 500) break; // sanity guard against an unexpected response shape
    }

    const discovered = Object.keys(postsById).length;
    const done = sawEmptyPage || (total !== null && discovered >= total) || page > 500;

    const patch: Record<string, unknown> = {
      "_internal.postsNextPage": page,
      "_internal.postsTotal": total,
      "_internal.postsById": postsById,
    };

    if (!done) {
      patch["phases.posts"] = {
        status: "scanning",
        detail: `${discovered} found so far`,
        message: null,
      };
      return { patch, done: false };
    }

    const values = Object.values(postsById);
    const pinnedCount = values.filter((p) => p.pinned).length;
    const imageCount = values.filter((p) => p.hasImage).length;
    const videoDeferredCount = values.filter((p) => p.hasVideo).length;
    const commentQueue = Object.entries(postsById)
      .filter(([, p]) => p.shortId)
      .map(([postId, p]) => ({ postId, shortId: p.shortId }));
    const missingShortId = discovered - commentQueue.length;
    const warnings: string[] = [];
    if (missingShortId > 0) {
      warnings.push(`${missingShortId} post${missingShortId === 1 ? "" : "s"} have no recoverable comment id.`);
    }

    patch.content = { uniquePostCount: discovered, commentCount: 0, mentionCount: 0 };
    patch["phases.posts"] = { status: "complete", detail: `${discovered} post${discovered === 1 ? "" : "s"}`, message: null };
    patch.pinned = { count: pinnedCount, sourcePostIds: Object.entries(postsById).filter(([, p]) => p.pinned).map(([id]) => id) };
    patch["phases.pinned"] = { status: "complete", detail: `${pinnedCount} pinned`, message: null };
    patch.attachments = { imageCount, voiceCount: 0, fileCount: 0, videoDeferredCount };
    patch["_internal.commentQueue"] = commentQueue;
    if (warnings.length > 0) patch.warnings = FieldValue.arrayUnion(...warnings);

    return { patch, done: true, commentQueue };
  } finally {
    await transport.close();
  }
}

const COMMENTS_BATCH_SIZE = 15;

export interface CommentsBatchResult {
  patch: Record<string, unknown>;
  done: boolean;
}

/**
 * The other genuinely resumable phase — processes a bounded batch of posts'
 * comment threads per call and reports how far it got, so the step route
 * can re-enqueue a continuation instead of assuming one request can walk
 * every post in one shot.
 */
export async function runCommentsBatch(
  cookies: Cookie[],
  skoolGroupId: string,
  queue: { postId: string; shortId: string }[],
  cursor: number,
  runningTotals: { commentCount: number; imageCount: number; voiceCount: number; fileCount: number },
): Promise<CommentsBatchResult> {
  const batch = queue.slice(cursor, cursor + COMMENTS_BATCH_SIZE);
  const transport = newTransport(cookies);

  let commentCount = 0;
  let imageCount = 0;
  let voiceCount = 0;
  let fileCount = 0;
  const failedPostIds: string[] = [];

  try {
    const session: SkoolSession = { transport };
    for (const item of batch) {
      try {
        const comments = await extractCommentsForPost(item.postId, item.shortId, skoolGroupId, session);
        commentCount += comments.length;
        for (const c of comments) {
          for (const a of c.attachments) {
            if (a.kind === "image") imageCount += 1;
            else if (a.kind === "voice") voiceCount += 1;
            else if (a.kind === "file") fileCount += 1;
          }
        }
      } catch {
        failedPostIds.push(item.postId);
      }
    }
  } finally {
    await transport.close();
  }

  const nextCursor = cursor + batch.length;
  const done = nextCursor >= queue.length;
  const newCommentTotal = runningTotals.commentCount + commentCount;

  return {
    done,
    patch: {
      "content.commentCount": newCommentTotal,
      "attachments.imageCount": runningTotals.imageCount + imageCount,
      "attachments.voiceCount": runningTotals.voiceCount + voiceCount,
      "attachments.fileCount": runningTotals.fileCount + fileCount,
      "_internal.commentsCursorIndex": nextCursor,
      "phases.comments": {
        status: done ? "complete" : "scanning",
        detail: `${nextCursor} / ${queue.length} posts`,
        message: null,
      },
      "phases.attachments": {
        status: done ? "complete" : "scanning",
        detail: null,
        message: null,
      },
      ...(failedPostIds.length > 0
        ? { warnings: FieldValue.arrayUnion(`Comments failed to load for ${failedPostIds.length} post(s).`) }
        : {}),
    },
  };
}

export interface FinalizeResult {
  patch: Record<string, unknown>;
}

export async function runFinalize(
  cookies: Cookie[],
  groupSlug: string,
  members: SkoolScanResult["members"],
  alreadyInitiated: boolean,
): Promise<FinalizeResult> {
  const needsVerification = !!members && members.emailResolvedCount < members.totalDiscovered;

  if (!needsVerification) {
    return {
      patch: {
        status: "complete",
        "phases.finalize": { status: "complete", detail: "Ready for preview", message: null },
      },
    };
  }

  if (alreadyInitiated) {
    // Verification was already kicked off by an earlier finalize attempt
    // (e.g. a retried step) — never re-trigger, that invalidates the code
    // Skool already sent.
    return {
      patch: {
        status: "awaiting_verification",
        "phases.finalize": { status: "complete", detail: "Awaiting email verification", message: null },
      },
    };
  }

  const result = await triggerSkoolEmailVerification(cookies, groupSlug);
  return {
    patch: {
      status: "awaiting_verification",
      verificationInitiatedAt: FieldValue.serverTimestamp(),
      "phases.finalize": {
        status: "complete",
        detail: result.alreadyVerified ? "Emails already verified" : "Verification email sent",
        message: result.ok ? null : "Couldn't start email verification automatically.",
      },
    },
  };
}
