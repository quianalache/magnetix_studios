import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { syncGroupMemberCount } from "@/lib/server/community-member-count";
import { resolveEffectiveBaseRoster, type EffectiveMembershipRecord, type MembershipRosterIdentity } from "@/lib/community/membership-roster";
import { getCourseOffer } from "@/lib/server/course-offer-service";
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
  return {
    id,
    subAccountId: d.subAccountId,
    groupId: d.groupId,
    name: d.name ?? "",
    description: d.description ?? "",
    isBase: d.isBase === true,
    status: d.status === "inactive" ? "inactive" : "active",
    offerId: typeof d.offerId === "string" && d.offerId ? d.offerId : null,
    order: typeof d.order === "number" ? d.order : 0,
    access: {
      channels: normalizeAccessRule(access.channels, null),
      courses: normalizeAccessRule(access.courses, null),
      events: normalizeAccessRule(access.events, null),
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
      isBase: true,
      status: "active",
      offerId: null,
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
export async function listSelectableAccessIds(sa: string, g: string): Promise<{ channels: string[]; courses: string[]; events: string[] }> {
  const db = getAdminDb();
  const [channels, native, linked, events] = await Promise.all([
    db.collection(`${groupPath(sa, g)}/channels`).get(),
    db.collection(`${groupPath(sa, g)}/courses`).get(),
    db.collection(`subAccounts/${sa}/standaloneCourses`).where("linkedCommunityGroupIds", "array-contains", g).get(),
    db.collection(`${groupPath(sa, g)}/events`).limit(300).get(),
  ]);
  return {
    channels: channels.docs.map((d) => d.id),
    courses: [...native.docs.map((d) => d.id), ...linked.docs.map((d) => d.id)],
    events: events.docs.map((d) => d.id),
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
      events: normalizeAccessRule(a.events, allowed.events),
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
    isBase: false,
    status: patch.status ?? "inactive",
    offerId: patch.offerId ?? null,
    order: Math.max(0, ...levels.map((l) => l.order)) + 1,
    access: patch.access ?? FULL_ACCESS,
    createdAtMs: now,
    updatedAtMs: now,
    createdByUid: uid,
    updatedByUid: uid,
  };
  const ref = await levelsCol(sa, g).add(doc);
  return toLevel(ref.id, doc);
}

export async function updateMembershipLevel(sa: string, g: string, levelId: string, input: LevelInput, uid: string | null): Promise<MembershipLevel> {
  const ref = levelsCol(sa, g).doc(levelId);
  const snap = await ref.get();
  if (!snap.exists) throw new MembershipLevelError("Membership level not found.", 404);
  const current = toLevel(snap.id, snap.data()!);
  const patch = await buildPatch(sa, g, input);
  const problem = levelRuleProblem({ isBase: current.isBase, status: patch.status ?? current.status, offerId: patch.offerId !== undefined ? patch.offerId : current.offerId });
  if (problem) throw new MembershipLevelError(problem);
  await ref.update({ ...patch, updatedAtMs: Date.now(), updatedByUid: uid });
  return toLevel(snap.id, { ...snap.data(), ...patch });
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
  return resolveMemberAccess(levels, granted);
}

// ---------------- Offer entitlement → level ----------------

/** Every level (in any community of this workspace) connected to an Offer. */
async function levelsForOffer(sa: string, offerId: string): Promise<MembershipLevel[]> {
  const groups = await getAdminDb().collection(`subAccounts/${sa}/communityGroups`).get();
  const out: MembershipLevel[] = [];
  for (const gd of groups.docs) {
    const snap = await levelsCol(sa, gd.id).where("offerId", "==", offerId).get();
    out.push(...snap.docs.map((d) => toLevel(d.id, d.data())));
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
