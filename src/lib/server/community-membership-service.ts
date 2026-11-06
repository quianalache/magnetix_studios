import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { syncGroupMemberCount } from "@/lib/server/community-member-count";
import { resolveEffectiveBaseRoster, type EffectiveMembershipRecord, type MembershipRosterIdentity } from "@/lib/community/membership-roster";
import { createCourseOfferServerSide, getCourseOffer, updateCourseOfferServerSide } from "@/lib/server/course-offer-service";
import {
  allows,
  baseAllows,
  levelRuleProblem,
  normalizeAccessRule,
  resolveMemberAccess,
  UNRESTRICTED,
  type ResolvedAccess,
} from "@/lib/community/membership-access";
import {
  FULL_ACCESS,
  type LevelAccess,
  type LevelGrant,
  type LevelGrantSource,
  type MembershipLevel,
  type MembershipLevelBillingOption,
  type MembershipLevelBulletStyle,
  type MembershipLevelPricing,
  type MembershipLevelPricingMode,
  type MembershipLevelVisibility,
  type MembershipLevelStatus,
} from "@/types/community-membership";

/**
 * Community Membership Levels — storage, rules, grants and access
 * resolution. See types/community-membership.ts for the model and
 * lib/community/membership-access.ts for the pure resolution rules.
 */

export class MembershipLevelError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const groupPath = (sa: string, g: string) => `subAccounts/${sa}/communityGroups/${g}`;
const levelsCol = (sa: string, g: string) => getAdminDb().collection(`${groupPath(sa, g)}/membershipLevels`);
const membershipRef = (sa: string, g: string, memberId: string) => getAdminDb().doc(`${groupPath(sa, g)}/memberships/${memberId}`);
const grantsCol = (sa: string, g: string, memberId: string) => membershipRef(sa, g, memberId).collection("levelGrants");

function toLevel(id: string, d: FirebaseFirestore.DocumentData): MembershipLevel {
  const access = (d.access ?? {}) as Partial<LevelAccess>;
  const rawPricing = (d.pricing ?? {}) as Partial<MembershipLevelPricing>;
  const option = (value: unknown, fallbackCurrency = "USD"): MembershipLevelBillingOption => {
    const raw = (value ?? {}) as Partial<MembershipLevelBillingOption>;
    return {
      enabled: raw.enabled === true,
      priceCents: typeof raw.priceCents === "number" && Number.isFinite(raw.priceCents) ? raw.priceCents : null,
      currency: typeof raw.currency === "string" && raw.currency ? raw.currency.toUpperCase() : fallbackCurrency,
      label: typeof raw.label === "string" ? raw.label : null,
      savingsLabel: typeof raw.savingsLabel === "string" ? raw.savingsLabel : null,
      bonuses: Array.isArray(raw.bonuses) ? raw.bonuses.filter((x): x is string => typeof x === "string") : [],
    };
  };
  const pricing: MembershipLevelPricing = {
    mode: rawPricing.mode === "paid" || (rawPricing.mode === undefined && typeof d.offerId === "string" && d.offerId) ? "paid" : "free",
    monthly: option(rawPricing.monthly),
    annual: option(rawPricing.annual),
    oneTime: option(rawPricing.oneTime),
  };
  const billingOfferIds = (d.billingOfferIds ?? {}) as Record<string, unknown>;
  return {
    id,
    subAccountId: d.subAccountId,
    groupId: d.groupId,
    name: d.name ?? "",
    description: d.description ?? "",
    shortDescription: typeof d.shortDescription === "string" ? d.shortDescription : (d.description ?? "").slice(0, 100),
    icon: typeof d.icon === "string" && d.icon ? d.icon : null,
    highlights: Array.isArray(d.highlights) ? d.highlights.filter((x: unknown): x is string => typeof x === "string") : [],
    bulletStyle: d.bulletStyle === "sparkle" ? "sparkle" : "checkmark",
    featuredLabel: typeof d.featuredLabel === "string" && d.featuredLabel ? d.featuredLabel : null,
    publicVisibility: d.publicVisibility === "public" || d.showOnPlans === true ? "public" : "hidden",
    isBase: d.isBase === true,
    status: d.status === "inactive" ? "inactive" : "active",
    offerId: typeof d.offerId === "string" && d.offerId ? d.offerId : null,
    pricing,
    billingOfferIds: {
      monthly: typeof billingOfferIds.monthly === "string" ? billingOfferIds.monthly : null,
      annual: typeof billingOfferIds.annual === "string" ? billingOfferIds.annual : null,
      oneTime: typeof billingOfferIds.oneTime === "string" ? billingOfferIds.oneTime : null,
    },
    order: typeof d.order === "number" ? d.order : 0,
    access: {
      channels: normalizeAccessRule(access.channels, null),
      courses: normalizeAccessRule(access.courses, null),
    },
    createdAtMs: d.createdAtMs ?? 0,
    updatedAtMs: d.updatedAtMs ?? 0,
    createdByUid: d.createdByUid ?? null,
    updatedByUid: d.updatedByUid ?? null,
  };
}

