import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { ensureUniqueSlug, isSlugAvailable, isValidSlugFormat } from "@/lib/slug";
import {
  DEFAULT_COURSE_OFFER_ACCESS,
  DEFAULT_COURSE_OFFER_ADVANCED,
  DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
} from "@/types/course-offers";
import { DEFAULT_OFFER_THEME, normalizeCourseTheme } from "@/types/course-theme";
import type {
  CourseOffer,
  CourseOfferAccess,
  CourseOfferAdvanced,
  CourseOfferCheckoutSettings,
  OfferType,
  OfferVisibility,
  RecurringInterval,
} from "@/types/course-offers";

/**
 * Agency Course Offers — the agency-scope sibling of course-offer-
 * service.ts, rooted at `agencies/{agencyId}/courseOffers`. Bundles two
 * or more Agency Standalone Courses into one sellable checkout. Mirrors
 * tenant's CRUD/pricing/access/checkoutSettings/theme surface exactly.
 *
 * Deliberately NOT ported: `booking` (Booking Pages bundling) and
 * `projectTemplates` (Client Project instantiation on purchase) — both
 * are genuine missing-product dependencies at agency scope (Booking
 * Pages and Client Projects are sub-account CRM products with no agency
 * analog; `projectTemplates` fulfillment specifically requires a
 * `Member.contactId` -> CRM Contact relationship that doesn't exist
 * here either). Every Agency Offer always has `booking: null`,
 * `projectTemplates: []` — real, disclosed gaps, not silently merged in.
 */

function offersCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/courseOffers`);
}
function offerDoc(agencyId: string, offerId: string) {
  return offersCol(agencyId).doc(offerId);
}

export async function createAgencyCourseOfferServerSide(opts: {
  agencyId: string;
  title: string;
  courseIds: string[];
  type?: OfferType;
  priceCents?: number | null;
  currency?: string | null;
  recurringInterval?: RecurringInterval | null;
  trialDays?: number | null;
  priceTextOverride?: string | null;
}): Promise<CourseOffer> {
  const type: OfferType = opts.type ?? "free";
  const slug = await ensureUniqueSlug({ db: getAdminDb(), collectionPath: `agencies/${opts.agencyId}/courseOffers`, base: opts.title });
  const doc = {
    agencyId: opts.agencyId,
    title: opts.title.trim(),
    slug,
    descriptionHtml: "",
    courseIds: opts.courseIds,
    type,
    priceCents: type === "free" ? null : (opts.priceCents ?? null),
    currency: type === "free" ? null : (opts.currency ?? "USD"),
    recurringInterval: type === "recurring" ? (opts.recurringInterval ?? "month") : null,
    trialDays: type === "recurring" ? (opts.trialDays ?? null) : null,
    priceTextOverride: opts.priceTextOverride?.trim() || null,
    visibility: "draft" as OfferVisibility,
    version: 1,
    thumbnailUrl: null,
    discountCodesEnabled: false,
    showRecentPurchasePopup: false,
    access: DEFAULT_COURSE_OFFER_ACCESS,
    advanced: DEFAULT_COURSE_OFFER_ADVANCED,
    theme: DEFAULT_OFFER_THEME,
    checkoutSettings: DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
    booking: null,
    projectTemplates: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await offersCol(opts.agencyId).add(doc);
  return { id: ref.id, ...doc } as unknown as CourseOffer;
}

export interface AgencyCourseOfferPatch {
  title?: string;
  slug?: string;
  descriptionHtml?: string;
  courseIds?: string[];
  type?: OfferType;
  priceCents?: number | null;
  currency?: string | null;
  recurringInterval?: RecurringInterval | null;
  trialDays?: number | null;
  priceTextOverride?: string | null;
  visibility?: OfferVisibility;
  thumbnailUrl?: string | null;
  discountCodesEnabled?: boolean;
  access?: Partial<CourseOfferAccess>;
  advanced?: Partial<CourseOfferAdvanced>;
  checkoutSettings?: Partial<CourseOfferCheckoutSettings>;
}

export async function updateAgencyCourseOfferServerSide(opts: {
  agencyId: string;
  offerId: string;
  patch: AgencyCourseOfferPatch;
}): Promise<void> {
  const p = opts.patch;
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), version: FieldValue.increment(1) };
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (typeof p.slug === "string") {
    const slug = p.slug.trim().toLowerCase();
    if (!isValidSlugFormat(slug)) {
      throw new Error("Slug must be 1-48 lowercase letters, numbers, and hyphens, and can't start or end with a hyphen.");
    }
    const available = await isSlugAvailable({ db: getAdminDb(), collectionPath: `agencies/${opts.agencyId}/courseOffers`, slug, excludeDocId: opts.offerId });
    if (!available) throw new Error(`"${slug}" is already used by another offer.`);
    updates.slug = slug;
  }
  if (typeof p.descriptionHtml === "string") updates.descriptionHtml = p.descriptionHtml;
  if (Array.isArray(p.courseIds)) updates.courseIds = p.courseIds;
  if (p.type) {
    updates.type = p.type;
    if (p.type === "free") {
      updates.priceCents = null;
      updates.currency = null;
      updates.recurringInterval = null;
      updates.trialDays = null;
    } else {
      if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
      updates.currency = p.currency ?? "USD";
      updates.recurringInterval = p.type === "recurring" ? (p.recurringInterval ?? "month") : null;
      updates.trialDays = p.type === "recurring" ? (p.trialDays ?? null) : null;
    }
  } else {
    if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
    if (p.currency !== undefined) updates.currency = p.currency;
    if (p.recurringInterval !== undefined) updates.recurringInterval = p.recurringInterval;
    if (p.trialDays !== undefined) updates.trialDays = p.trialDays;
  }
  if (p.priceTextOverride !== undefined) updates.priceTextOverride = p.priceTextOverride?.trim() || null;
  if (p.visibility) updates.visibility = p.visibility;
  if (p.thumbnailUrl !== undefined) updates.thumbnailUrl = p.thumbnailUrl;
  if (typeof p.discountCodesEnabled === "boolean") updates.discountCodesEnabled = p.discountCodesEnabled;
  if (p.access) {
    for (const [key, value] of Object.entries(p.access)) updates[`access.${key}`] = value;
  }
  if (p.advanced) {
    for (const [key, value] of Object.entries(p.advanced)) updates[`advanced.${key}`] = value;
  }
  if (p.checkoutSettings) {
    for (const [key, value] of Object.entries(p.checkoutSettings)) updates[`checkoutSettings.${key}`] = value;
  }
  await offerDoc(opts.agencyId, opts.offerId).update(updates);
}

export async function deleteAgencyCourseOfferServerSide(opts: { agencyId: string; offerId: string }): Promise<void> {
  await getAdminDb().recursiveDelete(offerDoc(opts.agencyId, opts.offerId));
}

function withDefaults(id: string, data: Record<string, unknown>): CourseOffer {
  return {
    id,
    ...(data as Omit<CourseOffer, "id">),
    access: (data.access as CourseOfferAccess) ?? DEFAULT_COURSE_OFFER_ACCESS,
    advanced: (data.advanced as CourseOfferAdvanced) ?? DEFAULT_COURSE_OFFER_ADVANCED,
    theme: normalizeCourseTheme(data.theme as CourseOffer["theme"], DEFAULT_OFFER_THEME),
    checkoutSettings: (data.checkoutSettings as CourseOfferCheckoutSettings) ?? DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
    booking: null,
    projectTemplates: [],
  };
}

export async function updateAgencyCourseOfferThemeServerSide(opts: { agencyId: string; offerId: string; theme: CourseOffer["theme"] }): Promise<void> {
  await offerDoc(opts.agencyId, opts.offerId).update({ theme: opts.theme, updatedAt: FieldValue.serverTimestamp() });
}

export async function getAgencyCourseOffer(agencyId: string, offerId: string): Promise<CourseOffer | null> {
  const snap = await offerDoc(agencyId, offerId).get();
  if (!snap.exists) return null;
  return withDefaults(snap.id, snap.data()!);
}

export async function getAgencyCourseOfferBySlug(agencyId: string, slug: string): Promise<CourseOffer | null> {
  const snap = await offersCol(agencyId).where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  const offer = withDefaults(snap.docs[0].id, snap.docs[0].data());
  return offer.visibility === "published" ? offer : null;
}

export async function listAgencyCourseOffers(agencyId: string): Promise<CourseOffer[]> {
  const snap = await offersCol(agencyId).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => withDefaults(d.id, d.data()));
}
