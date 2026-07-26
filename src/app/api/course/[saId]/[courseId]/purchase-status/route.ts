import "server-only";

import { NextResponse } from "next/server";
import { requireCourseApiAccess } from "@/lib/standalone-courses/course-access";
import { hasPaidStandaloneCourse } from "@/lib/server/standalone-course-purchase-service";

export const dynamic = "force-dynamic";

/**
 * Polled by the `purchase-complete` page while it waits for the Stripe
 * webhook to grant access. Scoped to the caller's own member session (never
 * a query param), so there's no cross-member data leak.
 */
export async function GET(
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
  const paid = await hasPaidStandaloneCourse(saId, courseId, access.member.id);
  return NextResponse.json({ paid });
}
