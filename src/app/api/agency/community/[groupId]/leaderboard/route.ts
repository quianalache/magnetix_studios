import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller, agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import {
  getAgencyLeaderboard,
  getAgencyMemberPointStats,
  getAgencyPointsConfig,
} from "@/lib/server/agency-community-points-service";
import { listActiveAgencyRewardsServerSide } from "@/lib/server/agency-community-rewards-service";
import { getAgencyGroupById } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/**
 * Agency Community Leaderboard — bundles rows for all 3 windows + the
 * viewer's own level/stats into one response, matching the owner page's
 * established client-fetch convention. Levels/rules/active rewards now
 * reflect this group's real, possibly-customized Points & Rewards config
 * (see agency-community-points-service.ts / agency-community-rewards-
 * service.ts) instead of the shipped defaults.
 */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  const group = await getAgencyGroupById(caller.agencyId, groupId);
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [rows7d, rows30d, rowsAll, config, activeRewards] = await Promise.all([
    getAgencyLeaderboard({ agencyId: caller.agencyId, groupId, window: "7d", limit: 50 }),
    getAgencyLeaderboard({ agencyId: caller.agencyId, groupId, window: "30d", limit: 50 }),
    getAgencyLeaderboard({ agencyId: caller.agencyId, groupId, window: "all", limit: 50 }),
    getAgencyPointsConfig(caller.agencyId, groupId),
    listActiveAgencyRewardsServerSide(caller.agencyId, groupId),
  ]);

  const levels = config.levels;
  const rules = config.rules;

  let viewer;
  let stats;
  if (caller.kind === "member") {
    const points = caller.membership.points ?? 0;
    const viewerLevelIndex = levels.findIndex((l) => l.level === (caller.membership.level ?? 1));
    const viewerLevel = levels[viewerLevelIndex] ?? levels[0];
    const nextLevel = levels[viewerLevelIndex + 1] ?? null;
    viewer = {
      memberId: caller.membership.id,
      displayName: agencyMemberDisplayName(caller.membership),
      avatarUrl: null,
      level: viewerLevel.level,
      levelName: viewerLevel.name,
      points,
      nextLevelThreshold: nextLevel ? nextLevel.threshold : null,
      progress: nextLevel
        ? Math.max(0, Math.min(1, (points - viewerLevel.threshold) / (nextLevel.threshold - viewerLevel.threshold)))
        : null,
    };
    stats = await getAgencyMemberPointStats(caller.agencyId, groupId, caller.membership.id);
  } else {
    // The owner has no roster membership/points of their own — a neutral,
    // zeroed viewer card (their own posts don't earn points, by design;
    // see agency-community-points-service.ts).
    viewer = {
      memberId: caller.uid,
      displayName: "Owner",
      avatarUrl: null,
      level: 1,
      levelName: levels[0].name,
      points: 0,
      nextLevelThreshold: levels[1]?.threshold ?? null,
      progress: 0,
    };
    stats = { totalPoints: 0, posts: 0, comments: 0, likesGiven: 0, membersInvited: 0 };
  }

  return NextResponse.json({
    pointsEnabled: group.pointsEnabled === true,
    viewer,
    rowsByWindow: { "7d": rows7d, "30d": rows30d, all: rowsAll },
    activeRewards,
    levels,
    rules,
    stats,
  });
}
