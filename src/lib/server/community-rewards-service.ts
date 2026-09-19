import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getLeaderboardByScope } from "@/lib/server/community-leaderboard-service";
import { listActiveParticipantsByScope } from "@/lib/server/community-participants-service";
import { communityGroupsRoot, scopeIdentityFields, tenantScope, type CommunityOwnerScope } from "@/lib/server/community-scope";
import type {
  CommunityReward,
  CommunityRewardWinner,
  RewardCriterion,
  RewardStatus,
  WinnerFulfillmentStatus,
} from "@/types/points-rewards";

/**
 * Points & Rewards — Rewards + Winners. Rewards live at
 * `.../communityGroups/{groupId}/rewards/{id}`; Winners (a persistent
 * historical record, never deleted when a reward is archived) at
 * `.../rewardWinners/{id}`. See `types/points-rewards.ts` for the full
 * shape and why fulfillment is a discriminated union scoped inside each
 * reward rather than a global settings card.
 *
 * Community Shared Architecture Phase 2 (2026-09-19): every function below
 * is now a scope-aware `*ByScope` core (`CommunityOwnerScope`), with the
 * tenant-facing exports at the bottom kept at their EXACT pre-existing
 * signatures — no tenant call site changes. `agency-community-rewards-
 * service.ts` is the Agency-scope sibling; its exports are now thin
 * delegations to the SAME cores here. `effectiveRewardStatus`/
 * `validateRewardInput`/`parseRewardInputBody`/`MAX_ACTIVE_REWARDS`/
 * `MaxActiveRewardsError` were ALREADY scope-agnostic before this phase
 * (no subAccountId/agencyId parameter at all) and are unchanged.
 */

function rewardsColByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().collection(`${communityGroupsRoot(scope)}/${groupId}/rewards`);
}

function winnersColByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().collection(`${communityGroupsRoot(scope)}/${groupId}/rewardWinners`);
}

/** Handles a real Firestore `Timestamp` (read path) AND a plain JS `Date`
 *  (write path — see `RewardInput`'s doc comment for why writes use `Date`
 *  instead of `Timestamp`), so `effectiveRewardStatus` works identically
 *  whether it's called on a freshly-read reward or an in-flight draft. */
function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const m = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

/**
 * The LIVE status shown anywhere in the UI — always computed fresh from
 * the moderator's stored `status` plus `startAt`/`endAt`, never a stored,
 * cron-updated field. `draft`/`completed`/`archived` are moderator-
 * controlled terminal/pre-live states and pass through unchanged — dates
 * never override them. `scheduled`/`active` are the two "live cycle"
 * states: with no dates, `active` simply stays active until the moderator
 * manually ends it; with dates, the effective status walks scheduled ->
 * active -> expired purely from the clock, with no write required at each
 * transition. Already scope-agnostic — unchanged by this phase.
 *
 * Known, disclosed limitation (unchanged): the max-3-active cap below is
 * enforced only against THIS moment's other rewards at save time, so two
 * rewards independently scheduled for overlapping future windows can both
 * be saved even if, once their start dates arrive, more than 3 would be
 * effectively active at once.
 */
export function effectiveRewardStatus(
  reward: { status: RewardStatus; startAt: unknown; endAt: unknown },
  nowMs: number = Date.now(),
): RewardStatus {
  if (reward.status === "draft" || reward.status === "completed" || reward.status === "archived") {
    return reward.status;
  }
  const endMs = toMillis(reward.endAt);
  if (endMs !== null && nowMs > endMs) return "expired";
  const startMs = toMillis(reward.startAt);
  if (startMs !== null && nowMs < startMs) return "scheduled";
  return "active";
}

export const MAX_ACTIVE_REWARDS = 3;

export class MaxActiveRewardsError extends Error {
  constructor() {
    super(
      "You can have up to 3 active rewards at a time. End or archive an active reward before activating another.",
    );
    this.name = "MaxActiveRewardsError";
  }
}

export interface RewardWithEffectiveStatus extends CommunityReward {
  effectiveStatus: RewardStatus;
}

export async function listRewardsByScope(
  scope: CommunityOwnerScope,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  const snap = await rewardsColByScope(scope, groupId).orderBy("createdAt", "desc").get();
  const now = Date.now();
  return snap.docs.map((d) => {
    const reward = { id: d.id, ...(d.data() as Omit<CommunityReward, "id">) };
    return { ...reward, effectiveStatus: effectiveRewardStatus(reward, now) };
  });
}

/** Just the rewards a member should see right now — Overview's "Active
 *  Rewards" panel and the member-facing Leaderboard both want exactly
 *  this: up to 3, effectively active THIS moment, newest first. */
export async function listActiveRewardsByScope(
  scope: CommunityOwnerScope,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  const all = await listRewardsByScope(scope, groupId);
  return all.filter((r) => r.effectiveStatus === "active").slice(0, MAX_ACTIVE_REWARDS);
}

