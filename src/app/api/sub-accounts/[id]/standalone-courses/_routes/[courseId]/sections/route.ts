import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { createStandaloneSectionServerSide } from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

/** Staff: add a section to a standalone course. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; courseId: string }> },
) {
  const { id: subAccountId, courseId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const section = await createStandaloneSectionServerSide({
    subAccountId,
    courseId,
    title: body.title ?? "New section",
  });
  return NextResponse.json({ ok: true, section });
}
