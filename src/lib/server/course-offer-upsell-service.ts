import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CourseOfferUpsell, UpsellType, OfferVisibility } from "@/types/course-offers";

/**
 * Upsells attached to a Course Offer, at
 * `subAccounts/{saId}/courseOffers/{offerId}/upsells/{upsellId}`. At most one
 * `"oneClick"` upsell is allowed per offer — enforced here, not in Firestore
 * rules. `"inApp"` upsells can have several.
 */

function upsellsCol(saId: string, offerId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/courseOffers/${offerId}/upsells`,
  );
}

export async function createCourseOfferUpsellServerSide(opts: {
  subAccountId: string;
  offerId: string;
  type: UpsellType;
  targetOfferId: string;
}): Promise<CourseOfferUpsell> {
  if (opts.type === "oneClick") {
    const existing = await upsellsCol(opts.subAccountId, opts.offerId)
      .where("type", "==", "oneClick")
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new Error("A single one-click upsell is allowed per offer.");
    }
  }
  const doc = {
    offerId: opts.offerId,
    type: opts.type,
    targetOfferId: opts.targetOfferId,
    visibility: "draft" as OfferVisibility,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await upsellsCol(opts.subAccountId, opts.offerId).add(doc);
  return { id: ref.id, ...doc } as CourseOfferUpsell;
}

export async function updateCourseOfferUpsellServerSide(opts: {
  subAccountId: string;
  offerId: string;
  upsellId: string;
  patch: { visibility?: OfferVisibility; targetOfferId?: string };
}): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (opts.patch.visibility) updates.visibility = opts.patch.visibility;
  if (opts.patch.targetOfferId) updates.targetOfferId = opts.patch.targetOfferId;
  await upsellsCol(opts.subAccountId, opts.offerId)
    .doc(opts.upsellId)
    .update(updates);
}

export async function deleteCourseOfferUpsellServerSide(opts: {
  subAccountId: string;
  offerId: string;
  upsellId: string;
}): Promise<void> {
  await upsellsCol(opts.subAccountId, opts.offerId).doc(opts.upsellId).delete();
}

export async function listCourseOfferUpsells(
  saId: string,
  offerId: string,
): Promise<CourseOfferUpsell[]> {
  const snap = await upsellsCol(saId, offerId)
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CourseOfferUpsell, "id">) }),
  );
}

/** The One-Click upsell for an offer, if one exists — the buyer-facing
 *  post-purchase interstitial checks this right after a successful checkout. */
export async function getOneClickUpsellForOffer(
  saId: string,
  offerId: string,
): Promise<CourseOfferUpsell | null> {
  const snap = await upsellsCol(saId, offerId)
    .where("type", "==", "oneClick")
    .where("visibility", "==", "published")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<CourseOfferUpsell, "id">) };
}

/**
 * All published In-App upsells targeting offers the given member has
 * purchased — powers the buyer's library "locked bundle" display. Scans
 * upsells across every offer via a collection-group query, then filters to
 * ones whose trigger offer this member actually paid for.
 */
export async function getInAppUpsellsForMember(
  saId: string,
  memberId: string,
): Promise<CourseOfferUpsell[]> {
  const db = getAdminDb();
  const paidSnap = await db
    .collectionGroup("purchases")
    .where("subAccountId", "==", saId)
    .where("memberId", "==", memberId)
    .where("status", "==", "paid")
    .get();
  const paidOfferIds = new Set(
    paidSnap.docs
      .map((d) => d.data().offerId as string | undefined)
      .filter((id): id is string => !!id),
  );
  if (paidOfferIds.size === 0) return [];

  const upsellsSnap = await db
    .collectionGroup("upsells")
    .where("type", "==", "inApp")
    .where("visibility", "==", "published")
    .get();
  return upsellsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<CourseOfferUpsell, "id">) }))
    .filter((u) => paidOfferIds.has(u.offerId));
}
