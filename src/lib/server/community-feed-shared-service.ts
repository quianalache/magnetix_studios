import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  ownedAttachmentStoragePath,
  ownedAgencyAttachmentStoragePath,
} from "@/lib/community/attachment-provenance";
import {
  getInaccessibleChannelNames,
  getInaccessibleAgencyChannelNames,
} from "@/lib/server/community-channels-service";
import {
  communityGroupsRoot,
  type CommunityOwnerScope,
} from "@/lib/server/community-scope";
import type { CommunityPost, CommunityPoll, FeedPoll } from "@/types/community";
import type { MediaAttachment } from "@/types/media-attachment";

/**
 * Community Shared Architecture Phase 3 (2026-09-19) — the feed-domain
 * consolidation. Posts/comments/likes/polls in `community-feed-service.ts`
 * (tenant) and `community-agency-service.ts` (Agency) were audited in
 * full. Two genuine, disclosed structural differences meant a full
 * create/update/delete-post/comment merge was NOT attempted this phase
 * (see the Phase 3 report's "Behavior Differences Discovered" /
 * "Feed Domain Before/After" for the full reasoning):
 *
 *  1. Author denormalization strategy: tenant hydrates author name/avatar
 *     at READ time (`hydrateAuthors`, a Member+membership join, since a
 *     tenant Member can change their display name later); Agency
 *     denormalizes `authorDisplayName`/`authorAvatarUrl` directly onto the
 *     post/comment doc at WRITE time (`resolveAgencyAuthor` — "no Member
 *     doc to hydrate from later", see community-agency-service.ts's own
 *     module comment). Forcing one shape onto the other would mean either
 *     inventing a fake tenant Member-less hydration path or retrofitting
 *     Agency posts to carry a live join they were deliberately built
 *     without.
 *  2. Points-integration boundary: tenant's `createPostServerSide`/
 *     `createCommentServerSide`/`toggleLikeServerSide` call
 *     `awardPoints`/`revokePoints` directly (memberId IS the points/level
 *     doc id, no translation needed); Agency's equivalents don't — the
 *     API route layer does it instead, because Agency's post/comment/like
 *     identity space is the Person id, while points/level live on the
 *     roster DOC id, requiring an extra `getAgencyMembershipForPerson`
 *     translation the tenant side never needs. Preserved exactly (see
 *     agency-community-api's like/comment/post route handlers) — not
 *     moved into this shared layer, which has no Agency roster-lookup
 *     context of its own.
 *
 * What WAS consolidated below is everything genuinely identical modulo
 * scope/path: attachment-storage cleanup, comment thread-parent
 * resolution, feed/get-post channel-access filtering + ordering, like/
 * unlike mechanics (Firestore write only, no points), and poll voting.
 */

function postsColByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().collection(
    `${communityGroupsRoot(scope)}/${groupId}/posts`
  );
}

function commentsColByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  postId: string
) {
  return postsColByScope(scope, groupId).doc(postId).collection("comments");
}

/** Best-effort Storage cleanup for a deleted/edited post or comment's
 *  attachments — a Storage hiccup here must never block the Firestore
 *  write it accompanies. The only scope-specific piece is which owned-path
 *  resolver applies (each encodes a different Storage prefix). */
export async function deleteAttachmentStorageByScope(
  scope: CommunityOwnerScope,
  attachments: MediaAttachment[] | undefined
): Promise<void> {
  if (!attachments?.length) return;
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return;
  const bucket = getStorage().bucket(bucketName);
  const ownerId =
    scope.kind === "subAccount" ? scope.subAccountId : scope.agencyId;
  const resolvePath =
    scope.kind === "subAccount"
      ? ownedAttachmentStoragePath
      : ownedAgencyAttachmentStoragePath;
  await Promise.allSettled(
    attachments.map(async (a) => {
      const storagePath = resolvePath(a, ownerId);
      if (!storagePath) return;
      try {
        await bucket.file(storagePath).delete();
      } catch (err) {
        console.warn(
          "[community-feed-shared] attachment cleanup: object missing or already removed",
          err
        );
      }
    })
  );
}

/**
 * Resolve the EFFECTIVE parentId for a new comment, enforcing the
 * two-visual-level thread model at the data boundary: if `requestedParentId`
 * names a comment that is ITSELF a reply, the new comment attaches to that
 * reply's own top-level parent instead — "replying to a reply" always
 * lands in the same thread as a sibling reply, never a third indentation
 * level. Throws if the requested parent doesn't exist rather than
 * silently guessing.
 */
