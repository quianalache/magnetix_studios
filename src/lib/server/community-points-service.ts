import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_LEVELS, DEFAULT_POINT_RULES } from "@/lib/server/community-points-defaults";
import { communityGroupsRoot, tenantScope, type CommunityOwnerScope } from "@/lib/server/community-scope";
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
 *
 * Community Shared Architecture Phase 2 (2026-09-19): every function below
 * is now a scope-aware `*ByScope` core (`CommunityOwnerScope`, see
 * community-scope.ts), with the tenant-facing exports at the bottom kept
 * at their EXACT pre-existing signatures (thin wrappers) — no tenant call
 * site changes. `agency-community-points-service.ts` is the Agency-scope
 * sibling; its exported functions are now thin delegations to the SAME
 * cores here instead of a second implementation. The one real per-scope
 * difference is WHERE points/level live: tenant writes onto a separate
 * `.../memberships/{memberId}` doc; Agency has no such second doc —
 * `points`/`level` live directly on the roster doc at
 * `agencies/{agencyId}/communityGroups/{groupId}/members/{membershipId}`
 * (see `AgencyGroupMemberRoster`'s own doc comment) — `membershipDocByScope`
 * below is the one path branch that difference requires.
 *
 * Disclosed, PRESERVED (not unified) behavior difference: tenant's
 * `pointsEnabled` master switch defaults to ENABLED when never configured
 * (only an explicit `=== false` blocks an award); Agency's defaults to
 * DISABLED until the owner explicitly opts in (`=== false` OR `undefined`
 * blocks) — this was already a deliberate, pre-existing product decision
 * (Agency Community Settings' "Points & Leaderboard" checkbox defaults
 * unchecked), not a bug, so `awardPointsByScope` takes an explicit
 * `pointsEnabledDefault` parameter rather than silently picking one
 * behavior for both scopes.
 */

function groupDocPathByScope(scope: CommunityOwnerScope, groupId: string): string {
  return `${communityGroupsRoot(scope)}/${groupId}`;
}

function configRefByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().doc(`${groupDocPathByScope(scope, groupId)}/config/pointsRewards`);
}

function pointEventsColByScope(scope: CommunityOwnerScope, groupId: string) {
  return getAdminDb().collection(`${groupDocPathByScope(scope, groupId)}/pointEvents`);
}

/** The ONE path branch the tenant/Agency points-storage difference
 *  requires — see the module comment above. `membershipId` is the tenant
 *  memberId (== the membership doc's own id) or the Agency roster doc id. */
function membershipDocByScope(scope: CommunityOwnerScope, groupId: string, membershipId: string) {
  const base = groupDocPathByScope(scope, groupId);
  const subcollection = scope.kind === "agency" ? "members" : "memberships";
  return getAdminDb().doc(`${base}/${subcollection}/${membershipId}`);
}

