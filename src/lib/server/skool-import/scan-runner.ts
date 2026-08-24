import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Cookie } from "playwright-core";
import type { SkoolSession } from "./skool-session";
import { CookieSeededHeadlessTransport, triggerSkoolEmailVerification } from "./headless-browser";
import { fetchSkoolPageProps } from "./skool-client";
import { extractAllMembers, extractAllPosts, extractCommentsForPost } from "./skool-extract";
import { splitCategoryLabel } from "./mapping";
import type { SkoolScanResult } from "./scan-store";

/**
 * One function per scan phase, each a REAL extraction against the real
 * authenticated session — nothing here duplicates skool-client.ts/
 * skool-extract.ts, it only orchestrates them and normalizes the result
 * into scan-store.ts's shape. Every function returns a plain Firestore
 * dot-path patch (never writes directly) so the QStash step route
 * (scan/step/route.ts) stays the one place that touches Firestore and
 * decides what runs next — same separation the GHL importer's step route
 * already uses.
 *
 * Comments is the one phase genuinely batched/resumable (see
 * runCommentsBatch) — every other phase does its real work in a single
 * pass because, at the sizes this importer has actually been proven
 * against (Magnetic Visibility: 68 members, ~120 posts), each comfortably
 * fits one serverless invocation. Documented, not hidden, as a scaling
 * limit for very large communities — see the Scan report.
 */

function session(cookies: Cookie[]): SkoolSession {
  return { transport: new CookieSeededHeadlessTransport(cookies) };
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
  const props = await fetchSkoolPageProps(`https://www.skool.com/${groupSlug}`, session(cookies));
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
}

export interface MembersPhaseResult {
  patch: Record<string, unknown>;
}

export async function runMembersPhase(cookies: Cookie[], groupSlug: string): Promise<MembersPhaseResult> {
  const members = await extractAllMembers(groupSlug, session(cookies));
  const active = members.filter((m) => m.membershipTab === "active").length;
  const churned = members.length - active;
  const emailResolvedCount = members.filter((m) => m.email).length;
  const membersWithPointData = members.filter((m) => m.points !== null).length;

  return {
    patch: {
      members: {
        totalDiscovered: members.length,
        emailResolvedCount,
        byStatus: { active, churned },
      },
      "phases.members": {
        status: "complete",
        detail: `${members.length} member${members.length === 1 ? "" : "s"}`,
        message: null,
      },
      points: { membersWithPointData },
      "phases.points": {
        status: "complete",
        detail:
          membersWithPointData > 0 ? `${membersWithPointData} with point data` : "No point data found",
        message: null,
      },
    },
  };
}

export interface PostsPhaseResult {
  patch: Record<string, unknown>;
  commentQueue: { postId: string; shortId: string }[];
}

export async function runPostsPhase(
  cookies: Cookie[],
  groupSlug: string,
  categoriesById: Record<string, string>,
): Promise<PostsPhaseResult> {
  const categories = new Map(Object.entries(categoriesById));
  const posts = await extractAllPosts(groupSlug, session(cookies), categories);

  const pinnedIds = posts.filter((p) => p.pinned).map((p) => p.skoolPostId);
  let imageCount = 0;
  let videoDeferredCount = 0;
  for (const p of posts) {
    for (const a of p.attachments) {
      if (a.kind === "image") imageCount += 1;
      if (a.kind === "video") videoDeferredCount += 1;
    }
  }

  const commentQueue = posts
    .filter((p) => p.shortId)
    .map((p) => ({ postId: p.skoolPostId, shortId: p.shortId }));
  const warnings: string[] = [];
  const missingShortId = posts.length - commentQueue.length;
  if (missingShortId > 0) {
    warnings.push(`${missingShortId} post${missingShortId === 1 ? "" : "s"} have no recoverable comment id.`);
  }

  return {
    commentQueue,
    patch: {
      content: {
        uniquePostCount: posts.length,
        commentCount: 0,
        mentionCount: 0,
      },
      "phases.posts": {
        status: "complete",
        detail: `${posts.length} post${posts.length === 1 ? "" : "s"}`,
        message: null,
      },
      pinned: { count: pinnedIds.length, sourcePostIds: pinnedIds },
      "phases.pinned": {
        status: "complete",
        detail: `${pinnedIds.length} pinned`,
        message: null,
      },
      attachments: { imageCount, voiceCount: 0, fileCount: 0, videoDeferredCount },
      "_internal.commentQueue": commentQueue,
      ...(warnings.length > 0 ? { warnings: FieldValue.arrayUnion(...warnings) } : {}),
    },
  };
}

const COMMENTS_BATCH_SIZE = 15;

export interface CommentsBatchResult {
  patch: Record<string, unknown>;
  done: boolean;
}

/**
 * The one genuinely resumable phase — processes a bounded batch of posts'
 * comment threads per call and reports how far it got, so the step route
 * can re-enqueue a continuation instead of assuming one request can walk
 * every post in one shot (unsafe for a large community — see the Scan
 * report's execution-model section).
 */
export async function runCommentsBatch(
  cookies: Cookie[],
  skoolGroupId: string,
  queue: { postId: string; shortId: string }[],
  cursor: number,
  runningTotals: { commentCount: number; imageCount: number; voiceCount: number; fileCount: number },
): Promise<CommentsBatchResult> {
  const batch = queue.slice(cursor, cursor + COMMENTS_BATCH_SIZE);
  const s = session(cookies);

  let commentCount = 0;
  let imageCount = 0;
  let voiceCount = 0;
  let fileCount = 0;
  const failedPostIds: string[] = [];

  for (const item of batch) {
    try {
      const comments = await extractCommentsForPost(item.postId, item.shortId, skoolGroupId, s);
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
