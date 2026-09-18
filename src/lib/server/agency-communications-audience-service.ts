import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { listAgencyGroupMembers, getAgencyGroupById, listGroupsForAgency } from "@/lib/server/community-agency-service";
import { listAgencyStandaloneCourses, getAgencyStandaloneCourse } from "@/lib/server/agency-standalone-course-service";
import { listAgencyCourseOffers, getAgencyCourseOffer } from "@/lib/server/agency-course-offer-service";
import { listPlansForAgency } from "@/lib/server/billing-service";
import type { AgencyAudienceSource } from "@/types/agency-communications";
import type { UserDoc } from "@/types/firebase";

/**
 * Resolves the real, enumerable Agency audiences named in the reuse audit
 * (sub-account owners, plan cohorts, one Agency Community, one Agency
 * Standalone Course's roster, one Agency Course Offer's buyers) into a
 * flat, deduplicated recipient list. Deliberately NOT a condition-group
 * segmentation engine like tenant Broadcasts' `resolveAudience` — Agency
 * audiences are a small, closed set of real sources, not an open-ended
 * Contact filter (per the standing instruction not to reuse the tenant
 * Contact condition builder here).
 *
 * No fabricated "Agency Customer" entity: a sub-account owner is resolved
 * via `users/{uid}`, a Community/Course/Offer recipient via `people/{id}`
 * — two genuinely different identity systems, never merged into a third.
 */

