import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import {
  deleteStandaloneLessonServerSide,
  updateStandaloneLessonServerSide,
  type StandaloneLessonPatch,
} from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: {
    params: Promise<{ id: string; courseId: string; lessonId: string }>;
  },
) {
  const { id: subAccountId, courseId, lessonId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: StandaloneLessonPatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await updateStandaloneLessonServerSide({
    subAccountId,
    courseId,
    lessonId,
    patch,
  });
  if (result.videoError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "That video link wasn't recognized. Paste a YouTube, Vimeo, Loom, or Descript URL. Other fields were saved.",
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: {
    params: Promise<{ id: string; courseId: string; lessonId: string }>;
  },
) {
  const { id: subAccountId, courseId, lessonId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteStandaloneLessonServerSide({ subAccountId, courseId, lessonId });
  return NextResponse.json({ ok: true });
}
