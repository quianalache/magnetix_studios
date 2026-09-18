import { NextResponse } from "next/server";
import { requireAgencyCourseApiAccess } from "@/lib/standalone-courses/agency-course-access";
import { markAgencyStandaloneLessonCompleteServerSide } from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

/** Signed-in Person: mark a lesson complete (idempotent). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; lessonId: string }> },
) {
  const { courseId, lessonId } = await params;
  const access = await requireAgencyCourseApiAccess(courseId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const result = await markAgencyStandaloneLessonCompleteServerSide({
    agencyId: access.agencyId,
    courseId,
    personId: access.person.id,
    lessonId,
  });
  return NextResponse.json({ ok: true, ...result });
}
