import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getLeaderboard } from "@/lib/server/community-leaderboard-service";
import { listMemberDirectory } from "@/lib/server/community-leaderboard-service";
import type {
  CommunityReward,
  CommunityRewardWinner,
  RewardCriterion,
  RewardStatus,
  WinnerFulfillmentStatus,
} from "@/types/points-rewards";

/**
 * Points & Rewards — Rewards + Winners. Rewards live at
 * `subAccounts/{saId}/communityGroups/{groupId}/rewards/{id}`; Winners
 * (a persistent historical record, never deleted when a reward is
 * archived) at `.../rewardWinners/{id}`. See `types/points-rewards.ts` for
 * the full shape and why fulfillment is a discriminated union scoped
 * inside each reward rather than a global settings card.
 */

function rewardsCol(subAccountId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${subAccountId}/communityGroups/${groupId}/rewards`,
  );
}

function winnersCol(subAccountId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${subAccountId}/communityGroups/${groupId}/rewardWinners`,
  );
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
 * cron-updated field (no background-job infrastructure exists in this
 * codebase to keep such a field current). `draft`/`completed`/`archived`
 * are moderator-controlled terminal/pre-live states and pass through
 * unchanged — dates never override them. `scheduled`/`active` are the two
 * "live cycle" states: with no dates, `active` simply stays active until
 * the moderator manually ends it (the "always-active" reward shape); with
 * dates, the effective status walks scheduled -> active -> expired purely
 * from the clock, with no write required at each transition.
 *
 * Known, disclosed limitation (Points & Rewards Implementation Report):
 * the max-3-active cap below is enforced only against THIS moment's other
 * rewards at save time, so two rewards independently scheduled for
 * overlapping future windows can both be saved even if, once their start
 * dates arrive, more than 3 would be effectively active at once. Catching
 * that would need a scheduled job re-checking the whole set on a timer —
 * real, deliberately out-of-scope follow-up work per the "don't build an
 * overcomplicated rules engine yet" instruction.
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

export async function listRewardsServerSide(
  subAccountId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  const snap = await rewardsCol(subAccountId, groupId).orderBy("createdAt", "desc").get();
  const now = Date.now();
  return snap.docs.map((d) => {
    const reward = { id: d.id, ...(d.data() as Omit<CommunityReward, "id">) };
    return { ...reward, effectiveStatus: effectiveRewardStatus(reward, now) };
  });
}

/** Just the rewards a member should see right now — Overview's "Active
 *  Rewards" panel and the member-facing Leaderboard both want exactly
 *  this: up to 3, effectively active THIS moment, newest first. */
export async function listActiveRewardsServerSide(
  subAccountId: string,
  groupId: string,
): Promise<RewardWithEffectiveStatus[]> {
  const all = await listRewardsServerSide(subAccountId, groupId);
  return all.filter((r) => r.effectiveStatus === "active").slice(0, MAX_ACTIVE_REWARDS);
}

/**
 * The create/update payload. `startAt`/`endAt` are plain JS `Date | null`
 * here — NOT `Timestamp` like the persisted `CommunityReward` — because
 * this is what a JSON request body round-trips as (the modal sends a
 * `Date`, `JSON.stringify` serializes it to an ISO string, and the API
 * route parses that string back into a `Date` before calling this) and
 * what the Admin SDK writes natively (a `Date` value is auto-converted to
 * a `Timestamp` on write, same as any other Admin SDK write in this
 * codebase).
 */
export type RewardInput = Pick<CommunityReward, "title" | "description" | "status" | "criterion" | "fulfillment"> & {
  startAt: Date | null;
  endAt: Date | null;
};

/** Parses a raw JSON request body into a `RewardInput` — specifically,
 *  turns `startAt`/`endAt`'s ISO-string-or-null wire shape into real
 *  `Date | null` values. Used by both the create and update API routes so
 *  neither has to duplicate this. */
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

