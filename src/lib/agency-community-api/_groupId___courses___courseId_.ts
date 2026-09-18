import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  deleteAgencyCourseServerSide,
  getAgencyCourseTree,
  updateAgencyCourseServerSide,
  type AgencyCoursePatch,
} from "@/lib/server/agency-community-classroom-service";

export const dynamic = "force-dynamic";

/** Owner-only. GET returns the full tree (course + sections + ALL lessons,
 *  including unpublished) for the builder's own client-fetch load. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId } = await ctx.params;
  const tree = await getAgencyCourseTree({
    agencyId: caller.agencyId!,
    groupId,
    courseId,
    includeUnpublished: true,
  });
  if (!tree) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  return NextResponse.json(tree);
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId } = await ctx.params;

  let patch: AgencyCoursePatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateAgencyCourseServerSide({ agencyId: caller.agencyId!, groupId, courseId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId } = await ctx.params;
  await deleteAgencyCourseServerSide({ agencyId: caller.agencyId!, groupId, courseId });
  return NextResponse.json({ ok: true });
}
