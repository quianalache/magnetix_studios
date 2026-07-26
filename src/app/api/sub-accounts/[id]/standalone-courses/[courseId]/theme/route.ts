import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { updateStandaloneCourseThemeServerSide } from "@/lib/server/standalone-course-service";
import type { CourseTheme } from "@/types/course-theme";

export const dynamic = "force-dynamic";

/** Staff: full-object replace of a course's theme (the theme editor's Save). */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; courseId: string }> },
) {
  const { id: subAccountId, courseId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let theme: CourseTheme;
  try {
    const body = (await request.json()) as { theme?: CourseTheme };
    if (!body.theme) throw new Error("Missing theme");
    theme = body.theme;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await updateStandaloneCourseThemeServerSide({ subAccountId, courseId, theme });
  return NextResponse.json({ ok: true });
}