export async function listMembershipLevels(sa: string, g: string): Promise<MembershipLevel[]> {
  const snap = await levelsCol(sa, g).get();
  return snap.docs.map((d) => toLevel(d.id, d.data())).sort((a, b) => a.order - b.order || a.createdAtMs - b.createdAtMs);
}

/**
 * The first time a community uses Access & Membership, create its Base
 * Membership with FULL access — exactly what every member had before levels
 * existed, so turning the feature on removes nobody's access.
 */
export async function ensureBaseMembershipLevel(sa: string, g: string, uid: string | null): Promise<MembershipLevel[]> {
  const existing = await listMembershipLevels(sa, g);
  if (existing.length > 0) return existing;
  const db = getAdminDb();
  const ref = levelsCol(sa, g).doc("base");
  await db.runTransaction(async (tx) => {
    const any = await tx.get(levelsCol(sa, g).limit(1));
    if (!any.empty) return;
    const now = Date.now();
    tx.create(ref, {
      subAccountId: sa,
      groupId: g,
      name: "Base Membership",
      description: "Everything every member of this community can access.",
      shortDescription: "Free community access for everyone.",
      icon: "people",
      highlights: [],
      bulletStyle: "checkmark",
      featuredLabel: null,
      publicVisibility: "hidden",
      isBase: true,
      status: "active",
      offerId: null,
      pricing: { mode: "free", monthly: { enabled: false, priceCents: null, currency: "USD", bonuses: [] }, annual: { enabled: false, priceCents: null, currency: "USD", bonuses: [] }, oneTime: { enabled: false, priceCents: null, currency: "USD", bonuses: [] } },
      billingOfferIds: { monthly: null, annual: null, oneTime: null },
      order: 0,
      access: FULL_ACCESS,
      createdAtMs: now,
      updatedAtMs: now,
      createdByUid: uid,
      updatedByUid: uid,
    });
  });
  return listMembershipLevels(sa, g);
}

/** Ids a level may reference, so a level can never point outside its community. */
export async function listSelectableAccessIds(sa: string, g: string): Promise<{ channels: string[]; courses: string[] }> {
  const db = getAdminDb();
  const [channels, native, linked] = await Promise.all([
    db.collection(`${groupPath(sa, g)}/channels`).get(),
    db.collection(`${groupPath(sa, g)}/courses`).get(),
    db.collection(`subAccounts/${sa}/standaloneCourses`).where("linkedCommunityGroupIds", "array-contains", g).get(),
  ]);
  return {
    channels: channels.docs.map((d) => d.id),
    courses: [...native.docs.map((d) => d.id), ...linked.docs.map((d) => d.id)],
  };
}

export async function validateLevelOffer(sa: string, offerId: string | null): Promise<void> {
  if (!offerId) return;
  const offer = await getCourseOffer(sa, offerId).catch(() => null);
  // getCourseOffer reads subAccounts/{sa}/courseOffers/{id}, so an Offer
  // from another workspace simply isn't found — cross-workspace refused.
  if (!offer || offer.subAccountId !== sa) throw new MembershipLevelError("Choose an Offer from this workspace.");
}

