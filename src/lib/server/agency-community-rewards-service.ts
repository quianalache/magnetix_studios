import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  effectiveRewardStatus,
  validateRewardInput,
  MAX_ACTIVE_REWARDS,
  MaxActiveRewardsError,
  type RewardWithEffectiveStatus,
  type RewardInput,
  type EligibleWinner,
} from "@/lib/server/community-rewards-service";
import { getAgencyLeaderboard, type LeaderboardWindow } from "@/lib/server/agency-community-points-service";
import { listAgencyGroupMembers } from "@/lib/server/community-agency-service";
import type {
  CommunityReward,
  CommunityRewardWinner,
  RewardCriterion,
  WinnerFulfillmentStatus,
} from "@/types/points-rewards";

export type { RewardWithEffectiveStatus, RewardInput, EligibleWinner };
export { MaxActiveRewardsError, MAX_ACTIVE_REWARDS };
export { parseRewardInputBody } from "@/lib/server/community-rewards-service";

/**
 * Agency Community — Rewards + Winners, the agency-scope sibling of
 * community-rewards-service.ts. Rewards live at
 * `agencies/{agencyId}/communityGroups/{groupId}/rewards/{id}`; Winners at
 * `.../rewardWinners/{id}` — same relative shape as tenant, one level up.
 * `effectiveRewardStatus`/`validateRewardInput`/`parseRewardInputBody`/
 * `MAX_ACTIVE_REWARDS`/`MaxActiveRewardsError`/`EligibleWinner` are
 * scope-agnostic and imported directly from the tenant file rather than
 * duplicated — only the Firestore paths and the eligible-winners directory
 * lookup (agency roster, not tenant members+memberships) differ.
 */

function rewardsCol(agencyId: string, groupId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups/${groupId}/rewards`);
}

function winnersCol(agencyId: string, groupId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups/${groupId}/rewardWinners`);
}

export async function listAgencyRewardsServerSide(
  agencyId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  const snap = await rewardsCol(agencyId, groupId).orderBy("createdAt", "desc").get();
  const now = Date.now();
  return snap.docs.map((d) => {
    const reward = { id: d.id, ...(d.data() as Omit<CommunityReward, "id">) };
    return { ...reward, effectiveStatus: effectiveRewardStatus(reward, now) };
  });
}

export async function listActiveAgencyRewardsServerSide(
  agencyId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  const all = await listAgencyRewardsServerSide(agencyId, groupId);
  return all.filter((r) => r.effectiveStatus === "active").slice(0, MAX_ACTIVE_REWARDS);
}

/** Owner-only. Enforces the max-3-active cap inside a transaction — mirrors
 *  tenant `createRewardServerSide` exactly. */
export async function createAgencyRewardServerSide(opts: {
  agencyId: string;
  groupId: string;
  createdBy: string;
  input: RewardInput;
}): Promise<CommunityReward> {
  validateRewardInput(opts.input);
  const db = getAdminDb();
  const ref = rewardsCol(opts.agencyId, opts.groupId).doc();

  const willBeActive = effectiveRewardStatus(opts.input) === "active";
  if (willBeActive) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(rewardsCol(opts.agencyId, opts.groupId));
      const now = Date.now();
      const activeCount = snap.docs.filter(
        (d) => effectiveRewardStatus(d.data() as Omit<CommunityReward, "id">, now) === "active",
      ).length;
      if (activeCount >= MAX_ACTIVE_REWARDS) throw new MaxActiveRewardsError();
      const doc = {
        agencyId: opts.agencyId,
        groupId: opts.groupId,
        ...opts.input,
        title: opts.input.title.trim(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: opts.createdBy,
      };
      tx.set(ref, doc);
      return { id: ref.id, ...doc } as unknown as CommunityReward;
    });
  }

  const doc = {
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    ...opts.input,
    title: opts.input.title.trim(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: opts.createdBy,
  };
  await ref.set(doc);
  return { id: ref.id, ...doc } as unknown as CommunityReward;
}

