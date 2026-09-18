import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  deleteAgencyLessonServerSide,
  updateAgencyLessonServerSide,
  type AgencyLessonPatch,
} from "@/lib/server/agency-community-classroom-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string; lessonId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId, lessonId } = await ctx.params;

  let patch: AgencyLessonPatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await updateAgencyLessonServerSide({ agencyId: caller.agencyId!, groupId, courseId, lessonId, patch });
  if (result.videoError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "That video link wasn't recognized. Paste a YouTube, Vimeo, Loom, Descript, or Wistia URL. Other fields were saved.",
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string; lessonId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId, lessonId } = await ctx.params;
  await deleteAgencyLessonServerSide({ agencyId: caller.agencyId!, groupId, courseId, lessonId });
  return NextResponse.json({ ok: true });
}