export interface LevelInput {
  name?: unknown;
  description?: unknown;
  status?: unknown;
  offerId?: unknown;
  access?: unknown;
  shortDescription?: unknown;
  icon?: unknown;
  highlights?: unknown;
  bulletStyle?: unknown;
  featuredLabel?: unknown;
  publicVisibility?: unknown;
  pricing?: unknown;
  billingOfferIds?: unknown;
}

function cleanText(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) : undefined;
}

async function buildPatch(sa: string, g: string, input: LevelInput): Promise<Partial<MembershipLevel>> {
  const patch: Partial<MembershipLevel> = {};
  const name = cleanText(input.name, 60);
  if (name !== undefined) {
    if (!name) throw new MembershipLevelError("A level needs a name.");
    patch.name = name;
  }
  const description = cleanText(input.description, 200);
  if (description !== undefined) patch.description = description;
  if (input.shortDescription !== undefined) {
    const shortDescription = cleanText(input.shortDescription, 100);
    if (shortDescription === undefined) throw new MembershipLevelError("Short description must be text.");
    patch.shortDescription = shortDescription;
  }
  if (input.icon !== undefined) {
    const icon = typeof input.icon === "string" && input.icon.trim() ? input.icon.trim() : null;
    const allowedIcons = new Set(["none", "crown", "star", "gem", "sparkles", "rocket", "lightning", "heart", "people", "play", "book", "trophy"]);
    if (icon && !allowedIcons.has(icon)) throw new MembershipLevelError("Choose an icon from the Community plan icon set.");
    patch.icon = icon;
  }
  if (input.highlights !== undefined) {
    if (!Array.isArray(input.highlights)) throw new MembershipLevelError("Plan highlights must be a list.");
    patch.highlights = input.highlights.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 12).map((x) => x.slice(0, 120));
  }
  if (input.bulletStyle !== undefined) {
    if (input.bulletStyle !== "checkmark" && input.bulletStyle !== "sparkle") throw new MembershipLevelError("Bullet style must be Checkmark or Sparkle.");
    patch.bulletStyle = input.bulletStyle as MembershipLevelBulletStyle;
  }
  if (input.featuredLabel !== undefined) patch.featuredLabel = cleanText(input.featuredLabel, 32) || null;
  if (input.publicVisibility !== undefined) {
    if (input.publicVisibility !== "public" && input.publicVisibility !== "hidden") throw new MembershipLevelError("Public visibility must be Public or Hidden.");
    patch.publicVisibility = input.publicVisibility as MembershipLevelVisibility;
  }
  if (input.pricing !== undefined) {
    const raw = (input.pricing ?? {}) as Record<string, unknown>;
    const mode = raw.mode === "paid" ? "paid" : raw.mode === "free" ? "free" : null;
    if (!mode) throw new MembershipLevelError("Choose Free or Paid pricing.");
    const parse = (key: string): MembershipLevelBillingOption => {
      const value = (raw[key] ?? {}) as Record<string, unknown>;
      const enabled = value.enabled === true;
      const cents = value.priceCents === null || value.priceCents === undefined || value.priceCents === "" ? null : Number(value.priceCents);
      if (enabled && (!Number.isInteger(cents) || (cents as number) <= 0)) throw new MembershipLevelError(`${key} pricing needs a positive whole-number price in cents.`);
      return { enabled, priceCents: enabled ? cents : null, currency: typeof value.currency === "string" && value.currency ? value.currency.toUpperCase() : "USD", label: cleanText(value.label, 40) || null, savingsLabel: cleanText(value.savingsLabel, 40) || null, bonuses: Array.isArray(value.bonuses) ? value.bonuses.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 8).map((x) => x.slice(0, 100)) : [] };
    };
    const pricing = { mode: mode as MembershipLevelPricingMode, monthly: parse("monthly"), annual: parse("annual"), oneTime: parse("oneTime") } satisfies MembershipLevelPricing;
    if (mode === "paid" && !pricing.monthly.enabled && !pricing.annual.enabled && !pricing.oneTime.enabled && !(typeof input.offerId === "string" && input.offerId)) throw new MembershipLevelError("Paid levels need at least one billing option.");
    if (mode === "free" && (pricing.monthly.enabled || pricing.annual.enabled || pricing.oneTime.enabled)) throw new MembershipLevelError("Free levels cannot have paid billing options.");
    patch.pricing = pricing;
  }
  if (input.status !== undefined) {
    if (input.status !== "active" && input.status !== "inactive") throw new MembershipLevelError("Status must be Active or Inactive.");
    patch.status = input.status as MembershipLevelStatus;
  }
  if (input.offerId !== undefined) {
    const offerId = typeof input.offerId === "string" && input.offerId ? input.offerId : null;
    await validateLevelOffer(sa, offerId);
    patch.offerId = offerId;
  }
  if (input.access !== undefined) {
    const allowed = await listSelectableAccessIds(sa, g);
    const a = (input.access ?? {}) as Record<string, unknown>;
    patch.access = {
      channels: normalizeAccessRule(a.channels, allowed.channels),
      courses: normalizeAccessRule(a.courses, allowed.courses),
    };
  }
  return patch;
}

