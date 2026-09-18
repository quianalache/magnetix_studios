import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  deleteAgencySectionServerSide,
  updateAgencySectionServerSide,
} from "@/lib/server/agency-community-classroom-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string; sectionId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId, sectionId } = await ctx.params;

  let patch: { title?: string; order?: number };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateAgencySectionServerSide({ agencyId: caller.agencyId!, groupId, courseId, sectionId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string; sectionId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId, sectionId } = await ctx.params;
  await deleteAgencySectionServerSide({ agencyId: caller.agencyId!, groupId, courseId, sectionId });
  return NextResponse.json({ ok: true });
}
