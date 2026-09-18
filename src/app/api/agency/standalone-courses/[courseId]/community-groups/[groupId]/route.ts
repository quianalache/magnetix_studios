import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { unlinkAgencyCommunityGroupServerSide } from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

/** Owner: unlink an Agency Community Group from this course. */
export async function DELETE(request: Request, ctx: { params: Promise<{ courseId: string; groupId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId, groupId } = await ctx.params;
  await unlinkAgencyCommunityGroupServerSide({ agencyId: caller.agencyId!, courseId, groupId });
  return NextResponse.json({ ok: true });
}