/** Owner-only. Mirrors tenant `updateRewardServerSide` exactly. */
export async function updateAgencyRewardServerSide(opts: {
  agencyId: string;
  groupId: string;
  rewardId: string;
  input: RewardInput;
}): Promise<CommunityReward | null> {
  validateRewardInput(opts.input);
  const db = getAdminDb();
  const ref = rewardsCol(opts.agencyId, opts.groupId).doc(opts.rewardId);

  const willBeActive = effectiveRewardStatus(opts.input) === "active";
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return null;
    const wasActive = effectiveRewardStatus(current.data() as Omit<CommunityReward, "id">) === "active";
    if (willBeActive && !wasActive) {
      const snap = await tx.get(rewardsCol(opts.agencyId, opts.groupId));
      const now = Date.now();
      const activeCount = snap.docs.filter((d) => {
        if (d.id === opts.rewardId) return false;
        return effectiveRewardStatus(d.data() as Omit<CommunityReward, "id">, now) === "active";
      }).length;
      if (activeCount >= MAX_ACTIVE_REWARDS) throw new MaxActiveRewardsError();
    }
    const patch = { ...opts.input, title: opts.input.title.trim(), updatedAt: FieldValue.serverTimestamp() };
    tx.update(ref, patch);
    return { id: ref.id, ...(current.data() as Omit<CommunityReward, "id">), ...patch } as CommunityReward;
  });
}

/** Owner-only. Never deletes — mirrors tenant `archiveRewardServerSide`. */
export async function archiveAgencyRewardServerSide(opts: {
  agencyId: string;
  groupId: string;
  rewardId: string;
}): Promise<void> {
  await rewardsCol(opts.agencyId, opts.groupId).doc(opts.rewardId).update({
    status: "archived",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * For a calculable criterion, the members who currently qualify — surfaced
 * for owner CONFIRMATION, never auto-granted (same "manual" always returns
 * [] convention as tenant). Uses the agency roster
 * (`listAgencyGroupMembers`) as the directory in place of tenant's
 * members+memberships join, and `getAgencyLeaderboard` in place of
 * `getLeaderboard`.
 */
export async function evaluateEligibleAgencyWinners(
  agencyId: string,
  groupId: string,
  criterion: RewardCriterion,
): Promise<EligibleWinner[]> {
  if (criterion.type === "manual") return [];

  if (criterion.type === "top_points_period") {
    const rows = await getAgencyLeaderboard({
      agencyId,
      groupId,
      window: criterion.window as LeaderboardWindow,
      limit: criterion.winnerCount,
    });
    return rows.map((r) => ({
      memberId: r.memberId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      points: r.points,
      level: r.level,
    }));
  }

  const roster = await listAgencyGroupMembers(agencyId, groupId);
  const directory = roster
    .filter((m) => m.status === "active")
    .map((m) => ({
      memberId: m.id,
      displayName: m.displayName?.trim() || m.email.split("@")[0] || "Member",
      avatarUrl: null as string | null,
      points: (m as { points?: number }).points ?? 0,
      level: (m as { level?: number }).level ?? 1,
    }));

  if (criterion.type === "point_threshold") {
    return directory.filter((m) => m.points >= criterion.threshold);
  }
  // reach_level
  return directory.filter((m) => m.level >= criterion.level);
}

export async function listAgencyWinnersServerSide(
  agencyId: string,
  groupId: string,
): Promise<CommunityRewardWinner[]> {
  const snap = await winnersCol(agencyId, groupId).orderBy("awardedAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityRewardWinner, "id">) }));
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
  const ref = winnersCol(opts.agencyId, opts.groupId).doc();
  const doc = {
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    rewardId: opts.rewardId,
    memberId: opts.memberId,
    awardedAt: FieldValue.serverTimestamp(),
    awardedBy: opts.awardedBy,
    fulfillmentStatus: "pending" as WinnerFulfillmentStatus,
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
  await ref.set(doc);
  return { id: ref.id, ...doc } as unknown as CommunityRewardWinner;
}

export async function updateAgencyWinnerFulfillmentServerSide(opts: {
  agencyId: string;
  groupId: string;
  winnerId: string;
  fulfillmentStatus: WinnerFulfillmentStatus;
  notes?: string;
}): Promise<void> {
  await winnersCol(opts.agencyId, opts.groupId)
    .doc(opts.winnerId)
    .update({
      fulfillmentStatus: opts.fulfillmentStatus,
      ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
    });
}
