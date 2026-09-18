import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencyStandaloneLessonServerSide } from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;

  let body: { title?: string; sectionId?: string | null };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const lesson = await createAgencyStandaloneLessonServerSide({
    agencyId: caller.agencyId!,
    courseId,
    sectionId: body.sectionId ?? null,
    title: body.title ?? "New lesson",
  });
  return NextResponse.json({ ok: true, lesson });
}
