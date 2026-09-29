import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { linkAgencyCommunityGroupServerSide } from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

/** Owner: link an existing Agency Community Group to this course. */
export async function POST(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as { groupId?: string } | null;
  if (!body?.groupId) return NextResponse.json({ error: "Missing groupId" }, { status: 400 });

  await linkAgencyCommunityGroupServerSide({ agencyId: caller.agencyId!, courseId, groupId: body.groupId });
  return NextResponse.json({ ok: true });
}