export async function resolveCommentParentIdByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  postId: string,
  requestedParentId: string | null | undefined
): Promise<string | null> {
  if (!requestedParentId) return null;
  const targetSnap = await commentsColByScope(scope, groupId, postId)
    .doc(requestedParentId)
    .get();
  if (!targetSnap.exists) {
    throw new Error("Comment not found");
  }
  const targetParentId = targetSnap.data()?.parentId as
    | string
    | null
    | undefined;
  return targetParentId ?? requestedParentId;
}

/**
 * List the feed: pinned first, then newest. `postLimit: null` means "no
 * cap" (Agency's pre-existing behavior — a full collection scan every
 * read, unchanged here; a genuine, disclosed scale difference from
 * tenant's own `limit` + supplementary pinned-post backfill query, not
 * something this architecture-only pass changes). Channel-access
 * filtering (private channel / private section) is enforced here — the
 * actual read layer, not just hiding the left-rail link — identically for
 * both scopes.
 */
export async function listFeedPostsByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  viewerIsModerator: boolean;
  category?: string | null;
  /** `null` = no cap (Agency's existing behavior); a number = tenant's
   *  existing `.limit()` + pinned-backfill behavior. */
  postLimit: number | null;
}): Promise<CommunityPost[]> {
  let posts: CommunityPost[];

  if (opts.postLimit === null) {
    const snap = await postsColByScope(opts.scope, opts.groupId).get();
    posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityPost);
  } else {
    const snap = await postsColByScope(opts.scope, opts.groupId)
      .orderBy("createdAt", "desc")
      .limit(opts.postLimit)
      .get();
    posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityPost);

    // A pinned post older than the limit window would otherwise silently
    // fall outside it and vanish from Featured Posts / channel pins.
    const alreadyIncluded = new Set(posts.map((p) => p.id));
    const [pinnedSnap, channelPinnedSnap] = await Promise.all([
      postsColByScope(opts.scope, opts.groupId)
        .where("pinned", "==", true)
        .get(),
      postsColByScope(opts.scope, opts.groupId)
        .where("pinnedToChannel", "==", true)
        .get(),
    ]);
    for (const d of [...pinnedSnap.docs, ...channelPinnedSnap.docs]) {
      if (!alreadyIncluded.has(d.id)) {
        posts.push({ id: d.id, ...(d.data() as Omit<CommunityPost, "id">) });
        alreadyIncluded.add(d.id);
      }
    }
  }

  if (opts.category && opts.category !== "All") {
    posts = posts.filter((p) => p.category === opts.category);
  }
  if (!opts.viewerIsModerator) {
    const inaccessible =
      opts.scope.kind === "subAccount"
        ? await getInaccessibleChannelNames({
            subAccountId: opts.scope.subAccountId,
            groupId: opts.groupId,
            isModerator: false,
          })
        : await getInaccessibleAgencyChannelNames({
            agencyId: opts.scope.agencyId,
            groupId: opts.groupId,
            isModerator: false,
          });
    if (inaccessible.size > 0) {
      posts = posts.filter((p) => !p.category || !inaccessible.has(p.category));
    }
  }

  posts.sort((a, b) => {
    const pinDelta = Number(b.pinned) - Number(a.pinned);
    if (pinDelta !== 0 || opts.postLimit !== null) return pinDelta;
    // Agency's unlimited read has no DB-level ordering (unlike tenant's
    // `.orderBy("createdAt", "desc")`) — sort newest-first here, exactly
    // matching `listAgencyFeed`'s own pre-existing in-JS sort.
    const am = a.createdAt as { toMillis?: () => number } | null;
    const bm = b.createdAt as { toMillis?: () => number } | null;
    return (bm?.toMillis?.() ?? 0) - (am?.toMillis?.() ?? 0);
  });

  return posts;
}

/** Single-post fetch with the same "must not be reachable by direct URL"
 *  channel-access enforcement as `listFeedPostsByScope`. */
