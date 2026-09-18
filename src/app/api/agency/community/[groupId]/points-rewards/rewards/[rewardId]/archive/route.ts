import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { archiveAgencyRewardServerSide } from "@/lib/server/agency-community-rewards-service";

export const dynamic = "force-dynamic";

/** Owner-only. Archives a reward — never deletes it. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; rewardId: string }> },
) {
  const { groupId, rewardId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  await archiveAgencyRewardServerSide({ agencyId: caller.agencyId, groupId, rewardId });
  return NextResponse.json({ ok: true });
}
