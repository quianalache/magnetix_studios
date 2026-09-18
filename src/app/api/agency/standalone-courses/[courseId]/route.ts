import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  deleteAgencyStandaloneCourseServerSide,
  getAgencyStandaloneCourseTree,
  updateAgencyStandaloneCourseServerSide,
  type AgencyStandaloneCoursePatch,
} from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

/** Owner-only. GET returns the full tree (course + sections + ALL lessons)
 *  for the builder's own client-fetch load. */
export async function GET(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;
  const tree = await getAgencyStandaloneCourseTree({ agencyId: caller.agencyId!, courseId, includeUnpublished: true });
  if (!tree) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  return NextResponse.json(tree);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;

  let patch: AgencyStandaloneCoursePatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    await updateAgencyStandaloneCourseServerSide({ agencyId: caller.agencyId!, courseId, patch });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;
  await deleteAgencyStandaloneCourseServerSide({ agencyId: caller.agencyId!, courseId });
  return NextResponse.json({ ok: true });
}
