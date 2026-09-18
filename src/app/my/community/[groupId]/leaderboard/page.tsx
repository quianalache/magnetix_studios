import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import {
  getAgencyLeaderboard,
  getAgencyMemberPointStats,
  getAgencyPointsConfig,
} from "@/lib/server/agency-community-points-service";
import { listActiveAgencyRewardsServerSide } from "@/lib/server/agency-community-rewards-service";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { LeaderboardView, type ViewerLevelInfo } from "@/components/community/leaderboard/leaderboard-view";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

/** Real Agency Community member access — Leaderboard. */
export default async function MyAgencyCommunityLeaderboardPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/leaderboard`)}`);

  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
  }

  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this community.
      </div>
    );
  }
  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
  }

  const [rows7d, rows30d, rowsAll, stats, config, activeRewards] = await Promise.all([
    getAgencyLeaderboard({ agencyId, groupId, window: "7d", limit: 50 }),
    getAgencyLeaderboard({ agencyId, groupId, window: "30d", limit: 50 }),
    getAgencyLeaderboard({ agencyId, groupId, window: "all", limit: 50 }),
    getAgencyMemberPointStats(agencyId, groupId, membership.id),
    getAgencyPointsConfig(agencyId, groupId),
    listActiveAgencyRewardsServerSide(agencyId, groupId),
  ]);

  const levels = config.levels;
  const points = membership.points ?? 0;
  const viewerLevelIndex = levels.findIndex((l) => l.level === (membership.level ?? 1));
  const viewerLevel = levels[viewerLevelIndex] ?? levels[0];
  const nextLevel = levels[viewerLevelIndex + 1] ?? null;
  const viewerInfo: ViewerLevelInfo = {
    memberId: membership.id,
    displayName: agencyMemberDisplayName(membership),
    avatarUrl: null,
    level: viewerLevel.level,
    levelName: viewerLevel.name,
    points,
    nextLevelThreshold: nextLevel ? nextLevel.threshold : null,
    progress: nextLevel
      ? Math.max(0, Math.min(1, (points - viewerLevel.threshold) / (nextLevel.threshold - viewerLevel.threshold)))
      : null,
  };

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer = { memberId: membership.id, displayName: agencyMemberDisplayName(membership), avatarUrl: null, level: viewerLevel.level };

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="leaderboards"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      <LeaderboardView
        brand={brand}
        accent={resolvedTheme.accent}
        viewer={viewerInfo}
        rowsByWindow={{ "7d": rows7d, "30d": rows30d, all: rowsAll }}
        activeRewards={activeRewards}
        levels={levels}
        rules={config.rules}
        stats={stats}
      />
    </CommunityShell>
  );
}