export async function createMembershipLevel(sa: string, g: string, input: LevelInput, uid: string | null): Promise<MembershipLevel> {
  const levels = await ensureBaseMembershipLevel(sa, g, uid);
  const patch = await buildPatch(sa, g, input);
  if (!patch.name) throw new MembershipLevelError("A level needs a name.");
  const now = Date.now();
  const doc = {
    subAccountId: sa,
    groupId: g,
    name: patch.name,
    description: patch.description ?? "",
    shortDescription: patch.shortDescription ?? "",
    icon: patch.icon ?? "star",
    highlights: patch.highlights ?? [],
    bulletStyle: patch.bulletStyle ?? "checkmark",
    featuredLabel: patch.featuredLabel ?? null,
    publicVisibility: patch.publicVisibility ?? "public",
    isBase: false,
    status: patch.status ?? "inactive",
    offerId: patch.offerId ?? null,
    pricing: patch.pricing ?? { mode: "free", monthly: { enabled: false, priceCents: null, currency: "USD", bonuses: [] }, annual: { enabled: false, priceCents: null, currency: "USD", bonuses: [] }, oneTime: { enabled: false, priceCents: null, currency: "USD", bonuses: [] } },
    billingOfferIds: { monthly: null, annual: null, oneTime: null },
    order: Math.max(0, ...levels.map((l) => l.order)) + 1,
    access: patch.access ?? FULL_ACCESS,
    createdAtMs: now,
    updatedAtMs: now,
    createdByUid: uid,
    updatedByUid: uid,
  };
  const ref = await levelsCol(sa, g).add(doc);
  const created = toLevel(ref.id, doc);
  return created.pricing.mode === "paid" ? syncSystemBillingOffers(sa, g, created) : created;
}

export async function updateMembershipLevel(sa: string, g: string, levelId: string, input: LevelInput, uid: string | null): Promise<MembershipLevel> {
  const ref = levelsCol(sa, g).doc(levelId);
  const snap = await ref.get();
  if (!snap.exists) throw new MembershipLevelError("Membership level not found.", 404);
  const current = toLevel(snap.id, snap.data()!);
  const patch = await buildPatch(sa, g, input);
  const nextPricing = (patch.pricing ?? current.pricing);
  if (current.isBase && nextPricing.mode === "paid") throw new MembershipLevelError("The Base Membership is always free.");
  const problem = levelRuleProblem({ isBase: current.isBase, status: patch.status ?? current.status, offerId: patch.offerId !== undefined ? patch.offerId : current.offerId });
  if (problem) throw new MembershipLevelError(problem);
  const storedPatch = { ...patch, ...(current.isBase ? { pricing: { ...current.pricing, mode: "free", monthly: { ...current.pricing.monthly, enabled: false }, annual: { ...current.pricing.annual, enabled: false }, oneTime: { ...current.pricing.oneTime, enabled: false } } } : {}), updatedAtMs: Date.now(), updatedByUid: uid };
  await ref.update(storedPatch);
  const next = toLevel(snap.id, { ...snap.data(), ...storedPatch });
  return next.pricing.mode === "paid" ? syncSystemBillingOffers(sa, g, next) : next;
}

