import { NextResponse } from "next/server";
import { requireCourseApiAccess } from "@/lib/standalone-courses/course-access";
import { enrollInStandaloneCourseServerSide } from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

/** Member: enroll in a free ("open") standalone course. Idempotent. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ saId: string; courseId: string }> },
) {
  const { saId, courseId } = await params;
  const access = await requireCourseApiAccess(saId, courseId);
  if (access.kind === "error") {
    return NextResponse.json(
      { error: access.message },
      { status: access.status },
    );
  }
  if (access.course.access !== "open") {
    return NextResponse.json(
      { error: "This course requires purchase." },
      { status: 400 },
    );
  }

  await enrollInStandaloneCourseServerSide({
    subAccountId: saId,
    agencyId: access.gate.agencyId,
    courseId,
    memberId: access.member.id,
  });
  return NextResponse.json({ ok: true });
}
