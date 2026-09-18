import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listAgencyCourseThemeTemplates, saveAgencyCourseThemeTemplateServerSide } from "@/lib/server/agency-course-theme-template-service";
import type { CourseTheme, LessonTheme } from "@/types/course-theme";

export const dynamic = "force-dynamic";

/** Owner-only: list / save reusable theme templates. */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const templates = await listAgencyCourseThemeTemplates(caller.agencyId!);
  return NextResponse.json({ ok: true, templates });
}

export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let body: { name?: string; theme?: CourseTheme; lessonTheme?: LessonTheme };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim() || !body.theme) {
    return NextResponse.json({ error: "A template name and theme are required" }, { status: 400 });
  }

  const template = await saveAgencyCourseThemeTemplateServerSide({ agencyId: caller.agencyId!, name: body.name, theme: body.theme, lessonTheme: body.lessonTheme });
  return NextResponse.json({ ok: true, template });
}
