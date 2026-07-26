import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { applyCourseThemeTemplateServerSide } from "@/lib/server/course-theme-template-service";

export const dynamic = "force-dynamic";

/** Staff: apply a saved template onto a course (deep-copy, not a reference). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: subAccountId, templateId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { courseId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  try {
    await applyCourseThemeTemplateServerSide({
      subAccountId,
      courseId: body.courseId,
      templateId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't apply template" },
      { status: 400 },
    );
  }
}
