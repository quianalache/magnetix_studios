import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_LEVELS, DEFAULT_POINT_RULES } from "@/lib/server/community-points-defaults";
import type {
  CommunityLevel,
  PointActionKey,
  PointEvent,
  PointRuleMap,
  PointsRewardsConfig,
} from "@/types/points-rewards";

/**
 * Points & Rewards — the point-event ledger + rules/levels config. This is
 * the ONE place every point-earning trigger (post/comment/reply/like/
 * video-post/invite-join) goes through — see `awardPoints`'s doc comment
 * for the idempotency + limit-enforcement strategy, and the Points &
 * Rewards Implementation Report for what this replaces
 * (`toggleLikeServerSide`'s old hardcoded receiver-earns like-point logic,
 * `config/community.ts`'s global, non-per-Community `LEVEL_THRESHOLDS`).
 *
 * The `pointEvents` subcollection this reads/writes is the SAME one
 * `community-leaderboard-service.ts` already read before this feature
 * existed (`{memberId, delta, createdAt}`) — extended here with `action`/
 * `sourceEntityId`/`configVersion`, additively; every pre-existing event
 * written by the old like logic still reads back fine (those extra fields
 * are simply absent on old rows).
 */

function configRef(subAccountId: string, groupId: string) {
  return getAdminDb().doc(
    `subAccounts/${subAccountId}/communityGroups/${groupId}/config/pointsRewards`,
  );
}

function pointEventsCol(subAccountId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${subAccountId}/communityGroups/${groupId}/pointEvents`,
  );
}

/**
 * Read the group's Points & Rewards config, defaults merged in. Absent doc
 * = never configured -> the full shipped default (see
 * `community-points-defaults.ts`), same "absent means use the default"
 * convention as `CommunityGroup.theme`. A stored config missing a rule key
 * (e.g. a NEW action shipped after this Community last saved) has that
 * key's shipped default merged in too, so a product update never leaves an
 * action silently unconfigured.
 */
export async function getPointsConfig(
  subAccountId: string,
  groupId: string,
): Promise<PointsRewardsConfig> {
  const snap = await configRef(subAccountId, groupId).get();
  if (!snap.exists) {
    return {
      rules: DEFAULT_POINT_RULES,
      levels: [...DEFAULT_LEVELS],
      configVersion: 0,
      updatedAt: null,
      updatedBy: null,
    };
  }
  const data = snap.data() as Partial<PointsRewardsConfig>;
  const rules: PointRuleMap = {
    ...DEFAULT_POINT_RULES,
    ...(data.rules ?? {}),
  } as PointRuleMap;
  const levels =
    data.levels && data.levels.length === 9 ? data.levels : [...DEFAULT_LEVELS];
  return {
    rules,
    levels,
    configVersion: data.configVersion ?? 0,
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

/** Resolve a points total to a level using THIS group's configured levels
 *  (replaces the global `levelForPoints` from `config/community.ts` for
 *  every new award — that function stays in place only as the default
 *  seed's threshold source, per `community-points-defaults.ts`). */
export function levelForConfig(config: PointsRewardsConfig, points: number): number {
  let level = 1;
  for (const l of config.levels) {
    if (points >= l.threshold) level = l.level;
  }
  return level;
}

export class LevelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LevelValidationError";
  }
}

/**
 * Validate a full 9-level set before it's ever persisted: exactly 9
 * entries, numbered 1–9 in order, level 1 fixed at threshold 0, every
 * subsequent threshold strictly greater than the previous (no overlap, no
 * reversal), every name a non-empty trimmed string. Throws
 * `LevelValidationError` with a specific, user-facing message on the first
 * problem found — never silently clamps or reorders.
 */
export function validateLevels(levels: CommunityLevel[]): void {
  if (levels.length !== 9) {
    throw new LevelValidationError("There must be exactly 9 levels.");
  }
  for (let i = 0; i < 9; i++) {
    const l = levels[i];
    if (l.level !== i + 1) {
      throw new LevelValidationError(
        `Levels must be numbered 1–9 in order (found level ${l.level} at position ${i + 1}).`,
      );
    }
    if (!l.name || !l.name.trim()) {
      throw new LevelValidationError(`Level ${l.level} needs a name.`);
    }
    if (l.name.trim().length > 30) {
      throw new LevelValidationError(`Level ${l.level}'s name is too long (max 30 characters).`);
    }
    if (!Number.isFinite(l.threshold) || l.threshold < 0) {
      throw new LevelValidationError(`Level ${l.level}'s threshold must be a number 0 or greater.`);
    }
  }
  if (levels[0].threshold !== 0) {
    throw new LevelValidationError("Level 1 must start at 0 points.");
  }
  for (let i = 1; i < 9; i++) {
    if (levels[i].threshold <= levels[i - 1].threshold) {
      throw new LevelValidationError(
        `Level ${levels[i].level}'s threshold must be greater than Level ${levels[i - 1].level}'s (no overlapping or reversed thresholds).`,
      );
    }
  }
}

