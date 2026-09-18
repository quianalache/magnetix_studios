import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  deleteAgencyStandaloneLessonServerSide,
  updateAgencyStandaloneLessonServerSide,
  type AgencyStandaloneLessonPatch,
} from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId, lessonId } = await ctx.params;

  let patch: AgencyStandaloneLessonPatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await updateAgencyStandaloneLessonServerSide({ agencyId: caller.agencyId!, courseId, lessonId, patch });
  if (result.videoError) {
    return NextResponse.json(
      { ok: false, error: "That video link wasn't recognized. Paste a YouTube, Vimeo, Loom, Descript, or Wistia URL. Other fields were saved." },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId, lessonId } = await ctx.params;
  await deleteAgencyStandaloneLessonServerSide({ agencyId: caller.agencyId!, courseId, lessonId });
  return NextResponse.json({ ok: true });
}
