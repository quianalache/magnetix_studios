import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminDb } from "@/lib/firebase/admin";
import { levelForPoints } from "@/config/community";
import { sanitizeCommunityPostHtml } from "@/lib/community/post-html";
import type {
  AuthorView,
  CommunityComment,
  CommunityPost,
  FeedComment,
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

function displayNameFor(member: Pick<Member, "displayName" | "email">): string {
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

  return posts.map((p) => ({
    ...p,
    author: authors.get(p.authorMemberId) ?? {
      memberId: p.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(p.id),
  }));
}

export async function getFeedPost(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  viewerMemberId: string;
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
  return {
    ...post,
    author: authors.get(post.authorMemberId) ?? {
      memberId: post.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(post.id),
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

export async function createCommentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  authorMemberId: string;
  body: string;
  parentId?: string | null;
}): Promise<CommunityComment> {
  const db = getAdminDb();
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const commentRef = postRef.collection("comments").doc();
  const doc = {
    groupId: opts.groupId,
    postId: opts.postId,
    authorMemberId: opts.authorMemberId,
    body: opts.body.trim(),
    likeCount: 0,
    parentId: opts.parentId ?? null,
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
  } as CommunityPost;
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
  // Recursive delete cleans up the comments + likes subcollections.
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

export async function deleteCommentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId: string;
}): Promise<void> {
  const db = getAdminDb();
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const commentRef = postRef.collection("comments").doc(opts.commentId);
  if (!(await commentRef.get()).exists) return;
  await db.recursiveDelete(commentRef);
  await postRef.update({ commentCount: FieldValue.increment(-1) });
}
