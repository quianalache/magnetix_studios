import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { linkCommunityGroupServerSide } from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

/** Staff: link an existing Community Group to this course. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; courseId: string }> },
) {
  const { id: subAccountId, courseId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as {
    groupId?: string;
  } | null;
  if (!body?.groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  await linkCommunityGroupServerSide({
    subAccountId,
    courseId,
    groupId: body.groupId,
  });
  return NextResponse.json({ ok: true });
}
