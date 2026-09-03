import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Post <-> course-lesson pin relationships (2026-09-03, "Pin to Course
 * Page"). A many-to-many reference, not a copy: the course page renders
 * the SAME canonical Community Post (same comments, same reactions,
 * edited/deleted in one place) — this collection only records WHERE a
 * post is also embedded. Deliberately its own top-level collection
 * (not a field on the post doc or the lesson doc) so it's queryable both
 * directions without denormalization drifting out of sync:
 *   - "what's pinned to this lesson" (course-page embed rendering):
 *     where courseId == X, lessonId == Y
 *   - "where is this post pinned" (Manage Pins UI):
 *     where postId == Z
 * Deterministic doc ID (`${postId}__${courseId}__${lessonId}`) makes
 * pinning already-pinned content a safe idempotent no-op rather than a
 * duplicate — no unique-constraint query needed before writing.
 */

export interface CoursePagePin {
  id: string;
  postId: string;
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonName: string;
  createdAtMs: number | null;
}

function pinsCol(saId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/communityGroups/${groupId}/coursePagePins`
  );
}

function pinId(postId: string, courseId: string, lessonId: string): string {
  return `${postId}__${courseId}__${lessonId}`;
}

function toMillis(v: unknown): number | null {
  const m = v as { toMillis?: () => number } | null | undefined;
  return typeof m?.toMillis === "function" ? m.toMillis() : null;
}

export async function addCoursePagePin(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonName: string;
}): Promise<CoursePagePin> {
  const id = pinId(opts.postId, opts.courseId, opts.lessonId);
  const ref = pinsCol(opts.subAccountId, opts.groupId).doc(id);
  await ref.set(
    {
      postId: opts.postId,
      courseId: opts.courseId,
      courseName: opts.courseName,
      lessonId: opts.lessonId,
      lessonName: opts.lessonName,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const snap = await ref.get();
  const data = snap.data()!;
  return {
    id,
    postId: data.postId,
    courseId: data.courseId,
    courseName: data.courseName,
    lessonId: data.lessonId,
    lessonName: data.lessonName,
    createdAtMs: toMillis(data.createdAt),
  };
}

export async function removeCoursePagePin(opts: {
  subAccountId: string;
  groupId: string;
  pinId: string;
}): Promise<void> {
  await pinsCol(opts.subAccountId, opts.groupId).doc(opts.pinId).delete();
}

/** Every course-page destination a given post is currently pinned to — the Manage Pins UI. */
export async function listCoursePagePinsForPost(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
}): Promise<CoursePagePin[]> {
  const snap = await pinsCol(opts.subAccountId, opts.groupId)
    .where("postId", "==", opts.postId)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      postId: data.postId,
      courseId: data.courseId,
      courseName: data.courseName,
      lessonId: data.lessonId,
      lessonName: data.lessonName,
      createdAtMs: toMillis(data.createdAt),
    };
  });
}

/** Every post pinned to a given course lesson — the course-page embed. */
export async function listPostIdsPinnedToLesson(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  lessonId: string;
}): Promise<string[]> {
  const snap = await pinsCol(opts.subAccountId, opts.groupId)
    .where("courseId", "==", opts.courseId)
    .where("lessonId", "==", opts.lessonId)
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((d) => d.data().postId as string);
}

/** Deletion cleanup (2026-09-03) — a deleted post must not leave orphaned
 *  course-page embeds pointing at content that no longer resolves. */
export async function removeAllCoursePagePinsForPost(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
}): Promise<void> {
  const snap = await pinsCol(opts.subAccountId, opts.groupId)
    .where("postId", "==", opts.postId)
    .get();
  if (snap.empty) return;
  const batch = getAdminDb().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export interface CoursePageEmbeddedPost {
  pinId: string;
  postId: string;
  title: string;
  /** Sanitized HTML — see post-html.ts. */
  body: string;
  author: {
    memberId: string;
    displayName: string;
    avatarUrl: string | null;
    level: number;
  };
  likeCount: number;
  commentCount: number;
}

/**
 * Render-ready posts pinned to a given lesson — the course-page embed
 * (2026-09-03). Skips (rather than throws on) a pin whose post no longer
 * loads — belt-and-suspenders alongside the delete-time cleanup above, so
 * a stray orphaned pin (e.g. from data predating that cleanup) never
 * crashes the lesson page, it's just silently invisible.
 */
export async function listCoursePageEmbeddedPosts(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  lessonId: string;
  viewerMemberId: string;
}): Promise<CoursePageEmbeddedPost[]> {
  const snap = await pinsCol(opts.subAccountId, opts.groupId)
    .where("courseId", "==", opts.courseId)
    .where("lessonId", "==", opts.lessonId)
    .orderBy("createdAt", "asc")
    .get();
  if (snap.empty) return [];

  const { getFeedPost } = await import("@/lib/server/community-feed-service");
  const { renderCommunityPostHtml } = await import("@/lib/community/post-html");

  const results = await Promise.all(
    snap.docs.map(async (d) => {
      const post = await getFeedPost({
        subAccountId: opts.subAccountId,
        groupId: opts.groupId,
        postId: d.data().postId as string,
        viewerMemberId: opts.viewerMemberId,
        viewerIsModerator: false,
      }).catch(() => null);
      if (!post) return null;
      const embedded: CoursePageEmbeddedPost = {
        pinId: d.id,
        postId: post.id,
        title: post.title,
        body: renderCommunityPostHtml(post.body),
        author: post.author,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
      };
      return embedded;
    })
  );
  return results.filter((r): r is CoursePageEmbeddedPost => r !== null);
}
