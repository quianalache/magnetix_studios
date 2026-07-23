import { NextResponse } from "next/server";
import { requireCourseApiAccess } from "@/lib/standalone-courses/course-access";
import { requestStandaloneCoursePurchaseServerSide } from "@/lib/server/standalone-course-purchase-service";

export const dynamic = "force-dynamic";

/**
 * Member: start a one-time purchase for a standalone course. Returns the
 * paypal.me URL to pay at; access is granted when a staff admin marks the
 * purchase paid. Mirrors `/api/community/[saId]/[groupId]/purchase`'s
 * course-scope path, minus the group-membership requirement.
 */
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

  try {
    const result = await requestStandaloneCoursePurchaseServerSide({
      subAccountId: saId,
      courseId,
      memberId: access.member.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't start purchase" },
      { status: 400 },
    );
  }
}