function membershipsColByScope(scope: CommunityOwnerScope, groupId: string) {
  const base = groupDocPathByScope(scope, groupId);
  const subcollection = scope.kind === "agency" ? "members" : "memberships";
  return getAdminDb().collection(`${base}/${subcollection}`);
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
export async function getPointsConfigByScope(
  scope: CommunityOwnerScope,
  groupId: string,
): Promise<PointsRewardsConfig> {
  const snap = await configRefByScope(scope, groupId).get();
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
 *  seed's threshold source, per `community-points-defaults.ts`). Already
 *  scope-agnostic (`points` is just a number) — unchanged by this phase. */
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
 * problem found — never silently clamps or reorders. Already
 * scope-agnostic — unchanged by this phase.
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

/** Already scope-agnostic — unchanged by this phase. */
export function validateRules(rules: PointRuleMap): void {
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

/** Moderator/owner-only (enforced by each scope's own API route). Full
 *  replace of `rules` — the caller always sends the complete map. */
export async function updatePointRulesByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  rules: PointRuleMap;
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  validateRules(opts.rules);
  const current = await getPointsConfigByScope(opts.scope, opts.groupId);
  await configRefByScope(opts.scope, opts.groupId).set(
    {
      rules: opts.rules,
      levels: current.levels,
      configVersion: current.configVersion + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: opts.updatedBy,
    },
    { merge: false },
  );
  return getPointsConfigByScope(opts.scope, opts.groupId);
}

/** Moderator/owner-only. Full replace of `levels`, validated first, then
 *  recomputes every participant's stored `level` against the new
 *  thresholds — see `recomputeMembershipLevelsByScope`'s own doc comment
 *  for exactly what that does and doesn't touch. */
export async function updateLevelsByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  levels: CommunityLevel[];
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  validateLevels(opts.levels);
  const current = await getPointsConfigByScope(opts.scope, opts.groupId);
  await configRefByScope(opts.scope, opts.groupId).set(
    {
      rules: current.rules,
      levels: opts.levels,
      configVersion: current.configVersion + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: opts.updatedBy,
    },
    { merge: false },
  );
  const next = await getPointsConfigByScope(opts.scope, opts.groupId);
  await recomputeMembershipLevelsByScope(opts.scope, opts.groupId, next);
  return next;
}

/**
 * Recompute and persist `level` for every participant doc in this group
 * against a (just-saved) levels config — called only from
 * `updateLevelsByScope`, right after a threshold change. Reads each
 * participant's EXISTING `points` (never modified here) and writes only
 * `level` when it actually differs — a no-op write is skipped entirely.
 * Deliberately unconditional over EVERY doc in the collection (not
 * filtered to `status === "active"`, unlike `listActiveParticipantsByScope`)
 * — a banned/pending member's stored level must stay correct too, matching
 * both scopes' pre-Phase-2 behavior exactly (neither tenant's
 * `recomputeMembershipLevels` nor Agency's `recomputeAgencyMembershipLevels`
 * filtered by status either).
 *
 * Explicitly does NOT: read or write `points`, touch `pointEvents`,
 * create/update a `CommunityRewardWinner`, or emit any webhook/email/
 * notification.
 */
export async function recomputeMembershipLevelsByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  config: PointsRewardsConfig,
): Promise<{ updated: number }> {
  const db = getAdminDb();
  const snap = await membershipsColByScope(scope, groupId).get();

  let updated = 0;
  let batch = db.batch();
  let opsInBatch = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { points?: number; level?: number };
    const correctLevel = levelForConfig(config, data.points ?? 0);
    if (data.level !== correctLevel) {
      batch.update(doc.ref, { level: correctLevel });
      updated++;
      opsInBatch++;
      // Firestore batches cap at 500 writes — chunk defensively so this
      // never breaks on a very large Community.
      if (opsInBatch >= 450) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
  }
  if (opsInBatch > 0) await batch.commit();
  return { updated };
}

/**
 * Deterministic `pointEvents` doc id: the entire idempotency + "once per
 * related entity" mechanism falls out of this single choice — a retried
 * request, or a second attempt to award the same action for the same
 * entity+actor, always targets the SAME doc. Keyed on the ACTOR, not the
 * recipient — see `receive_like`'s own reasoning in `awardPointsByScope`'s
 * doc comment. Already scope-agnostic (ids are opaque strings) — unchanged.
 */
