import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencyLessonServerSide } from "@/lib/server/agency-community-classroom-service";

export const dynamic = "force-dynamic";

/** Owner-only: add a lesson (optionally within a section). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId } = await ctx.params;

  let body: { title?: string; sectionId?: string | null };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const lesson = await createAgencyLessonServerSide({
    agencyId: caller.agencyId!,
    groupId,
    courseId,
    sectionId: body.sectionId ?? null,
    title: body.title ?? "New lesson",
  });
  return NextResponse.json({ ok: true, lesson });
}
