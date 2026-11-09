import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { couponDisplayStatus, normalizeCouponCode, validateCouponInput } from "@/lib/checkout/coupons";
import type { Coupon, CouponDisplayStatus, CouponRedemption } from "@/types/checkout";
import { CheckoutError, agencyIdFor, assertId } from "./common";

/**
 * Native Magnetix Coupons. Storage (server-only):
 *   coupons/{couponId}                    the coupon
 *   couponCodes/{subAccountId}__{CODE}    one doc per live code → uniqueness per workspace
 *   couponRedemptions/{orderId}           written once, when an order is PAID
 *
 * Redemption counts move only when a paid order is recorded, never when a
 * buyer types a code, so an abandoned or failed checkout never uses one up.
 */

const couponsCol = () => getAdminDb().collection("coupons");
const codesCol = () => getAdminDb().collection("couponCodes");
const redemptionsCol = () => getAdminDb().collection("couponRedemptions");
const codeKey = (subAccountId: string, code: string) => `${subAccountId}__${code}`;

function fromDoc(d: FirebaseFirestore.DocumentSnapshot): Coupon {
  return { id: d.id, ...(d.data() as Omit<Coupon, "id">) };
}

export async function getCouponForWorkspace(subAccountId: string, couponId: string): Promise<Coupon> {
  assertId(couponId, "coupon");
  const snap = await couponsCol().doc(couponId).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new CheckoutError("Coupon not found.", 404);
  return fromDoc(snap);
}

/** Look a code up for checkout. Archived coupons never match. */
export async function findCouponByCode(subAccountId: string, rawCode: unknown): Promise<Coupon | null> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return null;
  const key = await codesCol().doc(codeKey(subAccountId, code)).get();
  const couponId = key.data()?.couponId as string | undefined;
  if (!couponId) return null;
  const snap = await couponsCol().doc(couponId).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  const c = fromDoc(snap);
  return c.status === "archived" ? null : c;
}

export interface CouponListItem extends Coupon {
  displayStatus: CouponDisplayStatus;
}

export interface CouponStats {
  activeCount: number;
  redemptionsThisMonth: number;
  discountThisMonthCents: Record<string, number>;
  revenueThisMonthCents: Record<string, number>;
  expiringSoonCount: number;
}

export async function listCoupons(subAccountId: string): Promise<{ coupons: CouponListItem[]; stats: CouponStats }> {
  const now = Date.now();
  const [snap, monthSnap] = await Promise.all([
    couponsCol().where("subAccountId", "==", subAccountId).get(),
    redemptionsCol().where("subAccountId", "==", subAccountId).get(),
  ]);
  const coupons = snap.docs
    .map(fromDoc)
    .map((c) => ({ ...c, displayStatus: couponDisplayStatus(c, now) }))
    .sort((a, b) => b.createdAt - a.createdAt);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const stats: CouponStats = {
    activeCount: coupons.filter((c) => c.displayStatus === "active").length,
    redemptionsThisMonth: 0,
    discountThisMonthCents: {},
    revenueThisMonthCents: {},
    expiringSoonCount: coupons.filter((c) => c.displayStatus === "active" && c.expiresAt && c.expiresAt - now <= 7 * 86_400_000).length,
  };
  for (const d of monthSnap.docs) {
    const r = d.data() as CouponRedemption;
    if (r.redeemedAt < monthStart.getTime()) continue;
    stats.redemptionsThisMonth += 1;
    stats.discountThisMonthCents[r.currency] = (stats.discountThisMonthCents[r.currency] ?? 0) + r.discountCents;
    stats.revenueThisMonthCents[r.currency] = (stats.revenueThisMonthCents[r.currency] ?? 0) + r.orderTotalCents;
  }
  return { coupons, stats };
}

async function assertOffersInWorkspace(subAccountId: string, offerIds: string[], repeating = false) {
  const refs = offerIds.map((id) => getAdminDb().doc(`subAccounts/${subAccountId}/courseOffers/${id}`));
  if (!refs.length) return;
  const snaps = await getAdminDb().getAll(...refs);
  if (snaps.some((s) => !s.exists)) throw new CheckoutError("Choose Offers from this workspace.", 400, { appliesTo: "One of the selected Offers isn't in this workspace." });
  // "First N payments" is month-based in Stripe: refuse it when no selected
  // Offer is a monthly plan (it could never apply).
  if (repeating && !snaps.some((s) => s.data()?.type === "recurring" && (s.data()?.recurringInterval ?? "month") === "month")) {
    const msg = "None of the selected Offers is a monthly plan. Choose \"The first payment\" or \"Every payment\".";
    throw new CheckoutError(msg, 400, { recurringDuration: msg });
  }
}

