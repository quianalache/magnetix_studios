import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Points & Rewards (Community Settings) — types for the real, configurable
 * points/leaderboard/rewards system. Deliberately a SEPARATE file from
 * `community.ts` (which already carries `CommunityGroup.pointsEnabled` and
 * `GroupMembership.points`/`.level` — both REUSED here, not duplicated) so
 * this large, self-contained slice doesn't bloat the main community type
 * file. See the Points & Rewards Implementation Report for the full
 * architecture writeup, including what pre-existing gamification code this
 * replaces/extends (`config/community.ts`'s global `LEVEL_THRESHOLDS`, and
 * `toggleLikeServerSide`'s old hardcoded receiver-earns like-point logic).
 */

// ---------------------------------------------------------------------------
// Points System (V1 fixed set of 6 actions — see PointRuleMap doc comment)
// ---------------------------------------------------------------------------

export type PointActionKey =
  | "create_post"
  | "comment_post"
  | "reply_comment"
  | "share_video"
  | "like_post"
  | "invite_member";

export type PointLimitType = "none" | "per_day" | "per_entity";

/**
 * "none" = no cap. "per_day" = at most `maxPerDay` awards per member per
 * calendar day for this action (enforced by counting today's real
 * `pointEvents`, not a separate mutable counter — see
 * `community-points-service.ts`'s `awardPoints`). "per_entity" = at most one
 * award per member per related entity (invitee, in V1) — enforced for free
 * by the deterministic, entity-scoped `pointEvents` doc id, since the
 * trigger that would fire it (a member's FIRST successful join) only ever
 * fires once per entity by construction.
 */
export interface PointRuleLimit {
  type: PointLimitType;
  /** Required (and only meaningful) when `type === "per_day"`. */
  maxPerDay?: number;
}

export interface PointRule {
  action: PointActionKey;
  /** Member-facing label, shown in Settings and in "How do points work?". */
  label: string;
  description: string;
  enabled: boolean;
  /** Points awarded per qualifying occurrence. */
  points: number;
  limit: PointRuleLimit;
}

/**
 * The fixed V1 rule set, one entry per {@link PointActionKey}. Intentionally
 * a closed record, not an array a moderator can add/remove entries from —
 * per the explicit "do not build an overcomplicated arbitrary rules engine
 * yet" instruction, only enabled/points/limit are owner-configurable per
 * rule; the 6 actions themselves are fixed in V1.
 */
export type PointRuleMap = Record<PointActionKey, PointRule>;

// ---------------------------------------------------------------------------
// Levels (exactly 9, owner-customizable name + threshold)
// ---------------------------------------------------------------------------

export interface CommunityLevel {
  /** Fixed 1–9, never reordered or deleted in V1. */
  level: number;
  name: string;
  /** Minimum points to reach this level. Level 1 is always 0; each
   *  subsequent level's threshold must strictly exceed the previous one
   *  (validated by `updateLevels` before save — see that function's doc
   *  comment for the exact rule). */
  threshold: number;
}

/**
 * Community Settings → Points & Rewards, persisted at
 * `subAccounts/{saId}/communityGroups/{groupId}/config/pointsRewards`.
 * Absent = community has never configured Points & Rewards — every reader
 * must treat that as "use the default rules + the pre-existing global
 * LEVEL_THRESHOLDS/level names", same backward-compatibility convention as
 * `CommunityGroup.theme` (see branding-workspace.tsx). See
 * `default-points-rewards.ts` for the exact default seed.
 */
export interface PointsRewardsConfig {
  rules: PointRuleMap;
  /** Always exactly 9 entries, sorted by `level` ascending. */
  levels: CommunityLevel[];
  /** Bumped on every rules/levels save; stamped onto each `PointEvent`
   *  awarded under it, so a later rule-value change never rewrites the
   *  historical meaning of an already-awarded event (Part 3's "which rule
   *  version" requirement). */
  configVersion: number;
  updatedAt: Timestamp | FieldValue | null;
  /** memberId of the moderator who last saved, or null (never saved / system default). */
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Point Event ledger (extends the pre-existing `pointEvents` subcollection
// already read by `community-leaderboard-service.ts` — see that file's own
// doc comment. This is the same collection, not a parallel one; this type
// just gives its previously-inline `{memberId, delta, createdAt}` shape a
// real name and the additional fields Part 3 requires.)
// ---------------------------------------------------------------------------

export interface PointEvent {
  id: string;
  memberId: string;
  action: PointActionKey;
  /** The post/comment/membership id this award is about. Combined with
   *  `action` and `memberId`, this is also what the event's own Firestore
   *  doc id is deterministically derived from — see `awardPoints`'s doc
   *  comment for the idempotency strategy this enables. */
  sourceEntityId: string;
  delta: number;
  configVersion: number;
  createdAt: Timestamp | FieldValue | null;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export type RewardStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "completed"
  | "expired"
  | "archived";

export type RewardCriterion =
  | { type: "top_points_period"; window: "7d" | "30d" | "all"; winnerCount: number }
  | { type: "point_threshold"; threshold: number }
  | { type: "reach_level"; level: number }
  | { type: "manual" };

/**
 * V1 ships ONLY "manual" fulfillment (free-text instructions + optional
 * URL, filled in by the moderator, acted on by the moderator). The
 * discriminated-union shape (rather than a flat `instructions`/`url` pair
 * directly on `CommunityReward`) is deliberate: it's what lets a future
 * automatic type (course access, membership tier, channel unlock, CRM tag,
 * workflow trigger, coupon/credit, download asset) be added as a new union
 * member later without a schema migration of existing rewards — see Part 12.
 */
export type RewardFulfillment = {
  type: "manual";
  instructions: string;
  url?: string | null;
};

/**
 * Doc id = auto id, at
 * `subAccounts/{saId}/communityGroups/{groupId}/rewards/{rewardId}`.
 * `status` is the moderator's own authoritative setting; the LIVE state
 * shown anywhere in the UI is always `effectiveRewardStatus(reward)`
 * (computed fresh from `status` + `startAt`/`endAt`, never a stored,
 * cron-updated field — see that function's doc comment in
 * `community-rewards-service.ts` for why).
 */
export interface CommunityReward {
  id: string;
  subAccountId: string;
  groupId: string;
  title: string;
  description: string;
  status: RewardStatus;
  /** Both optional — a reward may run "always active until manually ended"
   *  (no dates) or be date-range-scheduled (either or both set). */
  startAt: Timestamp | FieldValue | null;
  endAt: Timestamp | FieldValue | null;
  criterion: RewardCriterion;
  fulfillment: RewardFulfillment;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  /** memberId of the moderator who created it. */
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Winners
// ---------------------------------------------------------------------------

export type WinnerFulfillmentStatus = "pending" | "fulfilled";

/**
 * A persistent historical record of one win — never deleted when a reward
 * is archived (Part 15's explicit "past/completed remain available"
 * applies here too). Doc id = auto id, at
 * `subAccounts/{saId}/communityGroups/{groupId}/rewardWinners/{winnerId}`.
 */
export interface CommunityRewardWinner {
  id: string;
  subAccountId: string;
  groupId: string;
  rewardId: string;
  memberId: string;
  awardedAt: Timestamp | FieldValue | null;
  /** memberId of the moderator who confirmed/selected this winner, or
   *  `"system"` — reserved for a future fully-automatic criterion; every V1
   *  winner is moderator-confirmed, so this is always a real memberId
   *  today (Part 17's "do not silently grant real-world prizes without
   *  owner awareness" requirement). */
  awardedBy: string;
  fulfillmentStatus: WinnerFulfillmentStatus;
  notes?: string;
}