/** Creates/updates the hidden billing objects used by native Community plan checkout. */
async function syncSystemBillingOffers(sa: string, g: string, level: MembershipLevel): Promise<MembershipLevel> {
  const sub = await getAdminDb().doc(`subAccounts/${sa}`).get();
  const agencyId = typeof sub.data()?.agencyId === "string" ? sub.data()!.agencyId : "";
  if (!agencyId) throw new MembershipLevelError("This workspace is missing its billing owner.");
  const ids = { ...level.billingOfferIds };
  const configs = [
    ["monthly", level.pricing.monthly, "recurring", "month"],
    ["annual", level.pricing.annual, "recurring", "year"],
    ["oneTime", level.pricing.oneTime, "oneTime", null],
  ] as const;
  for (const [kind, option, type, interval] of configs) {
    if (!option.enabled || !option.priceCents) continue;
    const title = `${level.name} — ${kind === "oneTime" ? "one-time" : kind}`;
    const existingId = ids[kind];
    if (existingId) {
      await updateCourseOfferServerSide({ subAccountId: sa, offerId: existingId, patch: { title, type, priceCents: option.priceCents, currency: option.currency, recurringInterval: interval, visibility: "published", paymentMode: "live" } });
      continue;
    }
    const offer = await createCourseOfferServerSide({ subAccountId: sa, agencyId, title, courseIds: [], type, priceCents: option.priceCents, currency: option.currency, recurringInterval: interval, paymentMode: "live" });
    await getAdminDb().doc(`subAccounts/${sa}/courseOffers/${offer.id}`).update({ visibility: "published", systemManaged: true, communityMembershipLevelId: level.id, communityMembershipGroupId: g, communityBillingKind: kind });
    ids[kind] = offer.id;
  }
  const next = { ...level, billingOfferIds: ids, offerId: ids.monthly ?? ids.annual ?? ids.oneTime ?? level.offerId };
  await levelsCol(sa, g).doc(level.id).update({ billingOfferIds: ids, offerId: next.offerId, updatedAtMs: Date.now() });
  return next;
}

/** Swap the Base Membership in one transaction — there is always exactly one. */
export async function makeBaseMembershipLevel(sa: string, g: string, levelId: string, uid: string | null): Promise<void> {
  const db = getAdminDb();
  await db.runTransaction(async (tx) => {
    const all = await tx.get(levelsCol(sa, g));
    const target = all.docs.find((d) => d.id === levelId);
    if (!target) throw new MembershipLevelError("Membership level not found.", 404);
    const t = toLevel(target.id, target.data());
    if (t.isBase) return;
    if (t.status !== "active") throw new MembershipLevelError("Activate this level before making it the Base Membership.");
    if (t.offerId) throw new MembershipLevelError("The Base Membership is free — disconnect the Offer first.");
    const now = Date.now();
    for (const d of all.docs) {
      if (d.id === levelId) tx.update(d.ref, { isBase: true, updatedAtMs: now, updatedByUid: uid });
      else if (d.data().isBase) tx.update(d.ref, { isBase: false, updatedAtMs: now, updatedByUid: uid });
    }
  });
}

/**
 * Delete is only for a level nobody has ever held. A level with grant
 * history (active or ended, manual or purchased) must be set to Inactive
 * instead, so purchase history and audit records stay intact.
 */
export async function deleteMembershipLevel(sa: string, g: string, levelId: string): Promise<void> {
  const ref = levelsCol(sa, g).doc(levelId);
  const snap = await ref.get();
  if (!snap.exists) throw new MembershipLevelError("Membership level not found.", 404);
  if (snap.data()!.isBase) throw new MembershipLevelError("The Base Membership can't be deleted. Make another level the Base Membership first.");
  if ((await countLevelGrants(sa, g, levelId, false)) > 0) {
    throw new MembershipLevelError("This level has members or past grants, so it can't be deleted. Set it to Inactive instead.", 409);
  }
  await ref.delete();
}

// ---------------- grants ----------------

async function listMembershipIds(sa: string, g: string): Promise<{ id: string; status: string; levelIds: string[] }[]> {
  const snap = await getAdminDb().collection(`${groupPath(sa, g)}/memberships`).get();
  return snap.docs.map((d) => ({ id: d.id, status: d.data().status, levelIds: Array.isArray(d.data().levelIds) ? d.data().levelIds : [] }));
}

