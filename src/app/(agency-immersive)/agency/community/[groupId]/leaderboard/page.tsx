"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { LeaderboardView, type ViewerLevelInfo } from "@/components/community/leaderboard/leaderboard-view";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { LeaderboardRow, LeaderboardWindow } from "@/lib/server/community-leaderboard-service";
import type { MemberPointStats } from "@/lib/server/community-points-service";
import type { RewardWithEffectiveStatus } from "@/lib/server/community-rewards-service";
import type { CommunityLevel, PointRuleMap } from "@/types/points-rewards";
import type { CommunityGroup } from "@/types/community";

interface LeaderboardResponse {
  viewer: ViewerLevelInfo;
  rowsByWindow: Record<LeaderboardWindow, LeaderboardRow[]>;
  activeRewards: RewardWithEffectiveStatus[];
  levels: CommunityLevel[];
  rules: PointRuleMap;
  stats: MemberPointStats;
}

/** Agency Community Leaderboard — owner view. */
export default function AgencyCommunityLeaderboardPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { group: CommunityGroup }) => setGroup(d.group))
      .catch(() => setNotFound(true));
    void fetch(`/api/agency/community/${groupId}/leaderboard`)
      .then((r) => r.json())
      .then((d: LeaderboardResponse) => setData(d))
      .catch(() => setNotFound(true));
  }, [isOwner, groupId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  if (notFound) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
  }
  if (!group || !data) return <div className="mx-auto max-w-7xl p-8" />;

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="leaderboards"
      viewer={{ memberId: "", displayName: "Owner", avatarUrl: null, level: 1 }}
      viewerIsModerator
      embedded={false}
    >
      <LeaderboardView
        brand={brand}
        accent={resolvedTheme.accent}
        viewer={data.viewer}
        rowsByWindow={data.rowsByWindow}
        activeRewards={data.activeRewards}
        levels={data.levels}
        rules={data.rules}
        stats={data.stats}
      />
    </CommunityShell>
  );
}