function validateRules(rules: PointRuleMap): void {
  for (const action of Object.keys(DEFAULT_POINT_RULES) as PointActionKey[]) {
    const rule = rules[action];
    if (!rule) throw new Error(`Missing rule for "${action}".`);
    if (!Number.isFinite(rule.points) || rule.points < 0 || rule.points > 1000) {
      throw new Error(`"${rule.label || action}"'s point value must be between 0 and 1000.`);
    }
    if (rule.limit.type === "per_day") {
      if (!Number.isFinite(rule.limit.maxPerDay) || (rule.limit.maxPerDay ?? 0) < 1) {
        throw new Error(`"${rule.label || action}"'s daily limit must be 1 or greater.`);
      }
    }
  }
}

/** Moderator-only (enforced by the API route, same convention as every
 *  other `*ServerSide` write in this codebase). Full replace of `rules` —
 *  the caller always sends the complete map (the Settings UI always holds
 *  a complete draft), so there's no partial-merge ambiguity to get wrong. */
export async function updatePointRulesServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rules: PointRuleMap;
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  validateRules(opts.rules);
  const current = await getPointsConfig(opts.subAccountId, opts.groupId);
  await configRef(opts.subAccountId, opts.groupId).set(
    {
      rules: opts.rules,
      levels: current.levels,
      configVersion: current.configVersion + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: opts.updatedBy,
    },
    { merge: false },
  );
  return getPointsConfig(opts.subAccountId, opts.groupId);
}

/** Moderator-only. Full replace of `levels`, validated first (throws
 *  `LevelValidationError` — the API route surfaces `.message` directly, a
 *  clear 400, never a generic 500). */
