import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_LEVELS, DEFAULT_POINT_RULES } from "@/lib/server/community-points-defaults";
import { getAgencyGroupById, type AgencyGroupMemberRoster } from "@/lib/server/community-agency-service";
import type { PointActionKey, PointEvent, PointsRewardsConfig } from "@/types/points-rewards";

/**
 * Agency Community Points & Leaderboard — the agency-scope sibling of
 * community-points-service.ts / community-leaderboard-service.ts. The
 * scoring ENGINE is already scope-agnostic upstream (memberId is an
 * opaque string, per that file's own module comment) — the one real
 * adaptation is WHERE points/level live: the tenant engine writes onto a
 * separate `.../memberships/{memberId}` doc, but an agency membership has
 * no such second doc — `points`/`level` are added directly onto the
 * EXISTING roster doc at `agencies/{agencyId}/communityGroups/{groupId}/
 * members/{membershipDocId}` instead (see AgencyGroupMemberRoster).
 *
 * Custom point-value/level-threshold editing (the tenant Points & Rewards
 * Settings workspace) is NOT ported this pass — the shipped DEFAULT rules
 * and levels are used as-is (`DEFAULT_POINT_RULES`/`DEFAULT_LEVELS`),
 * which is "the same point-awarding behavior tenant Community currently
 * uses" for every group that hasn't customized those either. Rewards
 * (prize redemption) also isn't ported — Leaderboard's `activeRewards`
 * renders empty for agency groups, a real but narrow gap.
 */

function pointEventsCol(agencyId: string, groupId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups/${groupId}/pointEvents`);
}

function membersCol(agencyId: string, groupId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups/${groupId}/members`);
}

function defaultConfig(): PointsRewardsConfig {
  return { rules: DEFAULT_POINT_RULES, levels: [...DEFAULT_LEVELS], configVersion: 0, updatedAt: null, updatedBy: null };
}

export function levelForConfig(config: PointsRewardsConfig, points: number): number {
  let level = 1;
  for (const l of config.levels) {
    if (points >= l.threshold) level = l.level;
  }
  return level;
}

function deterministicEventId(action: PointActionKey, sourceEntityId: string, actorId: string): string {
  return `${action}::${sourceEntityId}::${actorId}`;
}

function startOfTodayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export type AwardAgencyPointsResult =
  | { awarded: true; delta: number }
  | { awarded: false; delta: 0; reason: "points_disabled" | "rule_disabled" | "daily_limit_reached" | "duplicate" | "member_not_found" };

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
}): Promise<AwardAgencyPointsResult> {
  const db = getAdminDb();
  const group = await getAgencyGroupById(opts.agencyId, opts.groupId);
  if (group?.pointsEnabled === false || group?.pointsEnabled === undefined) {
    return { awarded: false, delta: 0, reason: "points_disabled" };
  }

  const config = defaultConfig();
  const rule = config.rules[opts.action];
  if (!rule || !rule.enabled || rule.points <= 0) {
    return { awarded: false, delta: 0, reason: "rule_disabled" };
  }

  const eventRef = pointEventsCol(opts.agencyId, opts.groupId).doc(
    deterministicEventId(opts.action, opts.sourceEntityId, opts.actorId),
  );
  const membershipRef = membersCol(opts.agencyId, opts.groupId).doc(opts.recipientMembershipId);

  return db.runTransaction(async (tx): Promise<AwardAgencyPointsResult> => {
    const [eventSnap, membershipSnap] = await Promise.all([tx.get(eventRef), tx.get(membershipRef)]);
    if (eventSnap.exists) return { awarded: false, delta: 0, reason: "duplicate" };
    if (!membershipSnap.exists) return { awarded: false, delta: 0, reason: "member_not_found" };

    if (rule.limit.type === "per_day" && rule.limit.maxPerDay) {
      const todaySnap = await tx.get(
        pointEventsCol(opts.agencyId, opts.groupId)
          .where("memberId", "==", opts.recipientMembershipId)
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
      memberId: opts.recipientMembershipId,
      actorMemberId: opts.actorId,
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

/** Field-compatible with the tenant `MemberPointStats`
 *  (community-points-service.ts) — `membersInvited` is always 0 (Agency
 *  Community membership is owner-invite-only, no member-to-member invite
 *  flow to award for). */
export interface AgencyMemberPointStats {
  totalPoints: number;
  posts: number;
  comments: number;
  likesGiven: number;
  membersInvited: number;
}

export async function getAgencyMemberPointStats(
  agencyId: string,
  groupId: string,
  membershipId: string,
): Promise<AgencyMemberPointStats> {
  const [asRecipientSnap, asActorSnap] = await Promise.all([
    pointEventsCol(agencyId, groupId).where("memberId", "==", membershipId).get(),
    pointEventsCol(agencyId, groupId).where("actorMemberId", "==", membershipId).get(),
  ]);
  const stats: AgencyMemberPointStats = { totalPoints: 0, posts: 0, comments: 0, likesGiven: 0, membersInvited: 0 };
  asRecipientSnap.docs.forEach((d) => {
    const { action, delta } = d.data() as { action?: PointActionKey; delta: number };
    stats.totalPoints += delta;
    if (action === "create_post" || action === "share_video") stats.posts++;
    if (action === "comment_post" || action === "reply_comment") stats.comments++;
  });
  asActorSnap.docs.forEach((d) => {
    const { action, memberId: recipientId } = d.data() as { action?: PointActionKey; memberId: string };
    if (action === "receive_like" && recipientId !== membershipId) stats.likesGiven++;
  });
  return stats;
}

export type LeaderboardWindow = "7d" | "30d" | "all";

/** Field-compatible with the tenant `LeaderboardRow`
 *  (community-leaderboard-service.ts) so it can feed directly into the
 *  SAME `LeaderboardView` component unchanged — `memberId` here holds the
 *  roster doc's own id (see this file's module comment), and `avatarUrl`
 *  is always null (no avatar mechanism for agency members yet). */
export interface AgencyLeaderboardRow {
  rank: number;
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  points: number;
}

export async function getAgencyLeaderboard(opts: {
  agencyId: string;
  groupId: string;
  window: LeaderboardWindow;
  limit?: number;
}): Promise<AgencyLeaderboardRow[]> {
  const limit = opts.limit ?? 50;
  const snap = await membersCol(opts.agencyId, opts.groupId).where("status", "==", "active").get();
  const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AgencyGroupMemberRoster);
  const levelById = new Map(members.map((m) => [m.id, (m as { level?: number }).level ?? 1]));
  const nameById = new Map(
    members.map((m) => [m.id, m.displayName?.trim() || m.email.split("@")[0] || "Member"]),
  );

  let scored: { memberId: string; points: number }[];
  if (opts.window === "all") {
    scored = members
      .map((m) => ({ memberId: m.id, points: (m as { points?: number }).points ?? 0 }))
      .filter((s) => s.points > 0);
  } else {
    const days = opts.window === "7d" ? 7 : 30;
    const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    const eventsSnap = await pointEventsCol(opts.agencyId, opts.groupId).where("createdAt", ">=", cutoff).get();
    const tally = new Map<string, number>();
    eventsSnap.docs.forEach((d) => {
      const { memberId, delta } = d.data() as { memberId: string; delta: number };
      tally.set(memberId, (tally.get(memberId) ?? 0) + (delta ?? 0));
    });
    scored = Array.from(tally.entries())
      .map(([memberId, points]) => ({ memberId, points }))
      .filter((s) => s.points > 0);
  }

  scored.sort((a, b) => b.points - a.points);
  return scored.slice(0, limit).map((s, i) => ({
    rank: i + 1,
    memberId: s.memberId,
    displayName: nameById.get(s.memberId) ?? "Member",
    avatarUrl: null,
    level: levelById.get(s.memberId) ?? 1,
    points: s.points,
  }));
}
