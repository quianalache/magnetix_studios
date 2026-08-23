import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { PointsRewardsWorkspace } from "@/components/community/settings/points-rewards/points-rewards-workspace";
import { getPointsConfig, getPointsOverview } from "@/lib/server/community-points-service";
import {
  listActiveRewardsServerSide,
  listRewardsServerSide,
  listWinnersServerSide,
} from "@/lib/server/community-rewards-service";
import { listMemberDirectory } from "@/lib/server/community-leaderboard-service";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Real bug found live during QA: `PointsRewardsConfig.updatedAt` and
 * `CommunityReward.createdAt`/`updatedAt`/`startAt`/`endAt` are typed
 * `Timestamp | FieldValue | null` — a genuine Firestore Admin `Timestamp`
 * CLASS instance once a document has actually been saved (the default,
 * never-yet-saved config returns `null` here instead, which is why this
 * went unnoticed until a real Levels/Rules save happened). Next.js's
 * Server → Client Component boundary (React Flight) rejects any
 * non-plain class instance outright — passing one crashes the whole page
 * with "Only plain objects... can be passed to Client Components".
 * A JSON round-trip is the smallest safe fix: it turns every Timestamp
 * into a plain `{_seconds, _nanoseconds}` object (confirmed via
 * `JSON.stringify` on a real `Timestamp`), which every client-side
 * `toMillis()` helper in this feature already tolerates as one of its
 * recognized shapes — so no client component needed any changes.
 */
function serializeForClient<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Community Settings → Points & Rewards. Same admin-only re-verification
 * as every other Settings page (a moderator-role check independent of
 * whatever the Settings nav happens to show/hide client-side). One route,
 * one workspace component — Overview/Points System/Levels/Rewards/Winners
 * are client-side tabs inside it, not five separate page routes.
 */
export default async function CommunityPointsRewardsSettingsPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();

  const pretty = await isCommunityPrettyRequest(saId);
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const [config, rewards, activeRewards, winners, directory] = await Promise.all([
    getPointsConfig(saId, group.id),
    listRewardsServerSide(saId, group.id),
    listActiveRewardsServerSide(saId, group.id),
    listWinnersServerSide(saId, group.id),
    listMemberDirectory({ subAccountId: saId, groupId: group.id }),
  ]);

  const activeMemberCount = directory.filter((m) => m.status === "active").length;
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
    memberDisplayName: memberById.get(w.memberId)?.displayName ?? "Former member",
    memberAvatarUrl: memberById.get(w.memberId)?.avatarUrl ?? null,
    rewardTitle: rewardById.get(w.rewardId)?.title ?? "(deleted reward)",
  }));

  return (
    <CommunityShell
      saId={saId}
      pretty={pretty}
      group={group}
      active="settings"
      viewer={viewer}
      viewerIsModerator
    >
      <PointsRewardsWorkspace
        saId={saId}
        pretty={pretty}
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
