import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { listCoursesWithLessons } from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

/**
 * "Pin to Course Page" destination picker — published courses + lessons
 * for THIS group only (tenant-scoped by the saId/groupId in the route
 * itself, not by anything the client sends), moderator-gated. Human-
 * readable (course title, lesson title); no opaque IDs surfaced to the
 * picker UI.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
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

  const entries = await listCoursesWithLessons(saId, groupId, {
    publishedOnly: true,
  });
  return NextResponse.json({
    courses: entries.map(({ course, lessons }) => ({
      id: course.id,
      title: course.title,
      lessons: lessons.map((l) => ({ id: l.id, title: l.title })),
    })),
  });
}
