import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  evaluateEligibleAgencyWinners,
  listAgencyRewardsServerSide,
} from "@/lib/server/agency-community-rewards-service";

export const dynamic = "force-dynamic";

/** Owner-only. The Award Winner modal's candidate list for a calculable
 *  criterion — surfaced for the owner to CONFIRM, never auto-granted. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string; rewardId: string }> },
) {
  const { groupId, rewardId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  const rewards = await listAgencyRewardsServerSide(caller.agencyId, groupId);
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) return NextResponse.json({ error: "Reward not found" }, { status: 404 });
  const candidates = await evaluateEligibleAgencyWinners(caller.agencyId, groupId, reward.criterion);
  return NextResponse.json({ ok: true, candidates });
}
