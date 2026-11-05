/**
 * Community Membership Levels (2026-11-05) — what a member can ACCESS inside
 * one Community. Billing never lives here: a paid level points at a Magnetix
 * Offer (`offerId`), and the Offer stays authoritative for price, interval,
 * trial and payment. An active entitlement to that Offer grants the level.
 *
 * Every value stored on these docs is plain JSON (epoch-ms numbers, never
 * Firestore Timestamps) because levels are handed to Client Components.
 *
 * Paths:
 *   subAccounts/{sa}/communityGroups/{g}/membershipLevels/{levelId}
 *   subAccounts/{sa}/communityGroups/{g}/memberships/{memberId}/levelGrants/{grantId}
 * plus a denormalized `levelIds: string[]` on the membership doc (active,
 * non-base grants) for cheap reads.
 */

export type AccessMode = "all" | "selected";

export interface AccessRule {
  mode: AccessMode;
  /** Channel / course / event ids when `mode === "selected"`. */
  ids: string[];
}

export interface LevelAccess {
  channels: AccessRule;
  courses: AccessRule;
  events: AccessRule;
}

export type MembershipLevelStatus = "active" | "inactive";

export interface MembershipLevel {
  id: string;
  subAccountId: string;
  groupId: string;
  name: string;
  description: string;
  /** The fallback level: every active member without another active
   *  qualifying grant resolves here. Exactly one per community. */
  isBase: boolean;
  status: MembershipLevelStatus;
  /** Paid levels reference a same-workspace Offer; null = free. */
  offerId: string | null;
  order: number;
  access: LevelAccess;
  createdAtMs: number;
  updatedAtMs: number;
  createdByUid: string | null;
  updatedByUid: string | null;
}

export type LevelGrantSource = "offer" | "manual";
export type LevelGrantStatus = "active" | "ended";

export interface LevelGrant {
  id: string;
  levelId: string;
  memberId: string;
  source: LevelGrantSource;
  status: LevelGrantStatus;
  /** Offer-backed grants only. */
  offerId: string | null;
  purchaseId: string | null;
  grantedAtMs: number;
  grantedByUid: string | null;
  endedAtMs: number | null;
  endReason: string | null;
}

export const FULL_ACCESS: LevelAccess = {
  channels: { mode: "all", ids: [] },
  courses: { mode: "all", ids: [] },
  events: { mode: "all", ids: [] },
};

/** Community notification categories (Settings → Notifications & Digest). */
export type CommunityNotificationCategory = "member_joined" | "content" | "replies";

export interface NotificationDelivery {
  email: boolean;
  inApp: boolean;
}

export type DigestFrequency = "off" | "daily" | "weekly" | "monthly";

export interface CommunityNotificationSettings {
  events: Record<CommunityNotificationCategory, NotificationDelivery>;
  digest: { frequency: DigestFrequency; lastSentAtMs: number | null };
}

/**
 * Defaults keep today's behavior: replies + mentions already email and
 * notify in-app; new-member alerts go to moderators; new-content emails are
 * OFF by default so a post never emails every member until the owner opts
 * in; the digest is OFF until the owner picks a frequency.
 */
export const DEFAULT_COMMUNITY_NOTIFICATION_SETTINGS: CommunityNotificationSettings = {
  events: {
    member_joined: { email: true, inApp: true },
    content: { email: false, inApp: true },
    replies: { email: true, inApp: true },
  },
  digest: { frequency: "off", lastSentAtMs: null },
};

/** A member's own overrides for one community; absent keys inherit. */
export interface MemberCommunityNotificationPrefs {
  events: Partial<Record<CommunityNotificationCategory, Partial<NotificationDelivery>>>;
  digest: "inherit" | "off";
  updatedAtMs: number;
}