export async function updateLevelsServerSide(opts: {
  subAccountId: string;
  groupId: string;
  levels: CommunityLevel[];
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  validateLevels(opts.levels);
  const current = await getPointsConfig(opts.subAccountId, opts.groupId);
  await configRef(opts.subAccountId, opts.groupId).set(
    {
      rules: current.rules,
      levels: opts.levels,
      configVersion: current.configVersion + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: opts.updatedBy,
    },
    { merge: false },
  );
  return getPointsConfig(opts.subAccountId, opts.groupId);
}

/** Deterministic `pointEvents` doc id: the entire idempotency + "once per
 *  related entity" mechanism (Part 3 / Part 12's explicit requirements)
 *  falls out of this single choice — a retried request, or a second
 *  attempt to award the same action for the same entity+member, always
 *  targets the SAME doc, so `tx.get(eventRef).exists` alone tells
 *  `awardPoints` whether this exact award already happened. Doesn't
 *  collide with Firestore's reserved `__...__` doc-id pattern (neither
 *  prefixed nor suffixed with a double underscore). */
function deterministicEventId(action: PointActionKey, sourceEntityId: string, memberId: string): string {
  return `${action}::${sourceEntityId}::${memberId}`;
}

function startOfTodayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export type AwardPointsResult =
  | { awarded: true; delta: number }
  | {
      awarded: false;
      delta: 0;
      reason: "points_disabled" | "rule_disabled" | "daily_limit_reached" | "duplicate" | "member_not_found";
    };

/**
 * The single, central, idempotent point-award function — every trigger
 * site (post/comment/reply/video-post/like/invite-join) calls this instead
 * of writing to `pointEvents`/`membership.points` directly. Self-
 * transacting (runs its own `runTransaction`) rather than accepting a
 * caller's in-flight transaction — deliberately, so every call site gets
 * the exact same all-reads-before-writes-safe shape without having to
 * reason about interleaving with its own unrelated reads/writes. A rare
 * award-transaction failure after the primary content write already
 * succeeded never blocks or rolls back that content (a post/comment/like
 * always succeeds even if, hypothetically, its point award doesn't) —
 * idempotency means a safe, correct retry is always possible later if this
 * ever needs one.
 *
 * Enforces, in order: the group's `pointsEnabled` master switch, the
 * rule's own enabled flag, the rule's `per_day` cap (counted from REAL
 * `pointEvents` rows created today for this member+action — not a
 * separate mutable counter, so it can't drift and self-corrects if an
 * event is later revoked), then the entity-scoped idempotency check.
 */
export async function awardPoints(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  action: PointActionKey;
  /** The post/comment/new-member id this award is about. */
  sourceEntityId: string;
}): Promise<AwardPointsResult> {
  const db = getAdminDb();
  const base = `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`;

  const groupSnap = await db.doc(base).get();
  if (groupSnap.data()?.pointsEnabled === false) {
    return { awarded: false, delta: 0, reason: "points_disabled" };
  }

  const config = await getPointsConfig(opts.subAccountId, opts.groupId);
  const rule = config.rules[opts.action];
  if (!rule || !rule.enabled || rule.points <= 0) {
    return { awarded: false, delta: 0, reason: "rule_disabled" };
  }

  const eventRef = db.doc(
    `${base}/pointEvents/${deterministicEventId(opts.action, opts.sourceEntityId, opts.memberId)}`,
  );
  const membershipRef = db.doc(`${base}/memberships/${opts.memberId}`);

  return db.runTransaction(async (tx): Promise<AwardPointsResult> => {
    const [eventSnap, membershipSnap] = await Promise.all([
      tx.get(eventRef),
      tx.get(membershipRef),
    ]);
    if (eventSnap.exists) {
      return { awarded: false, delta: 0, reason: "duplicate" };
    }
    if (!membershipSnap.exists) {
      return { awarded: false, delta: 0, reason: "member_not_found" };
    }

    if (rule.limit.type === "per_day" && rule.limit.maxPerDay) {
      const todaySnap = await tx.get(
        pointEventsCol(opts.subAccountId, opts.groupId)
          .where("memberId", "==", opts.memberId)
          .where("action", "==", opts.action)
          .where("createdAt", ">=", Timestamp.fromMillis(startOfTodayUtcMs())),
      );
      if (todaySnap.size >= rule.limit.maxPerDay) {
        return { awarded: false, delta: 0, reason: "daily_limit_reached" };
      }
    }

    const currentPoints = (membershipSnap.data()!.points as number) ?? 0;
    const nextPoints = currentPoints + rule.points;
    const event: Omit<PointEvent, "id"> = {
      memberId: opts.memberId,
      action: opts.action,
      sourceEntityId: opts.sourceEntityId,
      delta: rule.points,
      configVersion: config.configVersion,
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(eventRef, event);
    tx.update(membershipRef, { points: nextPoints, level: levelForConfig(config, nextPoints) });
    return { awarded: true, delta: rule.points };
  });
}

export interface MemberPointStats {
  totalPoints: number;
  posts: number;
  comments: number;
  likesGiven: number;
  membersInvited: number;
}

/**
 * The Leaderboard page's "Your Stats (All Time)" panel — a per-action
 * breakdown for ONE member, tallied from their own real `pointEvents`
 * rows (a single `memberId ==` equality query, no composite index needed;
 * grouped by `action` in memory rather than one query per action). Counts
 * EVENTS, not raw actions — an action whose rule was disabled, over a
 * daily cap, or a duplicate never created an event, so this only ever
 * reflects what actually earned points, consistent with "points start
 * accumulating from live use forward" (imported Skool history has no
 * pointEvents at all, so it contributes nothing here either).
 */
export async function getMemberPointStats(
  subAccountId: string,
  groupId: string,
  memberId: string,
): Promise<MemberPointStats> {
  const snap = await pointEventsCol(subAccountId, groupId).where("memberId", "==", memberId).get();
  const stats: MemberPointStats = { totalPoints: 0, posts: 0, comments: 0, likesGiven: 0, membersInvited: 0 };
  snap.docs.forEach((d) => {
    const { action, delta } = d.data() as { action?: PointActionKey; delta: number };
    stats.totalPoints += delta;
    switch (action) {
      case "create_post":
      case "share_video":
        stats.posts++;
        break;
      case "comment_post":
      case "reply_comment":
        stats.comments++;
        break;
      case "like_post":
        stats.likesGiven++;
        break;
      case "invite_member":
        stats.membersInvited++;
        break;
      default:
        break;
    }
  });
  return stats;
}

export interface PointsOverview {
  /** Sum of positive point deltas awarded in the last 30 days — "given",
   *  not net (a revoke's negative delta doesn't reduce this; it's a
   *  historical record of what was actually awarded, not a running
   *  balance). */
  totalPointsGiven30d: number;
  /** Unique members who earned at least one point in the last 30 days. */
  membersEarningPoints30d: number;
  /** Rewards whose EFFECTIVE status is "active" right now. */
  activeRewardsCount: number;
  /** Winners recorded in the last 30 days. */
  recentWinners30d: number;
  /** membersEarningPoints30d as a % of active members — 0 when there are
   *  no active members, never NaN/Infinity. */
  participationRatePct: number;
}

/**
 * Community Settings → Points & Rewards → Overview's 5 numbers, and only
 * those 5 — deliberately NOT a broader analytics surface (Part 2's
 * explicit "do not turn this into the broader Community Analytics
 * system"). `activeMemberCount` is passed in (the caller already has it
 * via `listMemberDirectory` for other reasons) rather than this function
 * re-querying memberships itself.
 */
export async function getPointsOverview(opts: {
  subAccountId: string;
  groupId: string;
  activeMemberCount: number;
  activeRewardsCount: number;
}): Promise<PointsOverview> {
  const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [eventsSnap, winnersSnap] = await Promise.all([
    pointEventsCol(opts.subAccountId, opts.groupId).where("createdAt", ">=", cutoff).get(),
    getAdminDb()
      .collection(`subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/rewardWinners`)
      .where("awardedAt", ">=", cutoff)
      .get(),
  ]);

  let totalPointsGiven30d = 0;
  const earners = new Set<string>();
  eventsSnap.docs.forEach((d) => {
    const { memberId, delta } = d.data() as { memberId: string; delta: number };
    if (delta > 0) {
      totalPointsGiven30d += delta;
      earners.add(memberId);
    }
  });

  return {
    totalPointsGiven30d,
    membersEarningPoints30d: earners.size,
    activeRewardsCount: opts.activeRewardsCount,
    recentWinners30d: winnersSnap.size,
    participationRatePct:
      opts.activeMemberCount > 0
        ? Math.round((earners.size / opts.activeMemberCount) * 1000) / 10
        : 0,
  };
}

/**
 * Reverse a previously-awarded event (unlike -> reverse the like_post
 * award). Looks up the SAME deterministic doc id `awardPoints` would have
 * used, so it only ever reverses a real, existing award — a member who
 * never actually earned the point (rule was disabled at the time, daily
 * cap was hit, etc.) has nothing to revoke, safely a no-op.
 */
export async function revokePoints(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  action: PointActionKey;
  sourceEntityId: string;
}): Promise<{ revoked: boolean }> {
  const db = getAdminDb();
  const base = `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`;
  const config = await getPointsConfig(opts.subAccountId, opts.groupId);
  const eventRef = db.doc(
    `${base}/pointEvents/${deterministicEventId(opts.action, opts.sourceEntityId, opts.memberId)}`,
  );
  const membershipRef = db.doc(`${base}/memberships/${opts.memberId}`);

  return db.runTransaction(async (tx) => {
    const [eventSnap, membershipSnap] = await Promise.all([
      tx.get(eventRef),
      tx.get(membershipRef),
    ]);
    if (!eventSnap.exists || !membershipSnap.exists) return { revoked: false };
    const delta = (eventSnap.data()!.delta as number) ?? 0;
    const currentPoints = (membershipSnap.data()!.points as number) ?? 0;
    const nextPoints = Math.max(0, currentPoints - delta);
    tx.delete(eventRef);
    tx.update(membershipRef, { points: nextPoints, level: levelForConfig(config, nextPoints) });
    return { revoked: true };
  });
}