async function countLevelGrants(sa: string, g: string, levelId: string, activeOnly: boolean): Promise<number> {
  let n = 0;
  for (const m of await listMembershipIds(sa, g)) {
    const snap = await grantsCol(sa, g, m.id).where("levelId", "==", levelId).get();
    n += snap.docs.filter((d) => !activeOnly || d.data().status === "active").length;
  }
  return n;
}

/** Recompute the denormalized `levelIds` (active grants) on the membership. */
async function syncMembershipLevelIds(sa: string, g: string, memberId: string): Promise<string[]> {
  const snap = await grantsCol(sa, g, memberId).where("status", "==", "active").get();
  const ids = [...new Set(snap.docs.map((d) => d.data().levelId as string))].sort();
  await membershipRef(sa, g, memberId).set({ levelIds: ids }, { merge: true });
  return ids;
}

function grantId(source: LevelGrantSource, levelId: string, ref: string): string {
  return `${source}_${levelId}_${ref}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
}

export async function grantMembershipLevel(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  levelId: string;
  source: LevelGrantSource;
  offerId?: string | null;
  purchaseId?: string | null;
  grantedByUid?: string | null;
}): Promise<{ created: boolean }> {
  const { subAccountId: sa, groupId: g } = opts;
  const level = await levelsCol(sa, g).doc(opts.levelId).get();
  if (!level.exists) throw new MembershipLevelError("Membership level not found.", 404);
  if (level.data()!.isBase) throw new MembershipLevelError("Every member already has the Base Membership.");
  const mem = await membershipRef(sa, g, opts.memberId).get();
  if (!mem.exists || mem.data()!.status !== "active") throw new MembershipLevelError("Only active community members can be given a level.");
  const id = grantId(opts.source, opts.levelId, opts.source === "offer" ? (opts.purchaseId ?? "purchase") : "staff");
  const ref = grantsCol(sa, g, opts.memberId).doc(id);
  const existing = await ref.get();
  if (existing.exists && existing.data()!.status === "active") return { created: false };
  const grant: Omit<LevelGrant, "id"> = {
    levelId: opts.levelId,
    memberId: opts.memberId,
    source: opts.source,
    status: "active",
    offerId: opts.offerId ?? null,
    purchaseId: opts.purchaseId ?? null,
    grantedAtMs: Date.now(),
    grantedByUid: opts.grantedByUid ?? null,
    endedAtMs: null,
    endReason: null,
  };
  await ref.set(grant);
  await syncMembershipLevelIds(sa, g, opts.memberId);
  return { created: true };
}

export async function endMembershipLevelGrant(opts: { subAccountId: string; groupId: string; memberId: string; grantId: string; reason: string }): Promise<void> {
  const ref = grantsCol(opts.subAccountId, opts.groupId, opts.memberId).doc(opts.grantId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.status !== "active") return;
  await ref.update({ status: "ended", endedAtMs: Date.now(), endReason: opts.reason });
  await syncMembershipLevelIds(opts.subAccountId, opts.groupId, opts.memberId);
}

export interface LevelMemberRow {
  memberId: string;
  name: string;
  email: string;
  source: "base" | LevelGrantSource;
  grantId: string | null;
  grantedAtMs: number | null;
}

/** Members currently on a level (Base = active members with no other active level). */
export async function listLevelMembers(sa: string, g: string, levelId: string): Promise<LevelMemberRow[]> {
  const db = getAdminDb();
  const level = await levelsCol(sa, g).doc(levelId).get();
  const levels = await listMembershipLevels(sa, g);
  const target = level.exists ? toLevel(level.id, level.data()!) : levelId === "base" ? levels.find((l) => l.isBase) : null;
  if (!target && levelId !== "base") throw new MembershipLevelError("Membership level not found.", 404);
  if (target?.isBase || levelId === "base") {
    const memberships = await listMembershipIds(sa, g);
    const identities = new Map<string, MembershipRosterIdentity>();
    for (const membership of memberships) {
      const member = (await db.doc(`subAccounts/${sa}/members/${membership.id}`).get()).data();
      identities.set(membership.id, { memberId: membership.id, name: member?.displayName ?? "", email: member?.email ?? "" });
    }
    return resolveEffectiveBaseRoster(
      memberships.map((membership) => ({ memberId: membership.id, status: membership.status, levelIds: membership.levelIds })) satisfies EffectiveMembershipRecord[],
      levels,
      identities,
    );
  }
  const rows: LevelMemberRow[] = [];
  for (const m of await listMembershipIds(sa, g)) {
    if (m.status !== "active") continue;
    const member = (await db.doc(`subAccounts/${sa}/members/${m.id}`).get()).data();
    const base = { memberId: m.id, name: member?.displayName ?? "", email: member?.email ?? "" };
    const grants = await grantsCol(sa, g, m.id).where("levelId", "==", levelId).where("status", "==", "active").get();
    for (const d of grants.docs) rows.push({ ...base, source: d.data().source, grantId: d.id, grantedAtMs: d.data().grantedAtMs ?? null });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Level member counts for the list view, from one pass over the roster. */
export async function countMembersPerLevel(sa: string, g: string, levels: MembershipLevel[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(levels.map((l) => [l.id, 0]));
  const activeNonBase = new Set(levels.filter((l) => l.status === "active" && !l.isBase).map((l) => l.id));
  const base = levels.find((l) => l.isBase);
  for (const m of await listMembershipIds(sa, g)) {
    if (m.status !== "active") continue;
    let onPaid = false;
    for (const id of m.levelIds) {
      if (id in counts) counts[id]++;
      if (activeNonBase.has(id)) onPaid = true;
    }
    if (base && !onPaid) counts[base.id]++;
  }
  return counts;
}

// ---------------- access resolution ----------------

/**
 * The member's resolved access in one community. Moderators are never
 * restricted. A community without levels is unrestricted.
 */
export async function resolveMemberAccessServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string | null;
  isModerator: boolean;
}): Promise<ResolvedAccess> {
  if (opts.isModerator) return UNRESTRICTED;
  const levels = await listMembershipLevels(opts.subAccountId, opts.groupId);
  if (levels.length === 0) return UNRESTRICTED;
  // No / inactive membership → Base Membership only (never more).
  let granted: string[] = [];
  if (opts.memberId) {
    const m = await membershipRef(opts.subAccountId, opts.groupId, opts.memberId).get();
    if (m.exists && m.data()!.status === "active" && Array.isArray(m.data()!.levelIds)) granted = m.data()!.levelIds;
  }
  const resolved = resolveMemberAccess(levels, granted);
  // Events are governed by their own access/channel rules, never by a
  // Membership Level. Keep the field for existing event readers, but make it
  // unrestricted regardless of historical stored level data.
  return { ...resolved, events: "all" };
}

// ---------------- Offer entitlement → level ----------------

/** Every level (in any community of this workspace) connected to an Offer. */
async function levelsForOffer(sa: string, offerId: string): Promise<MembershipLevel[]> {
  const groups = await getAdminDb().collection(`subAccounts/${sa}/communityGroups`).get();
  const out: MembershipLevel[] = [];
  for (const gd of groups.docs) {
    const snap = await levelsCol(sa, gd.id).get();
    out.push(...snap.docs.map((d) => toLevel(d.id, d.data())).filter((level) => level.offerId === offerId || Object.values(level.billingOfferIds).includes(offerId)));
  }
  return out;
}

/**
 * Called by the canonical Offer fulfillment once a purchase is PAID: grants
 * every Membership Level connected to that Offer. A buyer who isn't in the
 * community yet is added as an active member first (origin "offer"); a
 * banned member is never re-admitted by a purchase.
 */
export async function grantLevelsForOfferPurchase(opts: { subAccountId: string; offerId: string; purchaseId: string; memberId: string; agencyId: string }): Promise<number> {
  const levels = await levelsForOffer(opts.subAccountId, opts.offerId);
  let granted = 0;
  for (const level of levels) {
    if (level.isBase) continue;
    const ref = membershipRef(opts.subAccountId, level.groupId, opts.memberId);
    const snap = await ref.get();
    if (snap.exists && snap.data()!.status === "banned") continue;
    if (!snap.exists || snap.data()!.status !== "active") {
      await ref.set(
        {
          subAccountId: opts.subAccountId,
          agencyId: opts.agencyId,
          groupId: level.groupId,
          memberId: opts.memberId,
          role: snap.data()?.role ?? "member",
          status: "active",
          points: snap.data()?.points ?? 0,
          level: snap.data()?.level ?? 1,
          tierId: null,
          joinedAt: snap.data()?.joinedAt ?? new Date(),
          origin: snap.data()?.origin ?? "offer",
        },
        { merge: true }
      );
      await syncGroupMemberCount(opts.subAccountId, level.groupId);
    }
    const r = await grantMembershipLevel({ subAccountId: opts.subAccountId, groupId: level.groupId, memberId: opts.memberId, levelId: level.id, source: "offer", offerId: opts.offerId, purchaseId: opts.purchaseId });
    if (r.created) granted++;
  }
  return granted;
}

/**
 * Called when an Offer purchase stops being an active entitlement
 * (subscription deleted, purchase canceled/voided). Ends only the grants
 * that came from THAT purchase — the member stays in the community and
 * falls back to the Base Membership unless another grant applies.
 */
export async function endLevelsForOfferPurchase(opts: { subAccountId: string; offerId: string; purchaseId: string; memberId: string; reason: string }): Promise<number> {
  const levels = await levelsForOffer(opts.subAccountId, opts.offerId);
  let ended = 0;
  for (const level of levels) {
    const id = grantId("offer", level.id, opts.purchaseId);
    const ref = grantsCol(opts.subAccountId, level.groupId, opts.memberId).doc(id);
    const snap = await ref.get();
    if (snap.exists && snap.data()!.status === "active") {
      await endMembershipLevelGrant({ subAccountId: opts.subAccountId, groupId: level.groupId, memberId: opts.memberId, grantId: id, reason: opts.reason });
      ended++;
    }
  }
  return ended;
}

/** Offer summary for the drawer + list; never copies billing onto the level. */
export async function describeLevelOffer(sa: string, offerId: string | null): Promise<{
  id: string;
  title: string;
  priceLabel: string;
  visibility: string;
  warning: string | null;
} | null> {
  if (!offerId) return null;
  const offer = await getCourseOffer(sa, offerId).catch(() => null);
  if (!offer) return { id: offerId, title: "Offer not found", priceLabel: "", visibility: "missing", warning: "This Offer no longer exists — buyers can't purchase this level. Choose another Offer." };
  const price =
    offer.type === "free"
      ? "Free"
      : `${(offer.priceCents ?? 0) / 100} ${offer.currency ?? "USD"}${offer.type === "recurring" ? ` / ${offer.recurringInterval ?? "month"}` : ""}`;
  const warning =
    offer.visibility === "archived"
      ? "This Offer is archived — nobody new can buy this level. Existing members keep it."
      : offer.visibility === "draft"
        ? "This Offer is a draft — publish it so people can buy this level."
        : null;
  return { id: offer.id, title: offer.title, priceLabel: offer.priceTextOverride || price, visibility: offer.visibility, warning };
}

/**
 * Membership-level decision for a STANDALONE course linked to one or more
 * communities. `gated`: some linked community has levels and its Base
 * Membership does NOT include the course (so being a member isn't enough).
 * `levelAllows`: the member holds a level (incl. Base) in a linked
 * community that includes the course.
 */
export async function standaloneCourseLevelDecision(
  sa: string,
  courseId: string,
  linkedGroupIds: readonly string[],
  memberId: string
): Promise<{ gated: boolean; levelAllows: boolean }> {
  let gated = false;
  let levelAllows = false;
  for (const g of linkedGroupIds) {
    const levels = await listMembershipLevels(sa, g);
    if (levels.length === 0) continue;
    if (!baseAllows(levels, "courses", courseId)) gated = true;
    const m = await membershipRef(sa, g, memberId).get();
    if (!m.exists || m.data()!.status !== "active") continue;
    if (m.data()!.role === "moderator") {
      levelAllows = true;
      continue;
    }
    const granted = Array.isArray(m.data()!.levelIds) ? (m.data()!.levelIds as string[]) : [];
    if (allows(resolveMemberAccess(levels, granted).courses, courseId)) levelAllows = true;
  }
  return { gated, levelAllows };
}
