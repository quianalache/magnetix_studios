import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { PointsRewardsWorkspace } from "@/components/community/settings/points-rewards/points-rewards-workspace";
import {
  getPointsConfig,
  getPointsOverview,
} from "@/lib/server/community-points-service";
import {
  listActiveRewardsServerSide,
  listRewardsServerSide,
  listWinnersServerSide,
} from "@/lib/server/community-rewards-service";
import { listMemberDirectory } from "@/lib/server/community-leaderboard-service";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/** Same JSON-round-trip Timestamp-class-instance fix as the member-facing
 *  page (config.updatedAt / reward createdAt/updatedAt/startAt/endAt are
 *  real Firestore Timestamp class instances once real data exists — see
 *  settings/points-rewards/page.tsx in the /c route tree). */
function serializeForClient<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Staff Community-in-CRM — Settings → Points & Rewards. Close mirror of
 *  /c/[saId]/[groupSlug]/settings/points-rewards/page.tsx — see the Staff
 *  Community Integration report. */
export default async function StaffCommunityPointsRewardsSettingsPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/settings/points-rewards`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const [config, rewards, activeRewards, winners, directory] =
    await Promise.all([
      getPointsConfig(saId, group.id),
      listRewardsServerSide(saId, group.id),
      listActiveRewardsServerSide(saId, group.id),
      listWinnersServerSide(saId, group.id),
      listMemberDirectory({ subAccountId: saId, groupId: group.id }),
    ]);

  const activeMemberCount = directory.filter(
    (m) => m.status === "active"
  ).length;
  const overview = await getPointsOverview({
    subAccountId: saId,
    groupId: group.id,
    activeMemberCount,
    activeRewardsCount: activeRewards.length,
  });

  const memberById = new Map(directory.map((m) => [m.memberId, m]));
  const rewardById = new Map(rewards.map((r) => [r.id, r]));

  const winnersEnriched = winners.map((w) => ({
    ...w,
    memberDisplayName:
      memberById.get(w.memberId)?.displayName ?? "Former member",
    memberAvatarUrl: memberById.get(w.memberId)?.avatarUrl ?? null,
    rewardTitle: rewardById.get(w.rewardId)?.title ?? "(deleted reward)",
  }));

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="settings"
      viewer={viewer}
      viewerIsModerator
      staffGroupId={groupId}
      embedded={false}
    >
      <PointsRewardsWorkspace
        saId={saId}
        pretty={false}
        staffGroupId={groupId}
        groupId={group.id}
        groupSlug={group.slug}
        brand={brand}
        viewerDisplayName={viewer.displayName}
        initialConfig={serializeForClient(config)}
        initialRewards={serializeForClient(rewards)}
        initialWinners={serializeForClient(winnersEnriched)}
        overview={overview}
      />
    </CommunityShell>
  );
}
