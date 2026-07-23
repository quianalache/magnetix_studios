import { NextResponse } from "next/server";
import { requireCourseApiAccess } from "@/lib/standalone-courses/course-access";
import { markStandaloneLessonCompleteServerSide } from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

/** Member: mark a lesson complete (idempotent). */
export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ saId: string; courseId: string; lessonId: string }>;
  },
) {
  const { saId, courseId, lessonId } = await params;
  const access = await requireCourseApiAccess(saId, courseId);
  if (access.kind === "error") {
    return NextResponse.json(
      { error: access.message },
      { status: access.status },
    );
  }
  const result = await markStandaloneLessonCompleteServerSide({
    subAccountId: saId,
    agencyId: access.gate.agencyId,
    courseId,
    memberId: access.member.id,
    lessonId,
  });
  return NextResponse.json({ ok: true, ...result });
}