export async function getFeedPostByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  postId: string;
  viewerIsModerator: boolean;
}): Promise<CommunityPost | null> {
  const snap = await postsColByScope(opts.scope, opts.groupId)
    .doc(opts.postId)
    .get();
  if (!snap.exists) return null;
  const post = { id: snap.id, ...(snap.data() as Omit<CommunityPost, "id">) };
  if (!opts.viewerIsModerator && post.category) {
    const inaccessible =
      opts.scope.kind === "subAccount"
        ? await getInaccessibleChannelNames({
            subAccountId: opts.scope.subAccountId,
            groupId: opts.groupId,
            isModerator: false,
          })
        : await getInaccessibleAgencyChannelNames({
            agencyId: opts.scope.agencyId,
            groupId: opts.groupId,
            isModerator: false,
          });
    if (inaccessible.has(post.category)) return null;
  }
  return post;
}

/**
 * Toggle a like on a post (or comment) — Firestore write ONLY, no points
 * integration (see this file's module comment for why that boundary stays
 * outside the shared core). Transactional so the like doc and the counter
 * can't drift. Throws "Not found" if the target doc doesn't exist —
 * previously only tenant's `toggleLikeServerSide` checked this explicitly;
 * Agency's `toggleAgencyPostLikeServerSide`/`toggleAgencyCommentLikeServerSide`
 * had no such check and would have thrown a raw, unhandled Firestore
 * `.update()`-on-missing-doc error instead. Consolidating onto the
 * explicit, already-correct tenant behavior here is a genuine correctness
 * fix (a clean error instead of an unhandled one), not a new business
 * rule — see the Phase 3 report.
 */
export async function toggleLikeByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  postId: string;
  commentId?: string;
  viewerId: string;
}): Promise<{ liked: boolean; authorId: string }> {
  const db = getAdminDb();
  const targetRef = opts.commentId
    ? commentsColByScope(opts.scope, opts.groupId, opts.postId).doc(
        opts.commentId
      )
    : postsColByScope(opts.scope, opts.groupId).doc(opts.postId);
  const likeRef = targetRef.collection("likes").doc(opts.viewerId);

  return db.runTransaction(async (tx) => {
    const [likeSnap, targetSnap] = await Promise.all([
      tx.get(likeRef),
      tx.get(targetRef),
    ]);
    if (!targetSnap.exists) throw new Error("Not found");
    const authorId = targetSnap.data()!.authorMemberId as string;

    if (likeSnap.exists) {
      tx.delete(likeRef);
      tx.update(targetRef, { likeCount: FieldValue.increment(-1) });
      return { liked: false, authorId };
    }

    tx.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
    tx.update(targetRef, { likeCount: FieldValue.increment(1) });
    return { liked: true, authorId };
  });
}

function toMillisOrNull(v: unknown): number | null {
  if (!v) return null;
  const m = v as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
  };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  return null;
}

/**
 * The ONE place a raw `CommunityPoll` doc becomes the viewer-safe
 * `FeedPoll` every read path sends to the client. Already scope-agnostic
 * (imported directly by both scopes before this phase — unchanged, just
 * relocated here alongside the rest of the shared feed/poll core so
 * `community-feed-service.ts`'s own re-export stays the tenant-facing
 * entry point).
 */
export function buildFeedPoll(
  poll: CommunityPoll,
  viewerVote: string[] | null,
  viewerIsModerator: boolean
): FeedPoll {
  const endsAtMs = toMillisOrNull(poll.endsAt);
  const closed = endsAtMs !== null && endsAtMs <= Date.now();
  const resultsVisible = poll.showResults || viewerIsModerator;
  return {
    options: poll.options,
    allowMultiple: poll.allowMultiple,
    showResults: poll.showResults,
    endsAtMs,
    closed,
    resultsVisible,
    optionCounts: resultsVisible ? poll.optionCounts : null,
    voterCount: resultsVisible ? poll.voterCount : null,
    viewerSelection: viewerVote ?? [],
    canManage: viewerIsModerator,
  };
}

/** Batch-read this viewer's own vote (if any) for each post that has a
 *  poll — one small doc per post per viewer, no aggregation query needed. */
export async function viewerPollVotesByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  postIdsWithPolls: string[],
  viewerId: string
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (postIdsWithPolls.length === 0) return result;
  const db = getAdminDb();
  const refs = postIdsWithPolls.map((id) =>
    postsColByScope(scope, groupId)
      .doc(id)
      .collection("pollVotes")
      .doc(viewerId)
  );
  const snaps = await db.getAll(...refs);
  snaps.forEach((s, i) => {
    if (s.exists) {
      const optionIds = (s.data()?.optionIds as string[] | undefined) ?? [];
      result.set(postIdsWithPolls[i], optionIds);
    }
  });
  return result;
}

