import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import {
  getLeaderboard,
  type LeaderboardWindow,
} from "@/lib/server/community-leaderboard-service";
import {
  getPointsConfig,
  getMemberPointStats,
  levelForConfig,
} from "@/lib/server/community-points-service";
import { listActiveRewardsServerSide } from "@/lib/server/community-rewards-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  LeaderboardView,
  type ViewerLevelInfo,
} from "@/components/community/leaderboard/leaderboard-view";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

function serializeForClient<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Staff Community-in-CRM — Leaderboard. Close mirror of
 *  /c/[saId]/[groupSlug]/leaderboards/page.tsx — see the Staff Community
 *  Integration report. */
export default async function StaffLeaderboardPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/leaderboard`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  // Theme parity (2026-08-29 closeout) — same shared resolver as Community
  // Home; see that page's identical comment for the full rationale.
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const windows: LeaderboardWindow[] = ["7d", "30d", "all"];
  const [rows7d, rows30d, rowsAll, config, activeRewards, stats] =
    await Promise.all([
      getLeaderboard({
        subAccountId: saId,
        groupId: group.id,
        window: windows[0],
        limit: 50,
      }),
      getLeaderboard({
        subAccountId: saId,
        groupId: group.id,
        window: windows[1],
        limit: 50,
      }),
      getLeaderboard({
        subAccountId: saId,
        groupId: group.id,
        window: windows[2],
        limit: 50,
      }),
      getPointsConfig(saId, group.id),
      listActiveRewardsServerSide(saId, group.id),
      getMemberPointStats(saId, group.id, member.id),
    ]);

  const viewerLevelIndex = config.levels.findIndex(
    (l) => l.level === levelForConfig(config, membership.points ?? 0)
  );
  const viewerLevel = config.levels[viewerLevelIndex] ?? config.levels[0];
  const nextLevel = config.levels[viewerLevelIndex + 1] ?? null;
  const points = membership.points ?? 0;

  const viewerInfo: ViewerLevelInfo = {
    memberId: member.id,
    displayName: viewer.displayName,
    avatarUrl: viewer.avatarUrl,
    level: viewerLevel.level,
    levelName: viewerLevel.name,
    points,
    nextLevelThreshold: nextLevel ? nextLevel.threshold : null,
    progress: nextLevel
      ? Math.max(
          0,
          Math.min(
            1,
            (points - viewerLevel.threshold) /
              (nextLevel.threshold - viewerLevel.threshold)
          )
        )
      : null,
  };

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="leaderboards"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      staffGroupId={groupId}
      embedded={false}
    >
      <LeaderboardView
        brand={brand}
        accent={resolvedTheme.accent}
        viewer={viewerInfo}
        rowsByWindow={{ "7d": rows7d, "30d": rows30d, all: rowsAll }}
        activeRewards={serializeForClient(activeRewards)}
        levels={config.levels}
        rules={config.rules}
        stats={stats}
      />
    </CommunityShell>
  );
}
