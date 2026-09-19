import "server-only";

import {
  getPointsConfigByScope,
  updatePointRulesByScope,
  updateLevelsByScope,
  awardPointsByScope,
  revokePointsByScope,
  getMemberPointStatsByScope,
  getPointsOverviewByScope,
  levelForConfig,
  validateRules,
  validateLevels,
  LevelValidationError,
  type MemberPointStats,
  type PointsOverview,
  type AwardPointsResult,
} from "@/lib/server/community-points-service";
import { getLeaderboardByScope, type LeaderboardWindow, type LeaderboardRow } from "@/lib/server/community-leaderboard-service";
import { agencyScope } from "@/lib/server/community-scope";
import type { CommunityLevel, PointActionKey, PointRuleMap, PointsRewardsConfig } from "@/types/points-rewards";

export { LevelValidationError, levelForConfig, validateRules, validateLevels };
export type { LeaderboardWindow };

/**
 * Agency Community Points & Leaderboard — the agency-scope sibling of
 * community-points-service.ts / community-leaderboard-service.ts.
 *
 * Community Shared Architecture Phase 2 (2026-09-19): every function below
 * is now a thin delegation to the shared `*ByScope` cores in
 * community-points-service.ts / community-leaderboard-service.ts instead
 * of a second implementation — the scoring engine, config validation, and
 * ranking logic are byte-identical to tenant's, parameterized by
 * `agencyScope(agencyId)`. Exported names/signatures are UNCHANGED from
 * before this pass, so every existing Agency Community API handler and
 * the `/my/community/[groupId]/leaderboard` page need no changes.
 *
 * The one real per-scope difference — `points`/`level` live directly on
 * the roster doc (`agencies/{agencyId}/communityGroups/{groupId}/
 * members/{membershipId}`) rather than a separate `.../memberships/{id}`
 * doc — lives entirely inside the shared core's `membershipDocByScope`;
 * nothing here needs to know about it.
 *
 * The one disclosed, PRESERVED (not unified) behavior difference:
 * `awardAgencyPoints` passes `pointsEnabledDefault: "disabledByDefault"` —
 * an Agency Community's points/leaderboard stay off until the owner
 * explicitly opts in (Settings' "Points & Leaderboard" checkbox defaults
 * unchecked), unlike tenant's opt-out default. See
 * community-points-service.ts's own module comment for the full
 * reasoning — this was already the pre-Phase-2 behavior, not something
 * this pass introduced.
 */

export async function getAgencyPointsConfig(agencyId: string, groupId: string): Promise<PointsRewardsConfig> {
  return getPointsConfigByScope(agencyScope(agencyId), groupId);
}

/** Owner-only (enforced by the API route). Full replace of `rules`. */
export async function updateAgencyPointRulesServerSide(opts: {
  agencyId: string;
  groupId: string;
  rules: PointRuleMap;
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  return updatePointRulesByScope({ scope: agencyScope(opts.agencyId), groupId: opts.groupId, rules: opts.rules, updatedBy: opts.updatedBy });
}

/** Owner-only. Full replace of `levels`, validated first, including the
 *  post-save level recompute. */
export async function updateAgencyLevelsServerSide(opts: {
  agencyId: string;
  groupId: string;
  levels: CommunityLevel[];
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  return updateLevelsByScope({ scope: agencyScope(opts.agencyId), groupId: opts.groupId, levels: opts.levels, updatedBy: opts.updatedBy });
}

/**
 * `recipientMembershipId` is the roster doc's OWN id (from
 * `resolveAgencyCommunityCaller`'s `membership.id`, or looked up via
 * `getAgencyMembershipForPerson` for a recipient other than the actor) —
 * never a raw personId, since that's what the points/level fields live on.
 */
export async function awardAgencyPoints(opts: {
  agencyId: string;
  groupId: string;
  recipientMembershipId: string;
  actorId: string;
  action: PointActionKey;
  sourceEntityId: string;
}): Promise<AwardPointsResult> {
  return awardPointsByScope({
    scope: agencyScope(opts.agencyId),
    groupId: opts.groupId,
    memberId: opts.recipientMembershipId,
    actorMemberId: opts.actorId,
    action: opts.action,
    sourceEntityId: opts.sourceEntityId,
    pointsEnabledDefault: "disabledByDefault",
  });
}

/** Mirrors tenant `revokePoints` exactly. */
export async function revokeAgencyPoints(opts: {
  agencyId: string;
  groupId: string;
  recipientMembershipId: string;
  actorId: string;
  action: PointActionKey;
  sourceEntityId: string;
}): Promise<{ revoked: boolean }> {
  return revokePointsByScope({
    scope: agencyScope(opts.agencyId),
    groupId: opts.groupId,
    memberId: opts.recipientMembershipId,
    actorMemberId: opts.actorId,
    action: opts.action,
    sourceEntityId: opts.sourceEntityId,
  });
}

/** Field-compatible with the tenant `MemberPointStats`
 *  (community-points-service.ts) — `membersInvited` naturally stays 0
 *  (Agency Community membership is owner-invite-only, no member-to-member
 *  invite flow to award for). */
export type AgencyMemberPointStats = MemberPointStats;

export async function getAgencyMemberPointStats(
  agencyId: string,
  groupId: string,
  membershipId: string,
): Promise<AgencyMemberPointStats> {
  return getMemberPointStatsByScope(agencyScope(agencyId), groupId, membershipId);
}

/** Field-compatible with the tenant `LeaderboardRow` so it can feed
 *  directly into the SAME `LeaderboardView` component unchanged —
 *  `memberId` here holds the roster doc's own id, and `avatarUrl` is
 *  always null (no avatar mechanism for agency members yet). */
export type AgencyLeaderboardRow = LeaderboardRow;

export async function getAgencyLeaderboard(opts: {
  agencyId: string;
  groupId: string;
  window: LeaderboardWindow;
  limit?: number;
}): Promise<AgencyLeaderboardRow[]> {
  return getLeaderboardByScope({ ...opts, scope: agencyScope(opts.agencyId) });
}

export type AgencyPointsOverview = PointsOverview;

/** Community Settings → Points & Rewards → Overview's 5 numbers — mirrors
 *  tenant `getPointsOverview` exactly (`activeMemberCount`/
 *  `activeRewardsCount` passed in by the caller, same convention). */
export async function getAgencyPointsOverview(opts: {
  agencyId: string;
  groupId: string;
  activeMemberCount: number;
  activeRewardsCount: number;
}): Promise<AgencyPointsOverview> {
  return getPointsOverviewByScope({ ...opts, scope: agencyScope(opts.agencyId) });
}
