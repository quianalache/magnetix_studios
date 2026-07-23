import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { markStandaloneCoursePurchasePaidServerSide } from "@/lib/server/standalone-course-purchase-service";

export const dynamic = "force-dynamic";

/** Staff: mark a one-time course purchase paid and grant classroom access. */
export async function POST(
  request: Request,
  ctx: {
    params: Promise<{ id: string; courseId: string; purchaseId: string }>;
  },
) {
  const { id: subAccountId, courseId, purchaseId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await markStandaloneCoursePurchasePaidServerSide({
      subAccountId,
      courseId,
      purchaseId,
      grantedByUid: access.uid,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't mark paid" },
      { status: 400 },
    );
  }
}