function validateRewardInput(input: RewardInput): void {
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

/** Moderator-only. Enforces the max-3-active cap INSIDE a transaction —
 *  same race-safe pattern as Featured Posts' `MAX_FEATURED_POSTS` (read
 *  the current count fresh inside `runTransaction`, reject before
 *  writing) — so two near-simultaneous "activate" requests can never both
 *  pass the check. */
export async function createRewardServerSide(opts: {
  subAccountId: string;
  groupId: string;
  createdBy: string;
  input: RewardInput;
}): Promise<CommunityReward> {
  validateRewardInput(opts.input);
  const db = getAdminDb();
  const ref = rewardsCol(opts.subAccountId, opts.groupId).doc();

  const willBeActive = effectiveRewardStatus(opts.input) === "active";
  if (willBeActive) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(rewardsCol(opts.subAccountId, opts.groupId));
      const now = Date.now();
      const activeCount = snap.docs.filter(
        (d) => effectiveRewardStatus(d.data() as Omit<CommunityReward, "id">, now) === "active",
      ).length;
      if (activeCount >= MAX_ACTIVE_REWARDS) throw new MaxActiveRewardsError();
      const doc = {
        subAccountId: opts.subAccountId,
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
    subAccountId: opts.subAccountId,
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

/** Moderator-only. Same transactional cap-check as create, but only when
 *  this update would newly RESULT in an effectively-active reward (an
 *  edit that keeps a reward inactive, or that ends an already-active one,
 *  never needs the check). */
export async function updateRewardServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rewardId: string;
  input: RewardInput;
}): Promise<CommunityReward | null> {
  validateRewardInput(opts.input);
  const db = getAdminDb();
  const ref = rewardsCol(opts.subAccountId, opts.groupId).doc(opts.rewardId);

  const willBeActive = effectiveRewardStatus(opts.input) === "active";
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return null;
    const wasActive =
      effectiveRewardStatus(current.data() as Omit<CommunityReward, "id">) === "active";
    if (willBeActive && !wasActive) {
      const snap = await tx.get(rewardsCol(opts.subAccountId, opts.groupId));
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

/** Moderator-only. Archiving never needs the active-cap check (it only
 *  ever REMOVES a reward from the active count). Archived rewards are
 *  never deleted — they remain visible in the Rewards tab's past/
 *  completed view and any Winners history referencing them stays intact. */
export async function archiveRewardServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rewardId: string;
}): Promise<void> {
  await rewardsCol(opts.subAccountId, opts.groupId).doc(opts.rewardId).update({
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
 * currently qualify — surfaced to the moderator for CONFIRMATION, never
 * auto-granted (Part 17's explicit "do not silently grant real-world
 * prizes without owner awareness"). "manual" always returns [] — the
 * moderator picks from the member directory directly in that case.
 */
export async function evaluateEligibleWinners(
  subAccountId: string,
  groupId: string,
  criterion: RewardCriterion,
): Promise<EligibleWinner[]> {
  if (criterion.type === "manual") return [];

  if (criterion.type === "top_points_period") {
    const rows = await getLeaderboard({
      subAccountId,
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

  const directory = await listMemberDirectory({ subAccountId, groupId });
  if (criterion.type === "point_threshold") {
    return directory
      .filter((m) => m.status === "active" && m.points >= criterion.threshold)
      .map((m) => ({ memberId: m.memberId, displayName: m.displayName, avatarUrl: m.avatarUrl, points: m.points, level: m.level }));
  }
  // reach_level
  return directory
    .filter((m) => m.status === "active" && m.level >= criterion.level)
    .map((m) => ({ memberId: m.memberId, displayName: m.displayName, avatarUrl: m.avatarUrl, points: m.points, level: m.level }));
}

export async function listWinnersServerSide(
  subAccountId: string,
  groupId: string,
): Promise<CommunityRewardWinner[]> {
  const snap = await winnersCol(subAccountId, groupId).orderBy("awardedAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityRewardWinner, "id">) }));
}

/** Moderator-only — records a win, always `pending` fulfillment until the
 *  moderator marks it fulfilled. Used both for a manual-criterion pick and
 *  for confirming one of `evaluateEligibleWinners`'s calculable
 *  candidates — either way a moderator explicitly triggers this call, so
 *  "system" auto-grants never happen in V1. */
export async function createWinnerServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rewardId: string;
  memberId: string;
  awardedBy: string;
  notes?: string;
}): Promise<CommunityRewardWinner> {
  const ref = winnersCol(opts.subAccountId, opts.groupId).doc();
  const doc = {
    subAccountId: opts.subAccountId,
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

export async function updateWinnerFulfillmentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  winnerId: string;
  fulfillmentStatus: WinnerFulfillmentStatus;
  notes?: string;
}): Promise<void> {
  await winnersCol(opts.subAccountId, opts.groupId)
    .doc(opts.winnerId)
    .update({
      fulfillmentStatus: opts.fulfillmentStatus,
      ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
    });
}
