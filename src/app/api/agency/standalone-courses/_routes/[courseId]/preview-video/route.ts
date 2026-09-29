import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getAgencyStandaloneCourseTree } from "@/lib/server/agency-standalone-course-service";
import { getBunnyPlaybackUrl } from "@/lib/server/bunny-stream-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ courseId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;
  const lessonId = new URL(request.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
  const tree = await getAgencyStandaloneCourseTree({ agencyId: caller.agencyId!, courseId, includeUnpublished: true });
  const lesson = tree?.lessons.find((item) => item.id === lessonId);
  if (!tree || !lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  const embedUrl = lesson.hostedVideoId
    ? await getBunnyPlaybackUrl({ kind: "agency", agencyId: caller.agencyId! }, lesson.hostedVideoId)
    : null;
  return NextResponse.json({ embedUrl });
}
