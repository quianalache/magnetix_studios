import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { unlinkCommunityGroupServerSide } from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

/** Staff: unlink a Community Group from this course. */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; courseId: string; groupId: string }> },
) {
  const { id: subAccountId, courseId, groupId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await unlinkCommunityGroupServerSide({ subAccountId, courseId, groupId });
  return NextResponse.json({ ok: true });
}
