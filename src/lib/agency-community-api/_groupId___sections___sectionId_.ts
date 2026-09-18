import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  updateAgencySectionServerSide,
  deleteAgencySectionServerSide,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — update/delete a section. Owner-only. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; sectionId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, sectionId } = await ctx.params;

  let body: { name?: string; icon?: string; private?: boolean; order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const section = await updateAgencySectionServerSide(
      caller.agencyId!,
      groupId,
      sectionId,
      body,
    );
    return NextResponse.json({ ok: true, section });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't update section" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; sectionId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, sectionId } = await ctx.params;

  await deleteAgencySectionServerSide(caller.agencyId!, groupId, sectionId);
  return NextResponse.json({ ok: true });
}
