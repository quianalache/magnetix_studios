import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import {
  listCourseThemeTemplates,
  saveCourseThemeTemplateServerSide,
} from "@/lib/server/course-theme-template-service";
import type { CourseTheme } from "@/types/course-theme";

export const dynamic = "force-dynamic";

/** Staff: list saved theme templates for this sub-account. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const templates = await listCourseThemeTemplates(subAccountId);
  return NextResponse.json({ ok: true, templates });
}

/** Staff: save a course's current theme as a new reusable template. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { name?: string; theme?: CourseTheme };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim() || !body.theme) {
    return NextResponse.json(
      { error: "A template name and theme are required" },
      { status: 400 },
    );
  }

  const template = await saveCourseThemeTemplateServerSide({
    subAccountId,
    agencyId: access.resolvedAgencyId,
    name: body.name,
    theme: body.theme,
  });
  return NextResponse.json({ ok: true, template });
}
