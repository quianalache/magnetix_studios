"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { PointsRewardsWorkspace } from "@/components/community/settings/points-rewards/points-rewards-workspace";
import type { PointsRewardsConfig, CommunityRewardWinner } from "@/types/points-rewards";
import type { RewardWithEffectiveStatus } from "@/lib/server/community-rewards-service";
import type { PointsOverview } from "@/lib/server/community-points-service";
import type { CommunityGroup } from "@/types/community";

interface WinnerEnriched extends CommunityRewardWinner {
  memberDisplayName: string;
  memberAvatarUrl: string | null;
  rewardTitle: string;
}

interface Bootstrap {
  config: PointsRewardsConfig;
  rewards: RewardWithEffectiveStatus[];
  winners: WinnerEnriched[];
  overview: PointsOverview;
}

/** Agency Community Settings → Points & Rewards — owner view. Reuses the
 *  exact tenant PointsRewardsWorkspace (all 5 tabs: Overview, Points
 *  System, Levels, Rewards, Winners) with agencyGroupId set — only the API
 *  base and two hrefs branch differently inside that component. */
export default function AgencyCommunityPointsRewardsSettingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [data, setData] = useState<Bootstrap | null>(null);
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
    void fetch(`/api/agency/community/${groupId}/points-rewards`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: Bootstrap) => setData(d))
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

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      group={group}
      active="settings"
      viewer={{ memberId: "", displayName: "Owner", avatarUrl: null, level: 1 }}
      viewerIsModerator
      embedded={false}
    >
      <PointsRewardsWorkspace
        saId=""
        agencyGroupId={groupId}
        groupId={group.id}
        groupSlug={group.slug}
        brand={brand}
        viewerDisplayName="Owner"
        initialConfig={data.config}
        initialRewards={data.rewards}
        initialWinners={data.winners}
        overview={data.overview}
      />
    </CommunityShell>
  );
}
