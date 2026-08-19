import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminDb } from "@/lib/firebase/admin";
import { levelForPoints } from "@/config/community";
import { sanitizeCommunityPostHtml, sanitizeCommunityCommentHtml } from "@/lib/community/post-html";
import type {
  AuthorView,
  CommunityComment,
  CommunityPoll,
  CommunityPost,
  FeedComment,
  FeedPoll,
  FeedPost,
  Member,
} from "@/types/community";
import type { MediaAttachment } from "@/types/media-attachment";

/**
 * Server-side feed service (Admin SDK). Members are not Firebase users, so the
 * member feed is server-rendered through these helpers and mutated via POST
 * routes — never the client SDK. Likes are doc-per-liker for idempotent toggles
 * and feed those likes into per-group gamification points (1 like = 1 point to
 * the author, unless you like your own post).
 */

function postsCol(saId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/communityGroups/${groupId}/posts`,
  );
}

/** Exported for the poll-vote route, which needs to denormalize the
 *  voter's display name onto their vote doc — same fallback rule every
 *  other author-name display in this file already uses. */
export function displayNameFor(member: Pick<Member, "displayName" | "email">): string {
  if (member.displayName && member.displayName.trim()) {
    return member.displayName.trim();
  }
  return member.email.split("@")[0] || "Member";
}

/**
 * Hydrate {@link AuthorView}s for a set of member ids — their identity (name,
 * avatar) plus per-group level. Batched reads; safe for the bounded post/
 * comment counts in v1.
 */
async function hydrateAuthors(
  saId: string,
  groupId: string,
  memberIds: string[],
): Promise<Map<string, AuthorView>> {
  const db = getAdminDb();
  const unique = Array.from(new Set(memberIds));
  const result = new Map<string, AuthorView>();
  if (unique.length === 0) return result;

  const memberRefs = unique.map((id) =>
    db.doc(`subAccounts/${saId}/members/${id}`),
  );
  const membershipRefs = unique.map((id) =>
    db.doc(`subAccounts/${saId}/communityGroups/${groupId}/memberships/${id}`),
  );
  const [memberSnaps, membershipSnaps] = await Promise.all([
    db.getAll(...memberRefs),
    db.getAll(...membershipRefs),
  ]);

  unique.forEach((id, i) => {
    const m = memberSnaps[i].data() as Member | undefined;
    const membership = membershipSnaps[i].data() as { level?: number } | undefined;
    result.set(id, {
      memberId: id,
      displayName: m
        ? displayNameFor(m)
        : "Former member",
      avatarUrl: m?.avatarUrl ?? null,
      level: membership?.level ?? 1,
    });
  });
  return result;
}

/** Which of `postIds` the viewer has liked. */
async function viewerLikes(
  saId: string,
  groupId: string,
  postIds: string[],
  viewerMemberId: string,
  sub: "posts" | "comments" = "posts",
  parentPostId?: string,
): Promise<Set<string>> {
  const db = getAdminDb();
  if (postIds.length === 0) return new Set();
  const refs = postIds.map((id) =>
    sub === "posts"
      ? db.doc(
          `subAccounts/${saId}/communityGroups/${groupId}/posts/${id}/likes/${viewerMemberId}`,
        )
      : db.doc(
          `subAccounts/${saId}/communityGroups/${groupId}/posts/${parentPostId}/comments/${id}/likes/${viewerMemberId}`,
        ),
  );
  const snaps = await db.getAll(...refs);
  const liked = new Set<string>();
  snaps.forEach((s, i) => {
    if (s.exists) liked.add(postIds[i]);
  });
  return liked;
}

/** millis for a Firestore Timestamp/Date/FieldValue-shaped value, or null. */
function toMillisOrNull(v: unknown): number | null {
  if (!v) return null;
  const m = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  return null;
}

/**
 * The ONE place a raw {@link CommunityPoll} doc is turned into the
 * viewer-safe {@link FeedPoll} every read path sends to the client — see
 * the type's own doc comment for why `optionCounts`/`voterCount` must
 * never leak here when `resultsVisible` is false. `viewerVote` is this
 * specific viewer's own vote doc (or null if they haven't voted) — always
 * read per-request, never cached/denormalized onto the post, so a vote
 * cast a second ago is reflected immediately.
 */
function buildFeedPoll(
  poll: CommunityPoll,
  viewerVote: string[] | null,
  viewerIsModerator: boolean,
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
 *  poll — mirrors `viewerLikes`'s "one small doc per post per viewer"
 *  shape, same reasoning: cheap, bounded, no aggregation query needed. */
async function viewerPollVotes(
  saId: string,
  groupId: string,
  postIdsWithPolls: string[],
  viewerMemberId: string,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (postIdsWithPolls.length === 0) return result;
  const db = getAdminDb();
  const refs = postIdsWithPolls.map((id) =>
    db.doc(`subAccounts/${saId}/communityGroups/${groupId}/posts/${id}/pollVotes/${viewerMemberId}`),
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

export interface CreatePostInput {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  authorMemberId: string;
  title: string;
  body: string;
  /** Phase C — already validated/normalized by the API route (shape +
   *  per-kind count caps + authorMemberId overwritten there). This
   *  layer just stores it. */
  attachments?: MediaAttachment[];
  category: string | null;
  /** Phase D — defaults to false (comments allowed), matching
   *  `CommunityPost.commentsDisabled`'s "absent = allowed" convention. */
  commentsDisabled?: boolean;
  /** Already permission-checked (moderator-only) AND shape-validated
   *  (`normalizePollDraft`) by the API route — this layer just stores it,
   *  same convention as `attachments` above. */
  poll?: CommunityPoll | null;
}

export async function createPostServerSide(
  input: CreatePostInput,
): Promise<CommunityPost> {
  const doc = {
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    groupId: input.groupId,
    authorMemberId: input.authorMemberId,
    title: input.title.trim(),
    // Defense-in-depth: sanitize on write too, not just on read (the
    // read path — see post-html.ts's renderCommunityPostHtml, used by
    // every page that fetches a post — is the one this MUST NOT skip;
    // this second pass just means a post is never stored with anything
    // the read-time sanitizer would have to strip in the first place).
    body: sanitizeCommunityPostHtml(input.body.trim()),
    // Firestore's admin client is configured with
    // ignoreUndefinedProperties (see firebase/admin.ts), so an empty/
    // undefined attachments array is simply omitted from the stored doc
    // rather than throwing — old posts and image/voice-only posts alike
    // stay valid with no special-casing here.
    attachments: input.attachments?.length ? input.attachments : undefined,
    category: input.category,
    // Same ignoreUndefinedProperties convention: only actually stored when
    // true, so a plain post costs nothing extra and old-post compatibility
    // needs no special-casing on read (`commentsDisabled` absent === false).
    commentsDisabled: input.commentsDisabled ? true : undefined,
    poll: input.poll ?? undefined,
    hasPoll: input.poll ? true : undefined,
    pinned: false,
    likeCount: 0,
    commentCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await postsCol(input.subAccountId, input.groupId).add(doc);
  return { id: ref.id, ...doc } as CommunityPost;
}

/**
 * Phase D — search this GROUP's own active members for the @ mention
 * autocomplete. Deliberately NOT `listDmableMembersServerSide` (DM
 * infrastructure spans every group the viewer belongs to, and layers in
 * DM-block filtering that has nothing to do with "who can be mentioned in
 * THIS post") — a plain group-membership query, reusing `hydrateAuthors`
 * already defined above rather than a second name-lookup path.
 */
export async function searchGroupMembersServerSide(opts: {
  subAccountId: string;
  groupId: string;
  query: string;
  excludeMemberId?: string;
  limit?: number;
}): Promise<{ id: string; label: string; avatarUrl: string | null }[]> {
  const db = getAdminDb();
  const membershipsSnap = await db
    .collection(`subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/memberships`)
    .where("status", "==", "active")
    .limit(500)
    .get();
  const ids = membershipsSnap.docs
    .map((d) => d.id)
    .filter((id) => id !== opts.excludeMemberId);
  if (ids.length === 0) return [];

  const authors = await hydrateAuthors(opts.subAccountId, opts.groupId, ids);
  const q = opts.query.trim().toLowerCase();
  return [...authors.values()]
    .filter((a) => !q || a.displayName.toLowerCase().includes(q))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, opts.limit ?? 8)
    .map((a) => ({ id: a.memberId, label: a.displayName, avatarUrl: a.avatarUrl }));
}

/** List the feed: pinned first, then newest. Optional category filter. */
export async function listFeed(opts: {
  subAccountId: string;
  groupId: string;
  viewerMemberId: string;
  /** Drives `FeedPoll.resultsVisible`/`canManage` for every poll in this
   *  feed — defaults to false (safest default: a caller that forgets to
   *  pass this gets the ordinary-member view, never an accidental
   *  results/edit leak to someone who isn't actually a moderator). */
  viewerIsModerator?: boolean;
  category?: string | null;
  limit?: number;
}): Promise<FeedPost[]> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .orderBy("createdAt", "desc")
    .limit(opts.limit ?? 100)
    .get();

  let posts = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CommunityPost, "id">) }),
  );
  if (opts.category && opts.category !== "All") {
    posts = posts.filter((p) => p.category === opts.category);
  }
  // Pinned float to the top, preserving recency within each band.
  posts.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const authors = await hydrateAuthors(
    opts.subAccountId,
    opts.groupId,
    posts.map((p) => p.authorMemberId),
  );
  const liked = await viewerLikes(
    opts.subAccountId,
    opts.groupId,
    posts.map((p) => p.id),
    opts.viewerMemberId,
  );
  const pollPostIds = posts.filter((p) => p.poll).map((p) => p.id);
  const votes = await viewerPollVotes(opts.subAccountId, opts.groupId, pollPostIds, opts.viewerMemberId);

  return posts.map((p) => ({
    ...p,
    author: authors.get(p.authorMemberId) ?? {
      memberId: p.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(p.id),
    poll: p.poll ? buildFeedPoll(p.poll, votes.get(p.id) ?? null, opts.viewerIsModerator === true) : undefined,
  }));
}

export async function getFeedPost(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  viewerMemberId: string;
  /** See `listFeed`'s same option — same safe-default reasoning. */
  viewerIsModerator?: boolean;
}): Promise<FeedPost | null> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .get();
  if (!snap.exists) return null;
  const post = { id: snap.id, ...(snap.data() as Omit<CommunityPost, "id">) };
  const authors = await hydrateAuthors(opts.subAccountId, opts.groupId, [
    post.authorMemberId,
  ]);
  const liked = await viewerLikes(
    opts.subAccountId,
    opts.groupId,
    [post.id],
    opts.viewerMemberId,
  );
  const votes = post.poll
    ? await viewerPollVotes(opts.subAccountId, opts.groupId, [post.id], opts.viewerMemberId)
    : null;
  return {
    ...post,
    author: authors.get(post.authorMemberId) ?? {
      memberId: post.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(post.id),
    poll: post.poll ? buildFeedPoll(post.poll, votes?.get(post.id) ?? null, opts.viewerIsModerator === true) : undefined,
  };
}

export async function listComments(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  viewerMemberId: string;
}): Promise<FeedComment[]> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .collection("comments")
    .orderBy("createdAt", "asc")
    .limit(200)
    .get();
  const comments = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CommunityComment, "id">) }),
  );
  const authors = await hydrateAuthors(
    opts.subAccountId,
    opts.groupId,
    comments.map((c) => c.authorMemberId),
  );
  const liked = await viewerLikes(
    opts.subAccountId,
    opts.groupId,
    comments.map((c) => c.id),
    opts.viewerMemberId,
    "comments",
    opts.postId,
  );
  return comments.map((c) => ({
    ...c,
    author: authors.get(c.authorMemberId) ?? {
      memberId: c.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(c.id),
  }));
}

/**
 * Resolve the EFFECTIVE parentId for a new comment, enforcing the
 * two-visual-level thread model at the data boundary — not merely a
 * client-side convention the UI happens to follow. If `requestedParentId`
 * names a comment that is ITSELF a reply (has its own non-null parentId),
 * the new comment attaches to that reply's own top-level parent instead —
 * "replying to a reply" always lands in the same thread as a sibling
 * reply, never a third indentation level. Throws if the requested parent
 * doesn't exist (or isn't in this post) rather than silently guessing —
 * a genuinely different error case than "flatten a too-deep reply".
 */
async function resolveCommentParentId(
  postRef: FirebaseFirestore.DocumentReference,
  requestedParentId: string | null | undefined,
): Promise<string | null> {
  if (!requestedParentId) return null;
  const targetSnap = await postRef.collection("comments").doc(requestedParentId).get();
  if (!targetSnap.exists) {
    throw new Error("Comment not found");
  }
  const targetParentId = (targetSnap.data() as Omit<CommunityComment, "id">).parentId;
  return targetParentId ?? requestedParentId;
}

export async function createCommentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  authorMemberId: string;
  body: string;
  parentId?: string | null;
  /** Already validated/normalized by the API route (normalizeCommentAttachments) —
   *  this layer just stores it, same convention as createPostServerSide. */
  attachments?: MediaAttachment[];
}): Promise<CommunityComment> {
  const db = getAdminDb();
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const effectiveParentId = await resolveCommentParentId(postRef, opts.parentId);
  const commentRef = postRef.collection("comments").doc();
  const doc = {
    groupId: opts.groupId,
    postId: opts.postId,
    authorMemberId: opts.authorMemberId,
    // Defense-in-depth: sanitize on write too, not just on read — same
    // reasoning as createPostServerSide's own sanitize-on-write.
    body: sanitizeCommunityCommentHtml(opts.body.trim()),
    likeCount: 0,
    parentId: effectiveParentId,
    attachments: opts.attachments?.length ? opts.attachments : undefined,
    createdAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(commentRef, doc);
  batch.update(postRef, { commentCount: FieldValue.increment(1) });
  await batch.commit();
  return { id: commentRef.id, ...doc } as CommunityComment;
}

/**
 * Toggle a like on a post (or comment) and keep the author's per-group points
 * + level in sync. Liking your own content toggles the like but awards no
 * points (matches Skool — points come from OTHERS liking you). Transactional so
 * the like doc, the counter, and the points can't drift.
 */
export async function toggleLikeServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId?: string;
  viewerMemberId: string;
}): Promise<{ liked: boolean }> {
  const db = getAdminDb();
  const base = `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`;
  const targetRef = opts.commentId
    ? db.doc(`${base}/posts/${opts.postId}/comments/${opts.commentId}`)
    : db.doc(`${base}/posts/${opts.postId}`);
  const likeRef = targetRef.collection("likes").doc(opts.viewerMemberId);

  return db.runTransaction(async (tx) => {
    const [likeSnap, targetSnap] = await Promise.all([
      tx.get(likeRef),
      tx.get(targetRef),
    ]);
    if (!targetSnap.exists) throw new Error("Not found");
    const authorId = targetSnap.data()!.authorMemberId as string;
    const authorRef = db.doc(`${base}/memberships/${authorId}`);
    const selfLike = authorId === opts.viewerMemberId;

    // Read author membership only when points actually change.
    const authorSnap = selfLike ? null : await tx.get(authorRef);

    // pointEvents is the time-series feed that powers the 7-day / 30-day
    // leaderboard windows (all-time reads the denormalized membership.points).
    const pointEventsCol = db.collection(`${base}/pointEvents`);

    if (likeSnap.exists) {
      tx.delete(likeRef);
      tx.update(targetRef, { likeCount: FieldValue.increment(-1) });
      if (authorSnap?.exists) {
        const points = Math.max(0, ((authorSnap.data()!.points as number) ?? 0) - 1);
        tx.update(authorRef, { points, level: levelForPoints(points) });
        tx.set(pointEventsCol.doc(), {
          memberId: authorId,
          delta: -1,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return { liked: false };
    }

    tx.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
    tx.update(targetRef, { likeCount: FieldValue.increment(1) });
    if (authorSnap?.exists) {
      const points = ((authorSnap.data()!.points as number) ?? 0) + 1;
      tx.update(authorRef, { points, level: levelForPoints(points) });
      tx.set(pointEventsCol.doc(), {
        memberId: authorId,
        delta: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { liked: true };
  });
}

export async function setPinnedServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  pinned: boolean;
}): Promise<void> {
  await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .update({ pinned: opts.pinned, updatedAt: FieldValue.serverTimestamp() });
}

/**
 * Phase C: deleting a post also deletes any image/voice-note Storage
 * objects it referenced — a CommunityPost document must not disappear
 * while its media is left permanently orphaned, unlike existing
 * image-upload flows elsewhere in the app that never keep a storagePath
 * to clean up in the first place. Best-effort: an individual Storage
 * delete failing (already gone, transient error) is logged and does NOT
 * block deleting the post itself — the alternative (a stuck, undeletable
 * post because of an unrelated Storage hiccup) is worse.
 */
/** Attachment storage path, or null for kinds with nothing of ours to
 *  clean up (gif = provider CDN URL, video-link = metadata only). */
function attachmentStoragePath(a: MediaAttachment): string | null {
  switch (a.kind) {
    case "image":
      return a.image.storagePath;
    case "voice":
      return a.voice.storagePath;
    case "file":
      return a.file.storagePath;
    case "gif":
    case "video-link":
      return null;
  }
}

async function deleteAttachmentStorage(attachments: MediaAttachment[] | undefined) {
  if (!attachments?.length) return;
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return;
  const bucket = getStorage().bucket(bucketName);
  await Promise.allSettled(
    attachments.map(async (a) => {
      const storagePath = attachmentStoragePath(a);
      if (!storagePath) return;
      try {
        await bucket.file(storagePath).delete();
      } catch (err) {
        console.warn("[community-feed] attachment cleanup: object missing or already removed", err);
      }
    }),
  );
}

/**
 * Phase D — edit an existing post. Reuses the exact same
 * attachment-shape validation the create route already did (the API
 * route normalizes/validates before this is ever called, same as
 * `createPostServerSide`). The safe-edit-transaction attachment lifecycle
 * lives here: any attachment present in the OLD stored post but absent
 * from the NEW attachments array is treated as "removed during this
 * edit" and has its Storage object deleted (best-effort, same philosophy
 * as `deleteAttachmentStorage` above) — newly added attachments need no
 * action here (already uploaded/validated by the time this runs); the
 * client is responsible for cleaning up anything it uploaded but the
 * member then cancelled out of before ever calling this.
 */
export interface UpdatePostInput {
  subAccountId: string;
  groupId: string;
  postId: string;
  title: string;
  body: string;
  attachments?: MediaAttachment[];
  category: string | null;
  commentsDisabled: boolean;
  /** Already permission-checked + validated (`normalizePollEdit`, which
   *  also enforces the "locked after votes exist" rule) by the API route.
   *  `undefined` = don't touch the existing poll at all; `null` = remove
   *  it (only reachable when it had zero votes — `normalizePollEdit`
   *  throws otherwise); an object = replace/update it. */
  poll?: CommunityPoll | null;
}

export async function updatePostServerSide(input: UpdatePostInput): Promise<CommunityPost | null> {
  const ref = postsCol(input.subAccountId, input.groupId).doc(input.postId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const existing = snap.data() as Omit<CommunityPost, "id">;

  const newPaths = new Set(
    (input.attachments ?? []).map(attachmentStoragePath).filter((p): p is string => !!p),
  );
  const removed = (existing.attachments ?? []).filter((a) => {
    const p = attachmentStoragePath(a);
    return p ? !newPaths.has(p) : false;
  });

  const updates = {
    title: input.title.trim(),
    body: sanitizeCommunityPostHtml(input.body.trim()),
    // `.update()` respects `ignoreUndefinedProperties` by SKIPPING a field
    // entirely when its value is `undefined` — that's the right behavior
    // for `createPostServerSide`'s `.add()` (nothing to clear yet), but
    // here it would silently leave a stale `attachments` array in place
    // when a member removes every attachment during an edit. FieldValue
    // .delete() is the explicit "actually clear this field" instruction.
    attachments: input.attachments?.length ? input.attachments : FieldValue.delete(),
    category: input.category,
    // Same "only stored when true" convention as createPostServerSide —
    // re-enabling comments during an edit clears the field entirely
    // rather than writing `false`.
    commentsDisabled: input.commentsDisabled ? true : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    // `undefined` here correctly means "skip this field" under
    // ignoreUndefinedProperties — i.e. leave the existing poll (if any)
    // completely untouched, which is exactly what an edit request that
    // never mentioned `poll` should do. `null` -> FieldValue.delete()
    // (only reachable pre-votes; see UpdatePostInput's doc comment) and
    // an object -> stored as-is (already the full merged poll, INCLUDING
    // preserved optionCounts/voterCount, per normalizePollEdit).
    ...(input.poll === undefined
      ? {}
      : {
          poll: input.poll === null ? FieldValue.delete() : input.poll,
          hasPoll: input.poll === null ? FieldValue.delete() : true,
        }),
  };
  await ref.update(updates);
  // Best-effort, after the write succeeds — a Storage hiccup here must
  // never leave the post itself in a broken/half-saved state.
  await deleteAttachmentStorage(removed);

  // Built from `input`, not `updates` — `updates.attachments` may be a
  // FieldValue.delete() sentinel, not a real value safe to hand back to
  // an API response.
  return {
    id: input.postId,
    ...existing,
    title: input.title.trim(),
    body: sanitizeCommunityPostHtml(input.body.trim()),
    attachments: input.attachments?.length ? input.attachments : undefined,
    category: input.category,
    commentsDisabled: input.commentsDisabled,
    poll: input.poll === undefined ? existing.poll : (input.poll ?? undefined),
    hasPoll: input.poll === undefined ? existing.hasPoll : !!input.poll,
  } as CommunityPost;
}

/**
 * Cast or change a member's vote on a poll — one doc per member at
 * `posts/{postId}/pollVotes/{memberId}`, so re-voting is a `.set()`
 * overwrite of the SAME doc (Part 7's "update rather than creating
 * duplicate submissions"), and the doc id itself is what enforces "one
 * submission per member" (a second vote can only ever land on the same
 * doc, never a new one). Denormalizes `subAccountId`/`groupId`/`postId`
 * onto the vote doc purely so the Forms & Quizzes-side admin views can
 * query the `pollVotes` collection group directly (by subAccountId, or by
 * memberId for a future "this member's poll history" view) without
 * needing the full nested path — same reasoning `FormSubmission.contactId`
 * is denormalized for its own collectionGroup query.
 *
 * Transactional: reads the poll + the member's own prior vote (if any),
 * computes the optionCounts delta in JS (at most 5 keys — trivial), and
 * writes the vote doc + the post's denormalized counts together, so a
 * concurrent double-submit can't corrupt the totals. `endsAt` is
 * re-checked HERE, not just relied on from a client-side disabled button —
 * Part 6's "enforce closing server-side."
 */
export async function votePollServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  memberId: string;
  memberDisplayName: string;
  viewerIsModerator: boolean;
  optionIds: string[];
}): Promise<{ ok: true; poll: FeedPoll } | { ok: false; error: string }> {
  const db = getAdminDb();
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const voteRef = postRef.collection("pollVotes").doc(opts.memberId);

  return db.runTransaction(async (tx) => {
    const [postSnap, voteSnap] = await Promise.all([tx.get(postRef), tx.get(voteRef)]);
    if (!postSnap.exists) return { ok: false, error: "Post not found" };
    const poll = (postSnap.data() as CommunityPost).poll;
    if (!poll) return { ok: false, error: "This post has no poll" };

    const endsAtMs = toMillisOrNull(poll.endsAt);
    if (endsAtMs !== null && endsAtMs <= Date.now()) {
      return { ok: false, error: "This poll is closed" };
    }

    const validIds = new Set(poll.options.map((o) => o.id));
    const requested = Array.from(new Set(opts.optionIds)).filter((id) => validIds.has(id));
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

    tx.set(voteRef, {
      memberId: opts.memberId,
      memberDisplayName: opts.memberDisplayName,
      subAccountId: opts.subAccountId,
      groupId: opts.groupId,
      postId: opts.postId,
      optionIds: requested,
      votedAt: voteSnap.exists ? voteSnap.data()!.votedAt : now,
      updatedAt: now,
    });
    tx.update(postRef, {
      "poll.optionCounts": optionCounts,
      "poll.voterCount": voterCount,
    });

    return {
      ok: true,
      poll: buildFeedPoll({ ...poll, optionCounts, voterCount }, requested, opts.viewerIsModerator),
    };
  });
}

export async function deletePostServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
}): Promise<void> {
  const ref = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const snap = await ref.get();
  const attachments = (snap.data() as CommunityPost | undefined)?.attachments;
  await deleteAttachmentStorage(attachments);

  // Comments & Replies (2026-08-19) — `recursiveDelete` below correctly
  // wipes every comment/reply DOCUMENT (it's a Firestore-only operation),
  // but Storage objects a comment/reply owns are never touched by that —
  // without this, deleting a post would silently orphan every comment's
  // image/voice/file attachments forever. Read every comment's
  // attachments BEFORE the recursive delete removes the docs that
  // reference them; best-effort cleanup, same as every other Storage
  // cleanup in this file — a Storage hiccup here must never block
  // deleting the post itself.
  const commentsSnap = await ref.collection("comments").get();
  const commentAttachments = commentsSnap.docs.flatMap(
    (d) => (d.data() as { attachments?: MediaAttachment[] }).attachments ?? [],
  );
  await deleteAttachmentStorage(commentAttachments);

  // Recursive delete cleans up the comments + likes + pollVotes
  // subcollections — no separate poll-response cleanup step needed. This
  // is a deliberate departure from `forms/{id}` submissions, which
  // currently OUTLIVE a deleted parent form (`deleteForm` is a plain
  // single-doc delete, not recursive) — investigated for Part 10 of the
  // Polls report and NOT changed here (out of scope), but flagged there as
  // an inconsistency worth a deliberate decision before any future
  // cross-feature retention/reporting work treats the two as equivalent.
  await getAdminDb().recursiveDelete(ref);
}

/** Returns the comment's author id (for the author-or-moderator delete check). */
export async function getCommentAuthor(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId: string;
}): Promise<string | null> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .collection("comments")
    .doc(opts.commentId)
    .get();
  return snap.exists ? (snap.data()!.authorMemberId as string) : null;
}

/**
 * Delete a comment/reply. FIXED (2026-08-19) — previously deleted only the
 * one targeted document: deleting a TOP-LEVEL comment left its replies as
 * orphaned Firestore documents (invisible in the UI, which filters by
 * parentId client-side, but never actually removed) and only ever
 * decremented `commentCount` by 1 regardless of how many replies existed.
 * Now: when the target is a top-level comment, its replies are found
 * (`where parentId == commentId`) and deleted alongside it — a reply
 * itself has no descendants under the two-level thread model, so deleting
 * one is always just itself. Every attachment across everything actually
 * deleted is cleaned up first (best-effort, same convention as
 * deletePostServerSide/updatePostServerSide — a Storage hiccup must never
 * block deleting the comment). `commentCount` is decremented by the real
 * number of documents removed, not a hardcoded 1.
 */
export async function deleteCommentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId: string;
}): Promise<void> {
  const db = getAdminDb();
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const commentRef = postRef.collection("comments").doc(opts.commentId);
  const commentSnap = await commentRef.get();
  if (!commentSnap.exists) return;

  const repliesSnap = await postRef
    .collection("comments")
    .where("parentId", "==", opts.commentId)
    .get();
  const allSnaps = [commentSnap, ...repliesSnap.docs];

  const allAttachments = allSnaps.flatMap(
    (d) => (d.data() as { attachments?: MediaAttachment[] }).attachments ?? [],
  );
  await deleteAttachmentStorage(allAttachments);

  await Promise.all(allSnaps.map((d) => db.recursiveDelete(d.ref)));
  await postRef.update({ commentCount: FieldValue.increment(-allSnaps.length) });
}

/**
 * Edit an existing comment/reply — author-only (never moderator; see the
 * Comments & Replies report for why). Mirrors `updatePostServerSide`'s
 * attachment-diff pattern exactly: any attachment present in the OLD
 * stored comment but absent from the NEW submitted list is treated as
 * "removed during this edit" and has its Storage object deleted
 * (best-effort, after the write succeeds); newly added attachments need
 * no action here (already uploaded/validated by the time this runs — the
 * client is responsible for cleaning up anything uploaded but abandoned
 * before ever calling this, same as PostComposer's edit-mode session-
 * upload tracking).
 */
export async function updateCommentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId: string;
  body: string;
  attachments?: MediaAttachment[];
}): Promise<{ ok: true; sanitizedBody: string } | { ok: false }> {
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const commentRef = postRef.collection("comments").doc(opts.commentId);
  const snap = await commentRef.get();
  if (!snap.exists) return { ok: false };
  const existing = snap.data() as Omit<CommunityComment, "id">;

  const newPaths = new Set(
    (opts.attachments ?? []).map(attachmentStoragePath).filter((p): p is string => !!p),
  );
  const removed = (existing.attachments ?? []).filter((a) => {
    const p = attachmentStoragePath(a);
    return p ? !newPaths.has(p) : false;
  });

  // Sanitized once, reused for both the write and the response — the
  // client's ClientComment update is built from ITS OWN local state
  // (same optimistic-update convention `PostComposer`'s edit mode already
  // uses for posts), so this route/service pair only needs to hand back
  // enough to confirm success and the exact sanitized text that was
  // actually stored, not a fully round-tripped Firestore-shaped object.
  const sanitizedBody = sanitizeCommunityCommentHtml(opts.body.trim());
  await commentRef.update({
    body: sanitizedBody,
    // Same FieldValue.delete() reasoning as updatePostServerSide — an
    // `undefined` value on `.update()` is SKIPPED (ignoreUndefinedProperties),
    // which would silently leave a stale attachments array in place if a
    // member removes every attachment during an edit.
    attachments: opts.attachments?.length ? opts.attachments : FieldValue.delete(),
    editedAt: FieldValue.serverTimestamp(),
  });
  await deleteAttachmentStorage(removed);

  return { ok: true, sanitizedBody };
}