function deterministicEventId(action: PointActionKey, sourceEntityId: string, actorMemberId: string): string {
  return `${action}::${sourceEntityId}::${actorMemberId}`;
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
 * site (post/comment/reply/video-post/receive-like/invite-join) calls this
 * instead of writing to `pointEvents`/participant `points` directly.
 * Self-transacting (runs its own `runTransaction`) rather than accepting a
 * caller's in-flight transaction, so every call site gets the exact same
 * all-reads-before-writes-safe shape. A rare award-transaction failure
 * after the primary content write already succeeded never blocks or rolls
 * back that content — idempotency means a safe, correct retry is always
 * possible later.
 *
 * `memberId` is who the points go to (the recipient, and the tenant
 * memberId / Agency roster-doc id the participant doc lives at);
 * `actorMemberId` (defaults to `memberId`) is who performed the action.
 * They differ only for `receive_like`, where the LIKER is the actor and
 * the content's creator is the recipient.
 *
 * `pointsEnabledDefault` is the ONE disclosed, preserved tenant/Agency
 * behavior difference (see this file's module comment): tenant passes
 * `"enabledByDefault"` (blocks only on an explicit `pointsEnabled ===
 * false`); Agency passes `"disabledByDefault"` (blocks on `=== false` OR
 * `undefined` — the owner must explicitly opt in).
 *
 * Enforces, in order: the group's `pointsEnabled` master switch, the
 * rule's own enabled flag, the rule's `per_day` cap (counted from REAL
 * `pointEvents` rows created today for this RECIPIENT+action), then the
 * entity-scoped idempotency check.
 */
export async function awardPointsByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  memberId: string;
  actorMemberId?: string;
  action: PointActionKey;
  /** The post/comment/new-member id this award is about. */
  sourceEntityId: string;
  pointsEnabledDefault: "enabledByDefault" | "disabledByDefault";
}): Promise<AwardPointsResult> {
  const db = getAdminDb();
  const actorMemberId = opts.actorMemberId ?? opts.memberId;

  const groupSnap = await db.doc(groupDocPathByScope(opts.scope, opts.groupId)).get();
  const pointsEnabled = groupSnap.data()?.pointsEnabled as boolean | undefined;
  const blocked =
    opts.pointsEnabledDefault === "enabledByDefault"
      ? pointsEnabled === false
      : pointsEnabled !== true;
  if (blocked) {
    return { awarded: false, delta: 0, reason: "points_disabled" };
  }

  const config = await getPointsConfigByScope(opts.scope, opts.groupId);
  const rule = config.rules[opts.action];
  if (!rule || !rule.enabled || rule.points <= 0) {
    return { awarded: false, delta: 0, reason: "rule_disabled" };
  }

  const eventRef = pointEventsColByScope(opts.scope, opts.groupId).doc(
    deterministicEventId(opts.action, opts.sourceEntityId, actorMemberId),
  );
  const membershipRef = membershipDocByScope(opts.scope, opts.groupId, opts.memberId);

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
        pointEventsColByScope(opts.scope, opts.groupId)
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
      actorMemberId,
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
 * breakdown for ONE participant. Two separate real `pointEvents` queries
 * (`memberId ==` and `actorMemberId ==`), because since the `receive_like`
 * product correction those are no longer the same thing for this
 * participant — see the tenant-era doc comment preserved here:
 *  - `memberId == this participant` = events THEY were the RECIPIENT of.
 *  - `actorMemberId == this participant` = events THEY performed as the
 *    ACTOR — for `receive_like` specifically, "how many times did I like
 *    someone else's content" (Likes Given), earning the liker nothing but
 *    still a genuine engagement stat. Every other action's actor row was
 *    already counted in the first query, so it's skipped here to avoid
 *    double-counting.
 * `membersInvited` naturally stays 0 at Agency scope (no `invite_member`
 * action can ever fire there — owner-invite-only membership, no
 * member-to-member invite flow) without any special-casing here.
 */
export async function getMemberPointStatsByScope(
  scope: CommunityOwnerScope,
  groupId: string,
  memberId: string,
): Promise<MemberPointStats> {
  const [asRecipientSnap, asActorSnap] = await Promise.all([
    pointEventsColByScope(scope, groupId).where("memberId", "==", memberId).get(),
    pointEventsColByScope(scope, groupId).where("actorMemberId", "==", memberId).get(),
  ]);
  const stats: MemberPointStats = { totalPoints: 0, posts: 0, comments: 0, likesGiven: 0, membersInvited: 0 };
  asRecipientSnap.docs.forEach((d) => {
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
      case "invite_member":
        stats.membersInvited++;
        break;
      default:
        break;
    }
  });
  asActorSnap.docs.forEach((d) => {
    const { action, memberId: recipientId } = d.data() as { action?: PointActionKey; memberId: string };
    if (action === "receive_like" && recipientId !== memberId) {
      stats.likesGiven++;
    }
  });
  return stats;
}

