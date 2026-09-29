import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getFeedPost } from "@/lib/server/community-feed-service";
import { getCourseTree } from "@/lib/server/community-classroom-service";
import {
  addCoursePagePin,
  listCoursePagePinsForPost,
  removeCoursePagePin,
} from "@/lib/server/community-course-pins-service";

export const dynamic = "force-dynamic";

/** "Manage Course Page Pins" — every course-page destination this post is currently pinned to. */
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; postId: string }> }
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  if (access.membership.role !== "moderator")
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });

  const pins = await listCoursePagePinsForPost({
    subAccountId: saId,
    groupId,
    postId,
  });
  return NextResponse.json({ pins });
}

/** Pin to Course Page — `{ courseId, lessonId }`. Idempotent (deterministic pin id). */
export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; postId: string }> }
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  if (access.membership.role !== "moderator")
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });

  let body: { courseId?: string; lessonId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.courseId || !body.lessonId)
    return NextResponse.json(
      { error: "A course and page are required" },
      { status: 400 }
    );

  // The post must be a real post in this group, and the destination a real
  // published lesson in this group — both re-verified server-side rather
  // than trusted from the picker's own (already tenant-scoped) listing, so
  // a stale/tampered request can't create a pin pointing at nothing.
  const post = await getFeedPost({
    subAccountId: saId,
    groupId,
    postId,
    viewerMemberId: access.member.id,
    viewerIsModerator: true,
  });
  if (!post)
    return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const tree = await getCourseTree({
    subAccountId: saId,
    groupId,
    courseId: body.courseId,
    includeUnpublished: true,
  });
  const lesson = tree?.lessons.find((l) => l.id === body.lessonId);
  if (!tree || !lesson)
    return NextResponse.json(
      { error: "Course page not found" },
      { status: 404 }
    );

  const pin = await addCoursePagePin({
    subAccountId: saId,
    groupId,
    postId,
    courseId: body.courseId,
    courseName: tree.course.title,
    lessonId: body.lessonId,
    lessonName: lesson.title,
  });
  return NextResponse.json({ ok: true, pin });
}

/** Remove one pin — `?pinId=...`. Removes the pin relationship only; never the post/comments/reactions. */
export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; postId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  if (access.membership.role !== "moderator")
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });

  const pinId = new URL(request.url).searchParams.get("pinId");
  if (!pinId)
    return NextResponse.json({ error: "pinId is required" }, { status: 400 });

  await removeCoursePagePin({ subAccountId: saId, groupId, pinId });
  return NextResponse.json({ ok: true });
}
