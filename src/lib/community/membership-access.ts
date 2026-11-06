/**
 * Pure membership-access resolution (no I/O) — shared by every server
 * enforcement point and by tests.
 *
 * Rules:
 * - A community with NO levels is unrestricted (legacy behavior, so shipping
 *   this feature removes nobody's access).
 * - Every active member holds the Base Membership. Any active, ACTIVE-level
 *   grant adds its level. Access is the UNION of held levels: if any held
 *   level allows something, it's allowed (additive — never removes access).
 * - Inactive levels grant nothing (their members fall back to Base).
 */
import type {
  AccessRule,
  CommunityNotificationCategory,
  CommunityNotificationSettings,
  DigestFrequency,
  MemberCommunityNotificationPrefs,
  MembershipLevel,
  NotificationDelivery,
} from "@/types/community-membership";
import { DEFAULT_COMMUNITY_NOTIFICATION_SETTINGS } from "@/types/community-membership";

export interface ResolvedAccess {
  /** False only when the community has no levels at all. */
  restricted: boolean;
  levelIds: string[];
  channels: "all" | Set<string>;
  courses: "all" | Set<string>;
  events: "all" | Set<string>;
}

export const UNRESTRICTED: ResolvedAccess = {
  restricted: false,
  levelIds: [],
  channels: "all",
  courses: "all",
  events: "all",
};

function unionRules(rules: AccessRule[]): "all" | Set<string> {
  if (rules.some((r) => r.mode === "all")) return "all";
  return new Set(rules.flatMap((r) => r.ids));
}

export function resolveMemberAccess(levels: MembershipLevel[], grantedLevelIds: readonly string[]): ResolvedAccess {
  if (levels.length === 0) return UNRESTRICTED;
  const granted = new Set(grantedLevelIds);
  const held = levels.filter((l) => l.status === "active" && (l.isBase || granted.has(l.id)));
  return {
    restricted: true,
    levelIds: held.map((l) => l.id),
    channels: unionRules(held.map((l) => l.access.channels)),
    courses: unionRules(held.map((l) => l.access.courses)),
    events: "all",
  };
}

export function allows(set: "all" | Set<string>, id: string): boolean {
  return set === "all" || set.has(id);
}

/** Is this id granted to EVERY member (i.e. by the Base Membership)? */
export function baseAllows(levels: MembershipLevel[], kind: "channels" | "courses", id: string): boolean {
  if (levels.length === 0) return true;
  const base = levels.find((l) => l.isBase && l.status === "active");
  if (!base) return true;
  return base.access[kind].mode === "all" || base.access[kind].ids.includes(id);
}

/** Validate a level edit against the Base Membership rules. Returns an error or null. */
export function levelRuleProblem(next: Pick<MembershipLevel, "isBase" | "status" | "offerId">): string | null {
  if (next.isBase && next.status !== "active") return "The Base Membership can't be inactive.";
  if (next.isBase && next.offerId) return "The Base Membership is free — it can't be connected to an Offer.";
  return null;
}

export function normalizeAccessRule(raw: unknown, allowedIds: readonly string[] | null): AccessRule {
  const r = (raw ?? {}) as { mode?: unknown; ids?: unknown };
  if (r.mode !== "selected") return { mode: "all", ids: [] };
  const ids = Array.isArray(r.ids) ? r.ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 200) : [];
  const unique = [...new Set(ids)];
  return { mode: "selected", ids: allowedIds ? unique.filter((id) => allowedIds.includes(id)) : unique };
}

// ---------------- notifications ----------------

export function normalizeNotificationSettings(raw: unknown): CommunityNotificationSettings {
  const d = DEFAULT_COMMUNITY_NOTIFICATION_SETTINGS;
  const r = (raw ?? {}) as { events?: Record<string, Partial<NotificationDelivery>>; digest?: { frequency?: unknown; lastSentAtMs?: unknown } };
  const ev = (k: CommunityNotificationCategory): NotificationDelivery => ({
    email: typeof r.events?.[k]?.email === "boolean" ? !!r.events[k].email : d.events[k].email,
    inApp: typeof r.events?.[k]?.inApp === "boolean" ? !!r.events[k].inApp : d.events[k].inApp,
  });
  const freq = r.digest?.frequency;
  return {
    events: { member_joined: ev("member_joined"), content: ev("content"), replies: ev("replies") },
    digest: {
      frequency: freq === "daily" || freq === "weekly" || freq === "monthly" ? (freq as DigestFrequency) : "off",
      lastSentAtMs: typeof r.digest?.lastSentAtMs === "number" ? r.digest.lastSentAtMs : null,
    },
  };
}

/** Effective delivery for one member + category: their override, else the community default. */
export function effectiveDelivery(
  settings: CommunityNotificationSettings,
  prefs: MemberCommunityNotificationPrefs | null,
  category: CommunityNotificationCategory
): NotificationDelivery {
  const base = settings.events[category];
  const o = prefs?.events?.[category] ?? {};
  return {
    email: typeof o.email === "boolean" ? o.email : base.email,
    inApp: typeof o.inApp === "boolean" ? o.inApp : base.inApp,
  };
}

export function memberWantsDigest(settings: CommunityNotificationSettings, prefs: MemberCommunityNotificationPrefs | null): boolean {
  return settings.digest.frequency !== "off" && prefs?.digest !== "off";
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Is a digest due at `now`? Daily: ≥20h since the last one. Weekly: Mondays
 * (UTC), ≥6 days since. Monthly: the 1st (UTC), ≥27 days since. A digest
 * that has never been sent counts from when it was turned on
 * (`lastSentAtMs` is stamped then) — no retroactive backlog.
 */
export function digestDue(settings: CommunityNotificationSettings, now: Date): boolean {
  const { frequency, lastSentAtMs } = settings.digest;
  if (frequency === "off") return false;
  const since = lastSentAtMs == null ? Infinity : now.getTime() - lastSentAtMs;
  if (frequency === "daily") return since >= 20 * 60 * 60 * 1000;
  if (frequency === "weekly") return now.getUTCDay() === 1 && since >= 6 * DAY;
  return now.getUTCDate() === 1 && since >= 27 * DAY;
}

export function digestWindowStart(settings: CommunityNotificationSettings, now: Date): number {
  const span = settings.digest.frequency === "daily" ? DAY : settings.digest.frequency === "weekly" ? 7 * DAY : 31 * DAY;
  return Math.max(settings.digest.lastSentAtMs ?? 0, now.getTime() - span);
}