export interface PointsOverview {
  /** Sum of positive point deltas awarded in the last 30 days — "given",
   *  not net. */
  totalPointsGiven30d: number;
  /** Unique participants who earned at least one point in the last 30 days. */
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
 * those 5. `activeMemberCount`/`activeRewardsCount` are passed in by the
 * caller (already has them for other reasons) rather than re-queried here.
 */
export async function getPointsOverviewByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  activeMemberCount: number;
  activeRewardsCount: number;
}): Promise<PointsOverview> {
  const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [eventsSnap, winnersSnap] = await Promise.all([
    pointEventsColByScope(opts.scope, opts.groupId).where("createdAt", ">=", cutoff).get(),
    getAdminDb()
      .collection(`${groupDocPathByScope(opts.scope, opts.groupId)}/rewardWinners`)
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
 * Reverse a previously-awarded event (unlike -> reverse the receive_like
 * award). Looks up the SAME deterministic doc id `awardPointsByScope` would
 * have used, so it only ever reverses a real, existing award.
 */
export async function revokePointsByScope(opts: {
  scope: CommunityOwnerScope;
  groupId: string;
  memberId: string;
  actorMemberId?: string;
  action: PointActionKey;
  sourceEntityId: string;
}): Promise<{ revoked: boolean }> {
  const db = getAdminDb();
  const config = await getPointsConfigByScope(opts.scope, opts.groupId);
  const actorMemberId = opts.actorMemberId ?? opts.memberId;
  const eventRef = pointEventsColByScope(opts.scope, opts.groupId).doc(
    deterministicEventId(opts.action, opts.sourceEntityId, actorMemberId),
  );
  const membershipRef = membershipDocByScope(opts.scope, opts.groupId, opts.memberId);

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

// -------------------------------------------------------------------------
// Tenant-facing exports — EXACT pre-existing signatures, every tenant call
// site is unchanged. Each is now a thin wrapper around the shared
// `*ByScope` core above, passing `pointsEnabledDefault: "enabledByDefault"`
// (tenant's pre-existing default — see the module comment).
// -------------------------------------------------------------------------

export async function getPointsConfig(subAccountId: string, groupId: string): Promise<PointsRewardsConfig> {
  return getPointsConfigByScope(tenantScope(subAccountId), groupId);
}

export async function updatePointRulesServerSide(opts: {
  subAccountId: string;
  groupId: string;
  rules: PointRuleMap;
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  return updatePointRulesByScope({ scope: tenantScope(opts.subAccountId), groupId: opts.groupId, rules: opts.rules, updatedBy: opts.updatedBy });
}

export async function updateLevelsServerSide(opts: {
  subAccountId: string;
  groupId: string;
  levels: CommunityLevel[];
  updatedBy: string;
}): Promise<PointsRewardsConfig> {
  return updateLevelsByScope({ scope: tenantScope(opts.subAccountId), groupId: opts.groupId, levels: opts.levels, updatedBy: opts.updatedBy });
}

export async function recomputeMembershipLevels(
  subAccountId: string,
  groupId: string,
  config: PointsRewardsConfig,
): Promise<{ updated: number }> {
  return recomputeMembershipLevelsByScope(tenantScope(subAccountId), groupId, config);
}

export async function awardPoints(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  actorMemberId?: string;
  action: PointActionKey;
  sourceEntityId: string;
}): Promise<AwardPointsResult> {
  return awardPointsByScope({ ...opts, scope: tenantScope(opts.subAccountId), pointsEnabledDefault: "enabledByDefault" });
}

export async function getMemberPointStats(
  subAccountId: string,
  groupId: string,
  memberId: string,
): Promise<MemberPointStats> {
  return getMemberPointStatsByScope(tenantScope(subAccountId), groupId, memberId);
}

export async function getPointsOverview(opts: {
  subAccountId: string;
  groupId: string;
  activeMemberCount: number;
  activeRewardsCount: number;
}): Promise<PointsOverview> {
  return getPointsOverviewByScope({ ...opts, scope: tenantScope(opts.subAccountId) });
}

export async function revokePoints(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  actorMemberId?: string;
  action: PointActionKey;
  sourceEntityId: string;
}): Promise<{ revoked: boolean }> {
  return revokePointsByScope({ ...opts, scope: tenantScope(opts.subAccountId) });
}