/**
 * The create/update payload. `startAt`/`endAt` are plain JS `Date | null`
 * here — NOT `Timestamp` like the persisted `CommunityReward` — because
 * this is what a JSON request body round-trips as and what the Admin SDK
 * writes natively. Already scope-agnostic — unchanged by this phase.
 */
export type RewardInput = Pick<CommunityReward, "title" | "description" | "status" | "criterion" | "fulfillment"> & {
  startAt: Date | null;
  endAt: Date | null;
};

/** Parses a raw JSON request body into a `RewardInput`. Used by both
 *  scopes' create/update API routes so neither has to duplicate this.
 *  Already scope-agnostic — unchanged by this phase. */
export function parseRewardInputBody(body: {
  title?: string;
  description?: string;
  status?: RewardStatus;
  startAt?: string | null;
  endAt?: string | null;
  criterion?: RewardCriterion;
  fulfillment?: { type: "manual"; instructions?: string; url?: string | null };
}): RewardInput {
  return {
    title: body.title ?? "",
    description: body.description ?? "",
    status: body.status ?? "draft",
    startAt: body.startAt ? new Date(body.startAt) : null,
    endAt: body.endAt ? new Date(body.endAt) : null,
    criterion: body.criterion ?? { type: "manual" },
    fulfillment: {
      type: "manual",
      instructions: body.fulfillment?.instructions ?? "",
      url: body.fulfillment?.url ?? null,
    },
  };
}

/** Already scope-agnostic — unchanged by this phase. */
export function validateRewardInput(input: RewardInput): void {
  if (!input.title || !input.title.trim()) {
    throw new Error("Reward title is required.");
  }
  if (input.title.trim().length > 120) {
    throw new Error("Reward title is too long (max 120 characters).");
  }
  if (input.description && input.description.length > 2000) {
    throw new Error("Reward description is too long (max 2000 characters).");
  }
  if (input.fulfillment.type === "manual" && !input.fulfillment.instructions?.trim()) {
    throw new Error("Fulfillment instructions are required.");
  }
}

/** Moderator/owner-only. Enforces the max-3-active cap INSIDE a
 *  transaction — same race-safe pattern as Featured Posts' own cap check
 *  (read the current count fresh inside `runTransaction`, reject before
 *  writing) — so two near-simultaneous "activate" requests can never both
 *  pass the check. */