export async function createCoupon(input: { subAccountId: string; uid: string; body: Record<string, unknown> }): Promise<Coupon> {
  const v = validateCouponInput(input.body);
  if (!v.ok) throw new CheckoutError("Fix the highlighted fields.", 400, v.errors);
  if (v.value.appliesTo.kind === "offers") await assertOffersInWorkspace(input.subAccountId, v.value.appliesTo.offerIds, v.value.recurringDuration.kind === "repeating");
  const agencyId = await agencyIdFor(input.subAccountId);
  const db = getAdminDb();
  const ref = couponsCol().doc();
  const now = Date.now();
  const coupon: Omit<Coupon, "id"> = {
    ...v.value,
    status: v.value.status === "archived" ? "active" : v.value.status,
    agencyId,
    subAccountId: input.subAccountId,
    redemptionCount: 0,
    discountGivenCents: 0,
    revenueCents: 0,
    createdByUid: input.uid,
    createdAt: now,
    updatedAt: now,
  };
  await db.runTransaction(async (tx) => {
    const keyRef = codesCol().doc(codeKey(input.subAccountId, coupon.code));
    if ((await tx.get(keyRef)).exists) throw new CheckoutError("That code is already used in this workspace.", 409, { code: "That code is already used in this workspace." });
    tx.create(keyRef, { couponId: ref.id, subAccountId: input.subAccountId, code: coupon.code });
    tx.create(ref, coupon);
  });
  return { id: ref.id, ...coupon };
}

/**
 * Edit a coupon. Once a coupon has been redeemed its discount terms are
 * locked (code, type, amount, currency, recurring duration) so past
 * receipts and reports keep meaning what they said; limits, dates,
 * applicability and status stay editable.
 */
export async function updateCoupon(input: { subAccountId: string; couponId: string; body: Record<string, unknown> }): Promise<Coupon> {
  const current = await getCouponForWorkspace(input.subAccountId, input.couponId);
  const merged = { ...current, ...input.body };
  const v = validateCouponInput(merged);
  if (!v.ok) throw new CheckoutError("Fix the highlighted fields.", 400, v.errors);
  const next = v.value;
  if (current.redemptionCount > 0) {
    const locked =
      next.code !== current.code ||
      next.discountType !== current.discountType ||
      next.percentOff !== current.percentOff ||
      next.amountOffCents !== current.amountOffCents ||
      next.currency !== current.currency ||
      JSON.stringify(next.recurringDuration) !== JSON.stringify(current.recurringDuration);
    if (locked) throw new CheckoutError("This coupon has been used, so its code and discount can't change. Create a new coupon instead.", 409);
  }
  if (next.maxRedemptions !== null && next.maxRedemptions < current.redemptionCount)
    throw new CheckoutError("The usage limit can't be lower than the times it's already been used.", 400, { maxRedemptions: `Already used ${current.redemptionCount} times.` });
  if (next.appliesTo.kind === "offers") await assertOffersInWorkspace(input.subAccountId, next.appliesTo.offerIds, next.recurringDuration.kind === "repeating");
  const db = getAdminDb();
  const patch = { ...next, updatedAt: Date.now() };
  await db.runTransaction(async (tx) => {
    if (next.code !== current.code) {
      const newKey = codesCol().doc(codeKey(input.subAccountId, next.code));
      if ((await tx.get(newKey)).exists) throw new CheckoutError("That code is already used in this workspace.", 409, { code: "That code is already used in this workspace." });
      tx.create(newKey, { couponId: current.id, subAccountId: input.subAccountId, code: next.code });
      tx.delete(codesCol().doc(codeKey(input.subAccountId, current.code)));
    }
    tx.update(couponsCol().doc(current.id), patch);
  });
  return { ...current, ...patch };
}

/**
 * Delete when never used; otherwise archive (keeps redemption history and
 * releases the code so it can be reused by a new coupon).
 */
export async function removeCoupon(subAccountId: string, couponId: string): Promise<{ archived: boolean }> {
  const c = await getCouponForWorkspace(subAccountId, couponId);
  const db = getAdminDb();
  const batch = db.batch();
  batch.delete(codesCol().doc(codeKey(subAccountId, c.code)));
  if (c.redemptionCount > 0) batch.update(couponsCol().doc(c.id), { status: "archived", updatedAt: Date.now() });
  else batch.delete(couponsCol().doc(c.id));
  await batch.commit();
  return { archived: c.redemptionCount > 0 };
}

/** Paid orders this buyer already redeemed this coupon on. */
export async function customerRedemptionCount(couponId: string, memberId: string): Promise<number> {
  const snap = await redemptionsCol().where("couponId", "==", couponId).where("memberId", "==", memberId).count().get();
  return snap.data().count;
}

/**
 * Record a redemption for a PAID order. Idempotent: the redemption doc id is
 * the order id, so a webhook retry or a second completion call is a no-op.
 */
export async function recordCouponRedemption(input: Omit<CouponRedemption, "id" | "redeemedAt">): Promise<boolean> {
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    const ref = redemptionsCol().doc(input.orderId);
    if ((await tx.get(ref)).exists) return false;
    const couponRef = couponsCol().doc(input.couponId);
    const coupon = await tx.get(couponRef);
    tx.create(ref, { ...input, redeemedAt: Date.now() });
    if (coupon.exists) {
      tx.update(couponRef, {
        redemptionCount: (coupon.data()?.redemptionCount ?? 0) + 1,
        discountGivenCents: (coupon.data()?.discountGivenCents ?? 0) + input.discountCents,
        revenueCents: (coupon.data()?.revenueCents ?? 0) + input.orderTotalCents,
        updatedAt: Date.now(),
      });
    }
    return true;
  });
}
