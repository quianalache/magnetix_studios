import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
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
import { LeaderboardView, type ViewerLevelInfo } from "@/components/community/leaderboard/leaderboard-view";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Member-facing Leaderboard — the approved mockup's full page (personal
 * level progress, 7d/30d/all-time rankings, active rewards, "How points
 * work"). All 3 ranking windows are fetched here, server-side, in one go
 * — the client view switches between them with no extra request, and
 * `?window=` is no longer read (kept in the type only so the existing
 * custom-domain wrapper, which still forwards it, doesn't need touching).
 */
export default async function LeaderboardsPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
  searchParams?: Promise<{ window?: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const pretty = await isCommunityPrettyRequest(saId);

  const { group, member, membership } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const windows: LeaderboardWindow[] = ["7d", "30d", "all"];
  const [rows7d, rows30d, rowsAll, config, activeRewards, stats] = await Promise.all([
    getLeaderboard({ subAccountId: saId, groupId: group.id, window: windows[0], limit: 50 }),
    getLeaderboard({ subAccountId: saId, groupId: group.id, window: windows[1], limit: 50 }),
    getLeaderboard({ subAccountId: saId, groupId: group.id, window: windows[2], limit: 50 }),
    getPointsConfig(saId, group.id),
    listActiveRewardsServerSide(saId, group.id),
    getMemberPointStats(saId, group.id, member.id),
  ]);

  const viewerLevelIndex = config.levels.findIndex((l) => l.level === levelForConfig(config, membership.points ?? 0));
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
      ? Math.max(0, Math.min(1, (points - viewerLevel.threshold) / (nextLevel.threshold - viewerLevel.threshold)))
      : null,
  };

  return (
    <CommunityShell saId={saId} pretty={pretty} group={group} active="leaderboards" viewer={viewer} viewerIsModerator={membership.role === "moderator"}>
      <LeaderboardView
        brand={brand}
        viewer={viewerInfo}
        rowsByWindow={{ "7d": rows7d, "30d": rows30d, all: rowsAll }}
        activeRewards={activeRewards}
        levels={config.levels}
        rules={config.rules}
        stats={stats}
      />
    </CommunityShell>
  );
}