export interface ResolvedRecipient {
  email: string;
  name: string;
  sourceLabel: string;
  identity: { kind: "person" | "staffUser"; id: string };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function resolveSubAccountOwners(agencyId: string, planIds?: string[]): Promise<ResolvedRecipient[]> {
  const db = getAdminDb();
  let query = db.collection("subAccounts").where("agencyId", "==", agencyId) as FirebaseFirestore.Query;
  // Firestore `in` supports up to 10 values — the plan picker is a short,
  // owner-curated list in practice, well under that.
  if (planIds && planIds.length > 0) {
    query = query.where("billing.planId", "in", planIds.slice(0, 10));
  }
  const subsSnap = await query.get();
  const ownerUids = Array.from(
    new Set(
      subsSnap.docs
        .map((d) => d.data().ownerUid as string | undefined)
        .filter((id): id is string => !!id),
    ),
  );
  if (ownerUids.length === 0) return [];
  const userSnaps = await Promise.all(ownerUids.map((uid) => db.doc(`users/${uid}`).get()));
  const label = planIds && planIds.length > 0 ? "Sub-account owners (selected plans)" : "Sub-account owners";
  return userSnaps
    .filter((s) => s.exists)
    .map((s) => {
      const u = s.data() as UserDoc;
      return {
        email: u.email,
        name: u.displayName || u.email,
        sourceLabel: label,
        identity: { kind: "staffUser" as const, id: s.id },
      };
    })
    .filter((r) => !!r.email);
}

async function resolveCommunityAudience(agencyId: string, groupId: string): Promise<ResolvedRecipient[]> {
  const [group, members] = await Promise.all([
    getAgencyGroupById(agencyId, groupId),
    listAgencyGroupMembers(agencyId, groupId),
  ]);
  const label = `Community: ${group?.name ?? "Unknown group"}`;
  return members
    .filter((m) => m.status === "active" && !!m.email)
    .map((m) => ({
      email: m.email,
      name: m.displayName?.trim() || m.email,
      sourceLabel: label,
      identity: { kind: "person" as const, id: m.personId ?? m.id },
    }));
}

async function resolveCourseAudience(agencyId: string, courseId: string): Promise<ResolvedRecipient[]> {
  const course = await getAgencyStandaloneCourse(agencyId, courseId);
  const label = `Course: ${course?.title ?? "Unknown course"}`;
  const enrollSnap = await getAdminDb()
    .collection(`agencies/${agencyId}/standaloneCourses/${courseId}/enrollments`)
    .get();
  const personIds = enrollSnap.docs.map((d) => d.id);
  if (personIds.length === 0) return [];
  const personSnaps = await Promise.all(personIds.map((id) => getAdminDb().doc(`people/${id}`).get()));
  return personSnaps
    .filter((s) => s.exists)
    .map((s) => {
      const email = (s.data()?.primaryEmail as string | undefined) ?? "";
      return {
        email,
        name: email ? email.split("@")[0] : "",
        sourceLabel: label,
        identity: { kind: "person" as const, id: s.id },
      };
    })
    .filter((r) => !!r.email);
}

async function resolveCourseOfferAudience(agencyId: string, offerId: string): Promise<ResolvedRecipient[]> {
  const offer = await getAgencyCourseOffer(agencyId, offerId);
  const label = `Offer: ${offer?.title ?? "Unknown offer"}`;
  const purchaseSnap = await getAdminDb()
    .collection(`agencies/${agencyId}/courseOffers/${offerId}/purchases`)
    .where("status", "==", "paid")
    .get();
  const byPerson = new Map<string, { buyerDisplayName?: string | null }>();
  for (const d of purchaseSnap.docs) {
    const data = d.data() as { memberId: string; buyerDisplayName?: string | null };
    byPerson.set(data.memberId, { buyerDisplayName: data.buyerDisplayName });
  }
  const personIds = Array.from(byPerson.keys());
  if (personIds.length === 0) return [];
  const personSnaps = await Promise.all(personIds.map((id) => getAdminDb().doc(`people/${id}`).get()));
  return personSnaps
    .filter((s) => s.exists)
    .map((s) => {
      const email = (s.data()?.primaryEmail as string | undefined) ?? "";
      const buyerName = byPerson.get(s.id)?.buyerDisplayName;
      return {
        email,
        name: buyerName?.trim() || (email ? email.split("@")[0] : ""),
        sourceLabel: label,
        identity: { kind: "person" as const, id: s.id },
      };
    })
    .filter((r) => !!r.email);
}

/** Resolves one source into its raw (not-yet-deduplicated) recipient list. */
async function resolveSource(agencyId: string, source: AgencyAudienceSource): Promise<ResolvedRecipient[]> {
  switch (source.kind) {
    case "subAccountOwners":
      return resolveSubAccountOwners(agencyId);
    case "planCohort":
      return source.planIds?.length ? resolveSubAccountOwners(agencyId, source.planIds) : [];
    case "community":
      return source.groupId ? resolveCommunityAudience(agencyId, source.groupId) : [];
    case "course":
      return source.courseId ? resolveCourseAudience(agencyId, source.courseId) : [];
    case "courseOffer":
      return source.offerId ? resolveCourseOfferAudience(agencyId, source.offerId) : [];
    default:
      return [];
  }
}

export interface DedupedRecipient extends ResolvedRecipient {
  /** Every source label that matched this recipient — "explain why". */
  matchedSources: string[];
}

/**
 * Resolves every selected source and deduplicates by lowercased email — a
 * Person/staff user may qualify through more than one audience (e.g. a
 * Community member who is also a course buyer); they get exactly one
 * recipient row, with every matching source recorded for "explain why".
 */
export async function resolveAgencyAudience(
  agencyId: string,
  sources: AgencyAudienceSource[],
): Promise<DedupedRecipient[]> {
  const lists = await Promise.all(sources.map((s) => resolveSource(agencyId, s)));
  const byEmail = new Map<string, DedupedRecipient>();
  for (const list of lists) {
    for (const r of list) {
      const key = normalizeEmail(r.email);
      if (!key) continue;
      const existing = byEmail.get(key);
      if (existing) {
        if (!existing.matchedSources.includes(r.sourceLabel)) {
          existing.matchedSources.push(r.sourceLabel);
        }
        continue;
      }
      byEmail.set(key, { ...r, email: key, matchedSources: [r.sourceLabel] });
    }
  }
  return Array.from(byEmail.values());
}

/** Lightweight labels for the audience picker's own dropdowns — no need
 *  to resolve full recipient lists just to populate a <select>. */
export async function listAudiencePickerOptions(agencyId: string): Promise<{
  plans: { id: string; name: string }[];
  communities: { id: string; name: string }[];
  courses: { id: string; title: string }[];
  offers: { id: string; title: string }[];
}> {
  const [plans, groups, courses, offers] = await Promise.all([
    listPlansForAgency(agencyId),
    listGroupsForAgency(agencyId),
    listAgencyStandaloneCourses(agencyId),
    listAgencyCourseOffers(agencyId),
  ]);
  return {
    plans: plans.map((p) => ({ id: p.id, name: p.name })),
    communities: groups.map((g) => ({ id: g.id, name: g.name })),
    courses: courses.map((c) => ({ id: c.id, title: c.title })),
    offers: offers.map((o) => ({ id: o.id, title: o.title })),
  };
}
