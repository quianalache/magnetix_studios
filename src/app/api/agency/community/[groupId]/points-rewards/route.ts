import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { getAgencyGroupById, listAgencyGroupMembers } from "@/lib/server/community-agency-service";
import { getAgencyPointsConfig, getAgencyPointsOverview } from "@/lib/server/agency-community-points-service";
import {
  listAgencyRewardsServerSide,
  listActiveAgencyRewardsServerSide,
  listAgencyWinnersServerSide,
} from "@/lib/server/agency-community-rewards-service";

export const dynamic = "force-dynamic";

/**
 * Agency Community Settings → Points & Rewards — owner-only bootstrap read.
 * Bundles config + rewards + winners (enriched with member name/avatar and
 * reward title, same shape the tenant Settings PAGE assembles server-side)
 * + the Overview's 5 numbers into one response, matching this owner
 * settings surface's established single-fetch client convention (see
 * Branding/Navigation's own `/api/agency/community/[groupId]` fetch).
 */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const group = await getAgencyGroupById(caller.agencyId, groupId);
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [config, rewards, activeRewards, winners, roster] = await Promise.all([
    getAgencyPointsConfig(caller.agencyId, groupId),
    listAgencyRewardsServerSide(caller.agencyId, groupId),
    listActiveAgencyRewardsServerSide(caller.agencyId, groupId),
    listAgencyWinnersServerSide(caller.agencyId, groupId),
    listAgencyGroupMembers(caller.agencyId, groupId),
  ]);

  const activeMemberCount = roster.filter((m) => m.status === "active").length;
  const overview = await getAgencyPointsOverview({
    agencyId: caller.agencyId,
    groupId,
    activeMemberCount,
    activeRewardsCount: activeRewards.length,
  });

  const memberById = new Map(roster.map((m) => [m.id, m]));
  const rewardById = new Map(rewards.map((r) => [r.id, r]));
  const winnersEnriched = winners.map((w) => {
    const member = memberById.get(w.memberId);
    return {
      ...w,
      memberDisplayName: member?.displayName?.trim() || member?.email.split("@")[0] || "Former member",
      memberAvatarUrl: null,
      rewardTitle: rewardById.get(w.rewardId)?.title ?? "(deleted reward)",
    };
  });

  return NextResponse.json({ ok: true, config, rewards, winners: winnersEnriched, overview });
}
