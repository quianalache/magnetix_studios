import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_COURSE_OFFER_ACCESS,
  DEFAULT_COURSE_OFFER_ADVANCED,
  DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
} from "@/types/course-offers";
import { DEFAULT_OFFER_THEME } from "@/types/course-theme";
import type {
  CourseOffer,
  CourseOfferAccess,
  CourseOfferAdvanced,
  CourseOfferBookingBundle,
  CourseOfferCheckoutSettings,
  OfferType,
  OfferVisibility,
  RecurringInterval,
} from "@/types/course-offers";

/**
 * Server-side Course Offer service (Admin SDK). Mirrors the conventions of
 * `standalone-course-service.ts` — same tenancy shape
 * (`subAccounts/{saId}/courseOffers/{offerId}`), same create/patch/delete
 * pattern. An Offer bundles one or more existing Standalone Courses into a
 * single sellable unit; see the course-offers plan for the full picture.
 */

function offersCol(saId: string) {
  return getAdminDb().collection(`subAccounts/${saId}/courseOffers`);
}
function offerDoc(saId: string, offerId: string) {
  return offersCol(saId).doc(offerId);
}

export async function createCourseOfferServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  title: string;
  courseIds: string[];
  type?: OfferType;
  priceCents?: number | null;
  currency?: string | null;
  recurringInterval?: RecurringInterval | null;
  trialDays?: number | null;
  priceTextOverride?: string | null;
  booking?: CourseOfferBookingBundle | null;
}): Promise<CourseOffer> {
  const type: OfferType = opts.type ?? "free";
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    title: opts.title.trim(),
    descriptionHtml: "",
    courseIds: opts.courseIds,
    type,
    priceCents: type === "free" ? null : (opts.priceCents ?? null),
    currency: type === "free" ? null : (opts.currency ?? "USD"),
    recurringInterval:
      type === "recurring" ? (opts.recurringInterval ?? "month") : null,
    trialDays: type === "recurring" ? (opts.trialDays ?? null) : null,
    priceTextOverride: opts.priceTextOverride?.trim() || null,
    visibility: "draft" as OfferVisibility,
    version: 1,
    thumbnailUrl: null,
    discountCodesEnabled: false,
    access: DEFAULT_COURSE_OFFER_ACCESS,
    advanced: DEFAULT_COURSE_OFFER_ADVANCED,
    theme: DEFAULT_OFFER_THEME,
    checkoutSettings: DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
    booking: opts.booking ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await offersCol(opts.subAccountId).add(doc);
  return { id: ref.id, ...doc } as CourseOffer;
}

export interface CourseOfferPatch {
  title?: string;
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
  /** Whole-object replace (or `null` to clear) — not a dotted-path merge
   *  like `access`/`advanced`, since the editor always sends the full
   *  bundle or nothing. */
  booking?: CourseOfferBookingBundle | null;
}

export async function updateCourseOfferServerSide(opts: {
  subAccountId: string;
  offerId: string;
  patch: CourseOfferPatch;
}): Promise<void> {
  const p = opts.patch;
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    version: FieldValue.increment(1),
  };
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (typeof p.descriptionHtml === "string") {
    updates.descriptionHtml = p.descriptionHtml;
  }
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
      updates.recurringInterval =
        p.type === "recurring" ? (p.recurringInterval ?? "month") : null;
      updates.trialDays =
        p.type === "recurring" ? (p.trialDays ?? null) : null;
    }
  } else {
    if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
    if (p.currency !== undefined) updates.currency = p.currency;
    if (p.recurringInterval !== undefined) {
      updates.recurringInterval = p.recurringInterval;
    }
    if (p.trialDays !== undefined) updates.trialDays = p.trialDays;
  }
  if (p.priceTextOverride !== undefined) {
    updates.priceTextOverride = p.priceTextOverride?.trim() || null;
  }
  if (p.visibility) updates.visibility = p.visibility;
  if (p.thumbnailUrl !== undefined) updates.thumbnailUrl = p.thumbnailUrl;
  if (typeof p.discountCodesEnabled === "boolean") {
    updates.discountCodesEnabled = p.discountCodesEnabled;
  }
  if (p.access) {
    for (const [key, value] of Object.entries(p.access)) {
      updates[`access.${key}`] = value;
    }
  }
  if (p.advanced) {
    for (const [key, value] of Object.entries(p.advanced)) {
      updates[`advanced.${key}`] = value;
    }
  }
  if (p.checkoutSettings) {
    for (const [key, value] of Object.entries(p.checkoutSettings)) {
      updates[`checkoutSettings.${key}`] = value;
    }
  }
  if (p.booking !== undefined) updates.booking = p.booking;
  await offerDoc(opts.subAccountId, opts.offerId).update(updates);
}

export async function deleteCourseOfferServerSide(opts: {
  subAccountId: string;
  offerId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(offerDoc(opts.subAccountId, opts.offerId));
}

function withDefaults(id: string, data: Record<string, unknown>): CourseOffer {
  return {
    id,
    ...(data as Omit<CourseOffer, "id">),
    access: (data.access as CourseOfferAccess) ?? DEFAULT_COURSE_OFFER_ACCESS,
    advanced:
      (data.advanced as CourseOfferAdvanced) ?? DEFAULT_COURSE_OFFER_ADVANCED,
    theme: (data.theme as CourseOffer["theme"]) ?? DEFAULT_OFFER_THEME,
    checkoutSettings:
      (data.checkoutSettings as CourseOfferCheckoutSettings) ??
      DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
    booking: (data.booking as CourseOfferBookingBundle | null) ?? null,
  };
}

/** Full-object replace of an offer's theme (staff-only, via its theme editor). */
export async function updateCourseOfferThemeServerSide(opts: {
  subAccountId: string;
  offerId: string;
  theme: CourseOffer["theme"];
}): Promise<void> {
  await offerDoc(opts.subAccountId, opts.offerId).update({
    theme: opts.theme,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function getCourseOffer(
  saId: string,
  offerId: string,
): Promise<CourseOffer | null> {
  const snap = await offerDoc(saId, offerId).get();
  if (!snap.exists) return null;
  return withDefaults(snap.id, snap.data()!);
}

export async function listCourseOffers(saId: string): Promise<CourseOffer[]> {
  const snap = await offersCol(saId).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => withDefaults(d.id, d.data()));
}

/** Offers that include the given course — used by the course editor's
 *  "which offers include this" and the Add Products picker's reverse lookup. */
export async function getCourseOffersForCourse(
  saId: string,
  courseId: string,
): Promise<CourseOffer[]> {
  const snap = await offersCol(saId)
    .where("courseIds", "array-contains", courseId)
    .get();
  return snap.docs.map((d) => withDefaults(d.id, d.data()));
}
