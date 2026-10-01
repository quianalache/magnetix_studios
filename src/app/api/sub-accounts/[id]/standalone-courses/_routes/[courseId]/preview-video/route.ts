import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { getStandaloneCourseTree } from "@/lib/server/standalone-course-service";
import { getBunnyPlaybackUrl } from "@/lib/server/bunny-stream-service";
import { applyLessonVideoAutoplay } from "@/lib/standalone-courses/lesson-video";

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
  const signedUrl = lesson.hostedVideoId
    ? await getBunnyPlaybackUrl({ kind: "tenant", agencyId: tree.course.agencyId, subAccountId }, lesson.hostedVideoId)
    : null;
  // Same rule as student playback (course-lesson-presentation.ts): Bunny
  // autoplays unless told otherwise, so the preview carries the course's
  // saved "Autoplay lesson videos" choice — off when it was never set.
  const embedUrl = signedUrl
    ? applyLessonVideoAutoplay(signedUrl, tree.course.learningExperience?.autoplayLessonVideos === true)
    : null;
  return NextResponse.json({ embedUrl });
}
