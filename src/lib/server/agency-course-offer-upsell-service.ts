import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CourseOfferUpsell, OfferVisibility } from "@/types/course-offers";

/**
 * One-Click Upsell for an Agency Course Offer — the agency-scope sibling
 * of course-offer-upsell-service.ts, rooted at
 * `agencies/{agencyId}/courseOffers/{offerId}/upsells`. Only the
 * `"oneClick"` upsell type is ported this pass (a targeted audit of the
 * tenant implementation found NO Contact/subAccount dependency anywhere
 * in the actual charge mechanism — see chargeOneClickUpsellForAgencyServerSide
 * in agency-course-offer-purchase-service.ts); `"inApp"` upsells (a
 * separate library/portal-display surface) are not named in this pass and
 * stay tenant-only for now, a disclosed, narrower scope cut, not a
 * dependency.
 */

function upsellsCol(agencyId: string, offerId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/courseOffers/${offerId}/upsells`);
}

export async function createAgencyOneClickUpsellServerSide(opts: {
  agencyId: string;
  offerId: string;
  targetOfferId: string;
}): Promise<CourseOfferUpsell> {
  const existing = await upsellsCol(opts.agencyId, opts.offerId).where("type", "==", "oneClick").limit(1).get();
  if (!existing.empty) throw new Error("A single one-click upsell is allowed per offer.");
  const doc = {
    offerId: opts.offerId,
    type: "oneClick" as const,
    targetOfferId: opts.targetOfferId,
    visibility: "draft" as OfferVisibility,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await upsellsCol(opts.agencyId, opts.offerId).add(doc);
  return { id: ref.id, ...doc } as CourseOfferUpsell;
}

export async function updateAgencyOneClickUpsellServerSide(opts: {
  agencyId: string;
  offerId: string;
  upsellId: string;
  patch: { visibility?: OfferVisibility; targetOfferId?: string };
}): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (opts.patch.visibility) updates.visibility = opts.patch.visibility;
  if (opts.patch.targetOfferId) updates.targetOfferId = opts.patch.targetOfferId;
  await upsellsCol(opts.agencyId, opts.offerId).doc(opts.upsellId).update(updates);
}

export async function deleteAgencyOneClickUpsellServerSide(opts: { agencyId: string; offerId: string; upsellId: string }): Promise<void> {
  await upsellsCol(opts.agencyId, opts.offerId).doc(opts.upsellId).delete();
}

export async function getAgencyOneClickUpsell(agencyId: string, offerId: string): Promise<CourseOfferUpsell | null> {
  const snap = await upsellsCol(agencyId, offerId).where("type", "==", "oneClick").limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<CourseOfferUpsell, "id">) };
}

/** The buyer-facing check — only a PUBLISHED one-click upsell triggers
 *  the post-purchase interstitial. Mirrors tenant `getOneClickUpsellForOffer`. */
export async function getPublishedAgencyOneClickUpsell(agencyId: string, offerId: string): Promise<CourseOfferUpsell | null> {
  const snap = await upsellsCol(agencyId, offerId).where("type", "==", "oneClick").where("visibility", "==", "published").limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<CourseOfferUpsell, "id">) };
}
