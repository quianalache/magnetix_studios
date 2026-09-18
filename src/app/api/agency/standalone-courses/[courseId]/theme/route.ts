import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { updateAgencyStandaloneCourseThemeServerSide } from "@/lib/server/agency-standalone-course-service";
import type { CourseTheme, LessonTheme } from "@/types/course-theme";

export const dynamic = "force-dynamic";

/** Owner-only: full-object replace of an agency course's theme and/or
 *  lessonTheme. Mirrors /api/sub-accounts/[id]/standalone-courses/
 *  [courseId]/theme. */
export async function PATCH(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;

  let theme: CourseTheme;
  let lessonTheme: LessonTheme | undefined;
  try {
    const body = (await request.json()) as { theme?: CourseTheme; lessonTheme?: LessonTheme };
    if (!body.theme) throw new Error("Missing theme");
    theme = body.theme;
    lessonTheme = body.lessonTheme;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await updateAgencyStandaloneCourseThemeServerSide({ agencyId: caller.agencyId!, courseId, theme, lessonTheme });
  return NextResponse.json({ ok: true });
}
