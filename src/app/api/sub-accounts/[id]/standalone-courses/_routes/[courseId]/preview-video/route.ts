import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { getStandaloneCourseTree } from "@/lib/server/standalone-course-service";
import { getBunnyPlaybackUrl } from "@/lib/server/bunny-stream-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; courseId: string }> },
) {
  const { id: subAccountId, courseId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const lessonId = new URL(request.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
  const tree = await getStandaloneCourseTree({ subAccountId, courseId, includeUnpublished: true });
  const lesson = tree?.lessons.find((item) => item.id === lessonId);
  if (!tree || !lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  const embedUrl = lesson.hostedVideoId
    ? await getBunnyPlaybackUrl({ kind: "tenant", agencyId: tree.course.agencyId, subAccountId }, lesson.hostedVideoId)
    : null;
  return NextResponse.json({ embedUrl });
}
