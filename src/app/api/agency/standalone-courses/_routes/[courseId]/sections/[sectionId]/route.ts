import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  deleteAgencyStandaloneSectionServerSide,
  updateAgencyStandaloneSectionServerSide,
} from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ courseId: string; sectionId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId, sectionId } = await ctx.params;

  let patch: { title?: string; order?: number };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateAgencyStandaloneSectionServerSide({ agencyId: caller.agencyId!, courseId, sectionId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ courseId: string; sectionId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId, sectionId } = await ctx.params;
  await deleteAgencyStandaloneSectionServerSide({ agencyId: caller.agencyId!, courseId, sectionId });
  return NextResponse.json({ ok: true });
}
