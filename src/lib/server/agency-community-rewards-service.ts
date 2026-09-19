import "server-only";

import {
  effectiveRewardStatus,
  validateRewardInput,
  MAX_ACTIVE_REWARDS,
  MaxActiveRewardsError,
  listRewardsByScope,
  listActiveRewardsByScope,
  createRewardByScope,
  updateRewardByScope,
  archiveRewardByScope,
  evaluateEligibleWinnersByScope,
  listWinnersByScope,
  createWinnerByScope,
  updateWinnerFulfillmentByScope,
  type RewardWithEffectiveStatus,
  type RewardInput,
  type EligibleWinner,
} from "@/lib/server/community-rewards-service";
import { agencyScope } from "@/lib/server/community-scope";
import type { CommunityReward, CommunityRewardWinner, RewardCriterion, WinnerFulfillmentStatus } from "@/types/points-rewards";

export type { RewardWithEffectiveStatus, RewardInput, EligibleWinner };
export { MaxActiveRewardsError, MAX_ACTIVE_REWARDS, effectiveRewardStatus, validateRewardInput };
export { parseRewardInputBody } from "@/lib/server/community-rewards-service";

/**
 * Agency Community — Rewards + Winners, the agency-scope sibling of
 * community-rewards-service.ts. Rewards live at
 * `agencies/{agencyId}/communityGroups/{groupId}/rewards/{id}`; Winners at
 * `.../rewardWinners/{id}` — same relative shape as tenant, one level up.
 *
 * Community Shared Architecture Phase 2 (2026-09-19): every function below
 * is now a thin delegation to the shared `*ByScope` cores in
 * community-rewards-service.ts instead of a second implementation —
 * `effectiveRewardStatus`/`validateRewardInput`/`parseRewardInputBody`/
 * `MAX_ACTIVE_REWARDS`/`MaxActiveRewardsError` were already scope-agnostic
 * and re-exported directly (unchanged from before this pass). Exported
 * names/signatures are UNCHANGED, so every existing Agency Community API
 * handler needs no changes.
 */

export async function listAgencyRewardsServerSide(
  agencyId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  return listRewardsByScope(agencyScope(agencyId), groupId);
}

export async function listActiveAgencyRewardsServerSide(
  agencyId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  return listActiveRewardsByScope(agencyScope(agencyId), groupId);
}

/** Owner-only. Enforces the max-3-active cap inside a transaction —
 *  mirrors tenant `createRewardServerSide` exactly. */
export async function createAgencyRewardServerSide(opts: {
  agencyId: string;
  groupId: string;
  createdBy: string;
  input: RewardInput;
}): Promise<CommunityReward> {
  return createRewardByScope({ scope: agencyScope(opts.agencyId), groupId: opts.groupId, createdBy: opts.createdBy, input: opts.input });
}

/** Owner-only. Mirrors tenant `updateRewardServerSide` exactly. */
export async function updateAgencyRewardServerSide(opts: {
  agencyId: string;
  groupId: string;
  rewardId: string;
  input: RewardInput;
}): Promise<CommunityReward | null> {
  return updateRewardByScope({ scope: agencyScope(opts.agencyId), groupId: opts.groupId, rewardId: opts.rewardId, input: opts.input });
}

/** Owner-only. Never deletes — mirrors tenant `archiveRewardServerSide`. */
export async function archiveAgencyRewardServerSide(opts: {
  agencyId: string;
  groupId: string;
  rewardId: string;
}): Promise<void> {
  return archiveRewardByScope({ scope: agencyScope(opts.agencyId), groupId: opts.groupId, rewardId: opts.rewardId });
}

/**
 * For a calculable criterion, the members who currently qualify — surfaced
 * for owner CONFIRMATION, never auto-granted. Delegates to the shared
 * `evaluateEligibleWinnersByScope`, which itself uses the agency roster
 * (`listActiveParticipantsByScope`) and `getAgencyLeaderboard`'s shared
 * core in place of tenant's members+memberships join — same eligibility
 * rules, different directory source, exactly as before this phase.
 */
export async function evaluateEligibleAgencyWinners(
  agencyId: string,
  groupId: string,
  criterion: RewardCriterion,
): Promise<EligibleWinner[]> {
  return evaluateEligibleWinnersByScope(agencyScope(agencyId), groupId, criterion);
}

export async function listAgencyWinnersServerSide(
  agencyId: string,
  groupId: string,
): Promise<CommunityRewardWinner[]> {
  return listWinnersByScope(agencyScope(agencyId), groupId);
}

/** Owner-only — records a win, always `pending` fulfillment. Mirrors
 *  tenant `createWinnerServerSide` exactly. */
export async function createAgencyWinnerServerSide(opts: {
  agencyId: string;
  groupId: string;
  rewardId: string;
  memberId: string;
  awardedBy: string;
  notes?: string;
}): Promise<CommunityRewardWinner> {
  return createWinnerByScope({ scope: agencyScope(opts.agencyId), groupId: opts.groupId, rewardId: opts.rewardId, memberId: opts.memberId, awardedBy: opts.awardedBy, notes: opts.notes });
}

export async function updateAgencyWinnerFulfillmentServerSide(opts: {
  agencyId: string;
  groupId: string;
  winnerId: string;
  fulfillmentStatus: WinnerFulfillmentStatus;
  notes?: string;
}): Promise<void> {
  return updateWinnerFulfillmentByScope({ scope: agencyScope(opts.agencyId), groupId: opts.groupId, winnerId: opts.winnerId, fulfillmentStatus: opts.fulfillmentStatus, notes: opts.notes });
}