/**
 * Cast or change a vote on a poll — one doc per voter, so re-voting is a
 * `.set()` overwrite of the SAME doc (the doc id itself enforces "one
 * submission per voter"). Transactional: reads the poll + the voter's own
 * prior vote, computes the optionCounts delta in JS, writes the vote doc +
 * the post's denormalized counts together. `endsAt` is re-checked here,
 * never just relied on from a disabled client button.
 *
 * The persisted vote doc's OWN field names differ by scope — preserved
 * exactly as each side already wrote them (tenant: `memberId`/
 * `memberDisplayName`/`subAccountId`; Agency: `viewerId`/
 * `viewerDisplayName`/`agencyId`) rather than unified, since this is
 * existing, live, non-agnostic persisted data shape, not an internal
 * implementation detail safe to rename.
 */
export async function votePollByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  postId: string;
  voterId: string;
  voterDisplayName: string;
  viewerIsModerator: boolean;
  optionIds: string[];
}): Promise<{ ok: true; poll: FeedPoll } | { ok: false; error: string }> {
  const db = getAdminDb();
  const postRef = postsColByScope(opts.scope, opts.groupId).doc(opts.postId);
  const voteRef = postRef.collection("pollVotes").doc(opts.voterId);

  return db.runTransaction(async (tx) => {
    const [postSnap, voteSnap] = await Promise.all([
      tx.get(postRef),
      tx.get(voteRef),
    ]);
    if (!postSnap.exists) return { ok: false, error: "Post not found" };
    const poll = (postSnap.data() as CommunityPost).poll;
    if (!poll) return { ok: false, error: "This post has no poll" };

    const endsAtMs = toMillisOrNull(poll.endsAt);
    if (endsAtMs !== null && endsAtMs <= Date.now()) {
      return { ok: false, error: "This poll is closed" };
    }

    const validIds = new Set(poll.options.map((o) => o.id));
    const requested = Array.from(new Set(opts.optionIds)).filter((id) =>
      validIds.has(id)
    );
    if (requested.length === 0) {
      return { ok: false, error: "Choose at least one option" };
    }
    if (!poll.allowMultiple && requested.length > 1) {
      return { ok: false, error: "This poll only allows one answer" };
    }

    const previous: string[] = voteSnap.exists
      ? ((voteSnap.data()?.optionIds as string[] | undefined) ?? [])
      : [];
    const optionCounts = { ...poll.optionCounts };
    for (const id of previous) {
      if (!requested.includes(id)) {
        optionCounts[id] = Math.max(0, (optionCounts[id] ?? 0) - 1);
      }
    }
    for (const id of requested) {
      if (!previous.includes(id)) {
        optionCounts[id] = (optionCounts[id] ?? 0) + 1;
      }
    }
    const voterCount = poll.voterCount + (voteSnap.exists ? 0 : 1);
    const now = FieldValue.serverTimestamp();

    const voteDoc =
      opts.scope.kind === "subAccount"
        ? {
            memberId: opts.voterId,
            memberDisplayName: opts.voterDisplayName,
            subAccountId: opts.scope.subAccountId,
            groupId: opts.groupId,
            postId: opts.postId,
            optionIds: requested,
            votedAt: voteSnap.exists ? voteSnap.data()!.votedAt : now,
            updatedAt: now,
          }
        : {
            viewerId: opts.voterId,
            viewerDisplayName: opts.voterDisplayName,
            agencyId: opts.scope.agencyId,
            groupId: opts.groupId,
            postId: opts.postId,
            optionIds: requested,
            votedAt: voteSnap.exists ? voteSnap.data()!.votedAt : now,
            updatedAt: now,
          };
    tx.set(voteRef, voteDoc);
    tx.update(postRef, {
      "poll.optionCounts": optionCounts,
      "poll.voterCount": voterCount,
    });

    return {
      ok: true,
      poll: buildFeedPoll(
        { ...poll, optionCounts, voterCount },
        requested,
        opts.viewerIsModerator
      ),
    };
  });
}
