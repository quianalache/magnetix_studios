import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getInaccessibleChannelNames } from "@/lib/server/community-channels-service";
import {
  effectiveDelivery,
  normalizeNotificationSettings,
} from "@/lib/community/membership-access";
import type {
  CommunityNotificationCategory,
  CommunityNotificationSettings,
  DigestFrequency,
  MemberCommunityNotificationPrefs,
  NotificationDelivery,
} from "@/types/community-membership";

/**
 * Community notification defaults (owner, Settings → Notifications & Digest)
 * + per-member overrides (member, MyMagnetix → Settings → community).
 *
 * Community defaults live on the group doc as `notificationSettings` (plain
 * JSON — the group doc is handed to Client Components). Member overrides
 * live with the PERSON (`people/{id}/communityNotificationPrefs/{sa}__{g}`)
 * because notifications belong to the person, not a tenant Member.
 * Transactional mail (password, receipts, security) never reads any of this.
 */

const groupRef = (sa: string, g: string) => getAdminDb().doc(`subAccounts/${sa}/communityGroups/${g}`);
const prefsRef = (personId: string, sa: string, g: string) =>
  getAdminDb().doc(`people/${personId}/communityNotificationPrefs/${sa}__${g}`);

export async function getCommunityNotificationSettings(sa: string, g: string): Promise<CommunityNotificationSettings> {
  const snap = await groupRef(sa, g).get();
  return normalizeNotificationSettings(snap.data()?.notificationSettings);
}

/** Owner save. Turning the digest on (or changing it) starts its clock now — no backlog digest. */
export async function saveCommunityNotificationSettings(
  sa: string,
  g: string,
  input: { events?: unknown; digestFrequency?: unknown }
): Promise<CommunityNotificationSettings> {
  const current = await getCommunityNotificationSettings(sa, g);
  const next = normalizeNotificationSettings({
    events: input.events ?? current.events,
    digest: current.digest,
  });
  if (input.digestFrequency !== undefined) {
    const f = input.digestFrequency;
    if (f !== "off" && f !== "daily" && f !== "weekly" && f !== "monthly") throw new Error("Choose Off, Daily, Weekly or Monthly.");
    if (f !== current.digest.frequency) {
      next.digest = { frequency: f as DigestFrequency, lastSentAtMs: f === "off" ? current.digest.lastSentAtMs : Date.now() };
    }
  }
  await groupRef(sa, g).set({ notificationSettings: next }, { merge: true });
  return next;
}

export async function getMemberCommunityPrefs(personId: string, sa: string, g: string): Promise<MemberCommunityNotificationPrefs | null> {
  const snap = await prefsRef(personId, sa, g).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { events: d.events ?? {}, digest: d.digest === "off" ? "off" : "inherit", updatedAtMs: d.updatedAtMs ?? 0 };
}

const CATEGORIES: CommunityNotificationCategory[] = ["member_joined", "content", "replies"];

export async function saveMemberCommunityPrefs(
  personId: string,
  sa: string,
  g: string,
  input: { events?: unknown; digest?: unknown }
): Promise<MemberCommunityNotificationPrefs> {
  const events: MemberCommunityNotificationPrefs["events"] = {};
  const raw = (input.events ?? {}) as Record<string, Partial<NotificationDelivery>>;
  for (const c of CATEGORIES) {
    const v = raw[c];
    if (!v) continue;
    const o: Partial<NotificationDelivery> = {};
    if (typeof v.email === "boolean") o.email = v.email;
    if (typeof v.inApp === "boolean") o.inApp = v.inApp;
    events[c] = o;
  }
  const prefs: MemberCommunityNotificationPrefs = { events, digest: input.digest === "off" ? "off" : "inherit", updatedAtMs: Date.now() };
  await prefsRef(personId, sa, g).set(prefs);
  return prefs;
}

/** One-click unsubscribe from a community's digest (from the email link). */
export async function unsubscribeMemberFromDigest(personId: string, sa: string, g: string): Promise<void> {
  const current = await getMemberCommunityPrefs(personId, sa, g);
  await prefsRef(personId, sa, g).set({ events: current?.events ?? {}, digest: "off", updatedAtMs: Date.now() });
}

/**
 * How (if at all) one member should be told about one community event.
 * Null = don't notify: not an active member, the content sits in a channel
 * their Membership Level / role can't access, or both channels are off.
 */
export async function communityDeliveryFor(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  personId: string;
  category: CommunityNotificationCategory;
  channelName: string | null;
  settings?: CommunityNotificationSettings;
}): Promise<NotificationDelivery | null> {
  const db = getAdminDb();
  const membership = await db.doc(`subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/memberships/${opts.memberId}`).get();
  if (!membership.exists || membership.data()!.status !== "active") return null;
  const isModerator = membership.data()!.role === "moderator";
  if (opts.channelName && !isModerator) {
    const inaccessible = await getInaccessibleChannelNames({
      subAccountId: opts.subAccountId,
      groupId: opts.groupId,
      isModerator,
      memberId: opts.memberId,
    });
    if (inaccessible.has(opts.channelName)) return null;
  }
  const settings = opts.settings ?? (await getCommunityNotificationSettings(opts.subAccountId, opts.groupId));
  const prefs = await getMemberCommunityPrefs(opts.personId, opts.subAccountId, opts.groupId);
  const d = effectiveDelivery(settings, prefs, opts.category);
  return d.email || d.inApp ? d : null;
}
