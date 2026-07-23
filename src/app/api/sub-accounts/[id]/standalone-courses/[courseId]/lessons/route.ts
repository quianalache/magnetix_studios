import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { createStandaloneLessonServerSide } from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

/** Staff: add a lesson (optionally within a section). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; courseId: string }> },
) {
  const { id: subAccountId, courseId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { title?: string; sectionId?: string | null };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const lesson = await createStandaloneLessonServerSide({
    subAccountId,
    courseId,
    sectionId: body.sectionId ?? null,
    title: body.title ?? "New lesson",
  });
  return NextResponse.json({ ok: true, lesson });
}