export async function createRewardByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  createdBy: string;
  input: RewardInput;
}): Promise<CommunityReward> {
  validateRewardInput(opts.input);
  const db = getAdminDb();
  const ref = rewardsColByScope(opts.scope, opts.groupId).doc();

  const willBeActive = effectiveRewardStatus(opts.input) === "active";
  if (willBeActive) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(rewardsColByScope(opts.scope, opts.groupId));
      const now = Date.now();
      const activeCount = snap.docs.filter(
        (d) => effectiveRewardStatus(d.data() as Omit<CommunityReward, "id">, now) === "active",
      ).length;
      if (activeCount >= MAX_ACTIVE_REWARDS) throw new MaxActiveRewardsError();
      const doc = {
        ...scopeIdentityFields(opts.scope),
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
    ...scopeIdentityFields(opts.scope),
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

/** Moderator/owner-only. Same transactional cap-check as create, but only
 *  when this update would newly RESULT in an effectively-active reward. */
export async function updateRewardByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  rewardId: string;
  input: RewardInput;
}): Promise<CommunityReward | null> {
  validateRewardInput(opts.input);
  const db = getAdminDb();
  const ref = rewardsColByScope(opts.scope, opts.groupId).doc(opts.rewardId);

  const willBeActive = effectiveRewardStatus(opts.input) === "active";
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return null;
    const wasActive =
      effectiveRewardStatus(current.data() as Omit<CommunityReward, "id">) === "active";
    if (willBeActive && !wasActive) {
      const snap = await tx.get(rewardsColByScope(opts.scope, opts.groupId));
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

/** Moderator/owner-only. Archiving never needs the active-cap check.
 *  Archived rewards are never deleted. */
export async function archiveRewardByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  rewardId: string;
}): Promise<void> {
  await rewardsColByScope(opts.scope, opts.groupId).doc(opts.rewardId).update({
    status: "archived",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export interface EligibleWinner {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  level: number;
}

/**
 * For a calculable criterion (everything but "manual"), the members who
 * currently qualify — surfaced to the moderator/owner for CONFIRMATION,
 * never auto-granted. "manual" always returns [] — the caller picks from
 * the member directory directly in that case. Uses the SAME shared
 * `listActiveParticipantsByScope` (community-participants-service.ts) for
 * `point_threshold`/`reach_level`, and the SAME shared
 * `getLeaderboardByScope` for `top_points_period`, for both scopes — the
 * only thing that ever differed between tenant/Agency here was WHICH
 * directory read backed the calculable criteria, not the eligibility
 * rules themselves.
 */
export async function evaluateEligibleWinnersByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  criterion: RewardCriterion,
): Promise<EligibleWinner[]> {
  if (criterion.type === "manual") return [];

  if (criterion.type === "top_points_period") {
    const rows = await getLeaderboardByScope({
      scope,
      groupId,
      window: criterion.window,
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

  const participants = await listActiveParticipantsByScope(scope, groupId);
  if (criterion.type === "point_threshold") {
    return participants
      .filter((p) => p.points >= criterion.threshold)
      .map((p) => ({ memberId: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl, points: p.points, level: p.level }));
  }
  // reach_level
  return participants
    .filter((p) => p.level >= criterion.level)
    .map((p) => ({ memberId: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl, points: p.points, level: p.level }));
}

export async function listWinnersByScope(
  scope: CommunityOwnerScope,
  groupId: string,
): Promise<CommunityRewardWinner[]> {
  const snap = await winnersColByScope(scope, groupId).orderBy("awardedAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityRewardWinner, "id">) }));
}

/** Moderator/owner-only — records a win, always `pending` fulfillment
 *  until explicitly marked fulfilled. Used both for a manual-criterion
 *  pick and for confirming one of `evaluateEligibleWinnersByScope`'s
 *  calculable candidates — either way an explicit action triggers this
 *  call, so "system" auto-grants never happen. */
export async function createWinnerByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  rewardId: string;
  memberId: string;
  awardedBy: string;
  notes?: string;
}): Promise<CommunityRewardWinner> {
  const ref = winnersColByScope(opts.scope, opts.groupId).doc();
  const doc = {
    ...scopeIdentityFields(opts.scope),
    groupId: opts.groupId,
    rewardId: opts.rewardId,
    memberId: opts.memberId,
    awardedAt: FieldValue.serverTimestamp(),
    awardedBy: opts.awardedBy,
    fulfillmentStatus: "pending" as WinnerFulfillmentStatus,
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
  await ref.set(doc);
  return { id: ref.id, ...doc } as CommunityRewardWinner;
}

export async function updateWinnerFulfillmentByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  winnerId: string;
  fulfillmentStatus: WinnerFulfillmentStatus;
  notes?: string;
}): Promise<void> {
  await winnersColByScope(opts.scope, opts.groupId)
    .doc(opts.winnerId)
    .update({
      fulfillmentStatus: opts.fulfillmentStatus,
      ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
    });
}

// -------------------------------------------------------------------------
// Tenant-facing exports — EXACT pre-existing signatures, every tenant call
// site is unchanged. Each is now a thin wrapper around the shared
// `*ByScope` core above, which itself still writes the same
// `{subAccountId, groupId, ...}` (tenant) / `{agencyId, groupId, ...}`
// (Agency) identity fields onto new reward/winner docs each scope always
// wrote (via `scopeIdentityFields`) — preserved even though nothing reads
// them back today, rather than silently dropped as an "unused field
// cleanup" side effect of this consolidation.
// -------------------------------------------------------------------------

export async function listRewardsServerSide(
  subAccountId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  return listRewardsByScope(tenantScope(subAccountId), groupId);
}

export async function listActiveRewardsServerSide(
  subAccountId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  return listActiveRewardsByScope(tenantScope(subAccountId), groupId);
}

export async function createRewardServerSide(opts: {
  subAccountId: string;
  groupId: string;
  createdBy: string;
  input: RewardInput;
}): Promise<CommunityReward> {
  return createRewardByScope({ scope: tenantScope(opts.subAccountId), groupId: opts.groupId, createdBy: opts.createdBy, input: opts.input });
}

export async function updateRewardServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rewardId: string;
  input: RewardInput;
}): Promise<CommunityReward | null> {
  return updateRewardByScope({ scope: tenantScope(opts.subAccountId), groupId: opts.groupId, rewardId: opts.rewardId, input: opts.input });
}

export async function archiveRewardServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rewardId: string;
}): Promise<void> {
  return archiveRewardByScope({ scope: tenantScope(opts.subAccountId), groupId: opts.groupId, rewardId: opts.rewardId });
}

export async function evaluateEligibleWinners(
  subAccountId: string,
  groupId: string,
  criterion: RewardCriterion,
): Promise<EligibleWinner[]> {
  return evaluateEligibleWinnersByScope(tenantScope(subAccountId), groupId, criterion);
}

export async function listWinnersServerSide(
  subAccountId: string,
  groupId: string,
): Promise<CommunityRewardWinner[]> {
  return listWinnersByScope(tenantScope(subAccountId), groupId);
}

export async function createWinnerServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rewardId: string;
  memberId: string;
  awardedBy: string;
  notes?: string;
}): Promise<CommunityRewardWinner> {
  return createWinnerByScope({ scope: tenantScope(opts.subAccountId), groupId: opts.groupId, rewardId: opts.rewardId, memberId: opts.memberId, awardedBy: opts.awardedBy, notes: opts.notes });
}

export async function updateWinnerFulfillmentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  winnerId: string;
  fulfillmentStatus: WinnerFulfillmentStatus;
  notes?: string;
}): Promise<void> {
  return updateWinnerFulfillmentByScope({ scope: tenantScope(opts.subAccountId), groupId: opts.groupId, winnerId: opts.winnerId, fulfillmentStatus: opts.fulfillmentStatus, notes: opts.notes });
}
