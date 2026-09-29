import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import {
  deleteStandaloneSectionServerSide,
  updateStandaloneSectionServerSide,
} from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: {
    params: Promise<{ id: string; courseId: string; sectionId: string }>;
  },
) {
  const { id: subAccountId, courseId, sectionId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: { title?: string; order?: number };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateStandaloneSectionServerSide({
    subAccountId,
    courseId,
    sectionId,
    patch,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: {
    params: Promise<{ id: string; courseId: string; sectionId: string }>;
  },
) {
  const { id: subAccountId, courseId, sectionId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteStandaloneSectionServerSide({ subAccountId, courseId, sectionId });
  return NextResponse.json({ ok: true });
}
