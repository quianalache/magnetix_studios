import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyCourseApiAccess } from "@/lib/standalone-courses/agency-course-access";
import { hasPaidAgencyStandaloneCourse } from "@/lib/server/agency-standalone-course-purchase-service";

export const dynamic = "force-dynamic";

/** Polled by the `purchase-complete` page while it waits for the Stripe
 *  webhook to grant access. Scoped to the caller's own Person session. */
export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const access = await requireAgencyCourseApiAccess(courseId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const paid = await hasPaidAgencyStandaloneCourse(access.agencyId, courseId, access.person.id);
  return NextResponse.json({ paid });
}
