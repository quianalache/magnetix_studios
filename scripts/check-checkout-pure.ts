/**
 * Checkout Foundation Phase 1 — PURE checks (no Firestore, no network):
 * order pricing, coupon discount allocation, coupon rules, Order Bump
 * eligibility and checkout-settings sanitising.
 *
 * Run: pnpm exec tsx scripts/check-checkout-pure.ts
 */
import assert from "node:assert/strict";
import { allocateDiscounts, computeOrderTotals, lineFromOffer, recurringTermsText, type PricingCoupon } from "../src/lib/checkout/pricing";
import { checkCouponForOrder, couponDisplayStatus, normalizeCouponCode, validateCouponInput } from "../src/lib/checkout/coupons";
import { bumpOfferProblem, defaultCheckoutFields, liveBumps, primaryOfferProblem, sanitizeCheckoutInput, validateBumps } from "../src/lib/checkout/config";
import type { Coupon } from "../src/types/checkout";

let passes = 0;
let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${label}\n       ${(err as Error).message}`);
  }
}

const SA = "sa1";
const offer = (id: string, o: Partial<Record<string, unknown>> = {}) =>
  ({ id, subAccountId: SA, title: id, type: "oneTime", priceCents: 2700, currency: "USD", recurringInterval: null, trialDays: null, visibility: "published", ...o }) as never;
const monthly = offer("plan", { type: "recurring", priceCents: 9700, recurringInterval: "month" });
const trial = offer("trialPlan", { type: "recurring", priceCents: 9700, recurringInterval: "month", trialDays: 7 });
const yearly = offer("yearPlan", { type: "recurring", priceCents: 99000, recurringInterval: "year" });
const course = offer("course", { priceCents: 49700 });
const workbook = offer("workbook", { priceCents: 2700 });
const templates = offer("templates", { priceCents: 9700 });

const pct = (p: number, o: Partial<PricingCoupon> = {}): PricingCoupon => ({ discountType: "percent", percentOff: p, amountOffCents: null, includeOrderBumps: true, recurringDuration: { kind: "once" }, ...o });
const fixed = (c: number, o: Partial<PricingCoupon> = {}): PricingCoupon => ({ discountType: "fixed", percentOff: null, amountOffCents: c, includeOrderBumps: true, recurringDuration: { kind: "once" }, ...o });

const coupon = (o: Partial<Coupon> = {}): Coupon => ({
  id: "c1", agencyId: "ag", subAccountId: SA, code: "SAVE25", name: "", status: "active", discountType: "percent", percentOff: 25,
  amountOffCents: null, currency: null, startsAt: null, expiresAt: null, maxRedemptions: null, maxPerCustomer: null,
  minimumSubtotalCents: null, appliesTo: { kind: "all" }, includeOrderBumps: true, recurringDuration: { kind: "once" },
  redemptionCount: 0, discountGivenCents: 0, revenueCents: 0, createdByUid: "u", createdAt: 0, updatedAt: 0, ...o,
});

console.log("\nPricing");
check("one-time primary: due today = price", () => {
  const t = computeOrderTotals([lineFromOffer(course, "primary")]);
  assert.equal(t.dueTodayCents, 49700);
  assert.equal(t.recurring, null);
});
check("recurring primary without trial: charged today", () => {
  const t = computeOrderTotals([lineFromOffer(monthly, "primary")]);
  assert.equal(t.dueTodayCents, 9700);
  assert.equal(t.recurring?.interval, "month");
});
check("recurring primary + one-time bump: both today", () => {
  const t = computeOrderTotals([lineFromOffer(monthly, "primary"), lineFromOffer(workbook, "bump", "b1")]);
  assert.equal(t.dueTodayCents, 9700 + 2700);
});
check("trial primary + one-time bump: only the bump today", () => {
  const t = computeOrderTotals([lineFromOffer(trial, "primary"), lineFromOffer(workbook, "bump", "b1")]);
  assert.equal(t.dueTodayCents, 2700);
  assert.equal(t.recurring?.trialDays, 7);
  assert.match(recurringTermsText(t) ?? "", /7-day free trial, then \$97\.00\/month/);
});
check("multiple one-time bumps add up", () => {
  const t = computeOrderTotals([lineFromOffer(course, "primary"), lineFromOffer(workbook, "bump", "b1"), lineFromOffer(templates, "bump", "b2")]);
  assert.equal(t.dueTodayCents, 49700 + 2700 + 9700);
  assert.equal(t.lines.length, 3);
});
check("mixed currencies are refused", () => {
  assert.throws(() => computeOrderTotals([lineFromOffer(course, "primary"), lineFromOffer(offer("eur", { currency: "EUR" }), "bump", "b")]));
});
check("free primary prices at zero", () => {
  const t = computeOrderTotals([lineFromOffer(offer("free", { type: "free", priceCents: null }), "primary")]);
  assert.equal(t.dueTodayCents, 0);
});

console.log("\nDiscounts");
check("30. percent coupon discounts the whole eligible order (primary + bumps)", () => {
  const t = computeOrderTotals([lineFromOffer(course, "primary"), lineFromOffer(workbook, "bump", "b1")], pct(10));
  assert.equal(t.lines[0].discountCents, 4970);
  assert.equal(t.lines[1].discountCents, 270);
  assert.equal(t.dueTodayCents, 49700 + 2700 - 5240);
});
check("27. coupon excluding bumps leaves bumps full price", () => {
  const t = computeOrderTotals([lineFromOffer(course, "primary"), lineFromOffer(workbook, "bump", "b1")], pct(10, { includeOrderBumps: false }));
  assert.equal(t.lines[1].discountCents, 0);
});
check("fixed coupon is spread by price and adds up exactly", () => {
  const lines = [lineFromOffer(course, "primary"), lineFromOffer(workbook, "bump", "b1"), lineFromOffer(templates, "bump", "b2")];
  const d = allocateDiscounts(lines, fixed(1001));
  assert.equal(d.reduce((s, x) => s + x, 0), 1001);
  assert.ok(d[0] > d[2] && d[2] > d[1]);
});
check("49. fixed coupon larger than the order never goes negative", () => {
  const t = computeOrderTotals([lineFromOffer(workbook, "primary")], fixed(999999));
  assert.equal(t.dueTodayCents, 0);
  assert.equal(t.discountCents, 2700);
});
check("100% percent coupon → zero due, never negative", () => {
  const t = computeOrderTotals([lineFromOffer(course, "primary"), lineFromOffer(workbook, "bump", "b1")], pct(100));
  assert.equal(t.dueTodayCents, 0);
});
check("trial + coupon: discount shows on the recurring terms, bump discounted today", () => {
  const t = computeOrderTotals([lineFromOffer(trial, "primary"), lineFromOffer(workbook, "bump", "b1")], pct(50, { recurringDuration: { kind: "repeating", months: 3 } }));
  assert.equal(t.dueTodayCents, 1350);
  assert.equal(t.recurring?.discountedAmountCents, 4850);
  assert.equal(t.recurring?.discountedPayments, 3);
});

check("long trial: multi-payment coupon wording says 'about'", () => {
  const long = offer("longTrial", { type: "recurring", priceCents: 9700, recurringInterval: "month", trialDays: 30 });
  const t = computeOrderTotals([lineFromOffer(long, "primary")], pct(50, { recurringDuration: { kind: "repeating", months: 3 } }));
  assert.match(recurringTermsText(t) ?? "", /for about your first 3 payments/);
  const short = computeOrderTotals([lineFromOffer(trial, "primary")], pct(50, { recurringDuration: { kind: "repeating", months: 3 } }));
  assert.match(recurringTermsText(short) ?? "", /for your first 3 payments/);
});

console.log("\nCoupon input");
check("17. percentage coupon saves", () => {
  const r = validateCouponInput({ code: " save25 ", discountType: "percent", percentOff: 25 });
  assert.ok(r.ok && r.value.code === "SAVE25" && r.value.percentOff === 25);
});
check("18. fixed coupon saves with currency", () => {
  const r = validateCouponInput({ code: "VIP150", discountType: "fixed", amountOffCents: 15000, currency: "usd" });
  assert.ok(r.ok && r.value.amountOffCents === 15000 && r.value.currency === "USD");
});
check("19. invalid percentages rejected", () => {
  for (const p of [0, -5, 101, "abc", 12.345]) assert.equal(validateCouponInput({ code: "X12", discountType: "percent", percentOff: p }).ok, false);
});
check("fixed coupon without currency rejected", () => {
  assert.equal(validateCouponInput({ code: "X12", discountType: "fixed", amountOffCents: 100 }).ok, false);
});
check("expiration before start rejected", () => {
  assert.equal(validateCouponInput({ code: "X12", percentOff: 5, startsAt: 2000, expiresAt: 1000 }).ok, false);
});
check("bad codes rejected, good codes normalized", () => {
  assert.equal(normalizeCouponCode("ab"), null);
  assert.equal(normalizeCouponCode("SAVE 20%"), null);
  assert.equal(normalizeCouponCode("save-20"), "SAVE-20");
});
check("selected-Offers coupon needs at least one Offer", () => {
  assert.equal(validateCouponInput({ code: "X12", percentOff: 5, appliesTo: { kind: "offers", offerIds: [] } }).ok, false);
});

console.log("\nCoupon redemption rules");
const order = [lineFromOffer(course, "primary"), lineFromOffer(workbook, "bump", "b1")];
const run = (c: Coupon | null, extra: Partial<{ now: number; customerRedemptions: number; lines: typeof order }> = {}) =>
  checkCouponForOrder({ coupon: c, subAccountId: SA, now: extra.now ?? 5000, lines: extra.lines ?? order, customerRedemptions: extra.customerRedemptions ?? 0 });
check("active coupon accepted", () => assert.equal(run(coupon()).ok, true));
check("21. expiration enforced", () => assert.deepEqual(run(coupon({ expiresAt: 4000 })), { ok: false, reason: "expired" }));
check("22. start date enforced", () => assert.deepEqual(run(coupon({ startsAt: 6000 })), { ok: false, reason: "not_started" }));
check("23. total usage cap enforced", () => assert.deepEqual(run(coupon({ maxRedemptions: 3, redemptionCount: 3 })), { ok: false, reason: "used_up" }));
check("24. per-customer cap enforced", () => assert.deepEqual(run(coupon({ maxPerCustomer: 1 }), { customerRedemptions: 1 }), { ok: false, reason: "customer_limit" }));
check("25. minimum purchase enforced", () => {
  assert.deepEqual(run(coupon({ minimumSubtotalCents: 60000 })), { ok: false, reason: "minimum" });
  assert.equal(run(coupon({ minimumSubtotalCents: 52400 })).ok, true);
});
check("26. Offer eligibility enforced", () => {
  assert.deepEqual(run(coupon({ appliesTo: { kind: "offers", offerIds: ["other"] } })), { ok: false, reason: "offer" });
  assert.equal(run(coupon({ appliesTo: { kind: "offers", offerIds: ["course"] } })).ok, true);
});
check("other workspace's coupon is not found", () => assert.deepEqual(run(coupon({ subAccountId: "sa2" })), { ok: false, reason: "not_found" }));
check("inactive / archived refused", () => {
  assert.deepEqual(run(coupon({ status: "inactive" })), { ok: false, reason: "inactive" });
  assert.deepEqual(run(coupon({ status: "archived" })), { ok: false, reason: "not_found" });
});
check("fixed coupon currency must match", () => assert.deepEqual(run(coupon({ discountType: "fixed", percentOff: null, amountOffCents: 500, currency: "EUR" })), { ok: false, reason: "currency" }));
check("multi-payment coupon refused on a yearly plan", () =>
  assert.deepEqual(run(coupon({ recurringDuration: { kind: "repeating", months: 3 } }), { lines: [lineFromOffer(yearly, "primary")] }), { ok: false, reason: "interval" }));
check("display status derives scheduled/expired/used up", () => {
  assert.equal(couponDisplayStatus(coupon({ startsAt: 9000 }), 5000), "scheduled");
  assert.equal(couponDisplayStatus(coupon({ expiresAt: 1000 }), 5000), "expired");
  assert.equal(couponDisplayStatus(coupon({ maxRedemptions: 1, redemptionCount: 1 }), 5000), "used_up");
});

console.log("\nOrder Bumps");
const offers = new Map([course, workbook, templates, monthly, offer("draft", { visibility: "draft" }), offer("archived", { visibility: "archived" }), offer("other", { subAccountId: "sa2" }), offer("sys", { systemManaged: true })].map((o: { id: string }) => [o.id, o])) as never;
const bump = (id: string, offerId: string, o = {}) => ({ id, offerId, enabled: true, headline: "", description: "", imageUrl: "", badge: "", checkboxLabel: "", ...o });
check("8/9. one and several one-time bumps accepted", () => {
  assert.deepEqual(validateBumps([bump("a", "workbook")], [], offers, course, SA), {});
  assert.deepEqual(validateBumps([bump("a", "workbook"), bump("b", "templates")], [], offers, course, SA), {});
});
check("10. duplicate bump blocked", () => assert.ok(validateBumps([bump("a", "workbook"), bump("b", "workbook")], [], offers, course, SA)["bumps.1"]));
check("13. recurring Offer cannot be attached as a bump", () => assert.match(bumpOfferProblem(monthly, course, SA) ?? "", /one-time/));
check("primary cannot be its own bump", () => assert.ok(bumpOfferProblem(course, course, SA)));
check("cross-workspace bump refused", () => assert.ok(validateBumps([bump("a", "other")], [], offers, course, SA)["bumps.0"]));
check("14. newly attached draft/archived bump refused; existing one kept only when disabled", () => {
  assert.ok(validateBumps([bump("a", "archived")], [], offers, course, SA)["bumps.0"]);
  assert.deepEqual(validateBumps([bump("a", "archived", { enabled: false })], [bump("a", "archived")], offers, course, SA), {});
  assert.ok(validateBumps([bump("a", "archived")], [bump("a", "archived")], offers, course, SA)["bumps.0"]);
  assert.deepEqual(liveBumps([bump("a", "archived"), bump("b", "workbook")], offers, course, SA).map((b) => b.offerId), ["workbook"]);
});
check("system-managed Offers refused as primary and bump", () => {
  assert.ok(primaryOfferProblem(offer("sys", { systemManaged: true }), SA));
  assert.ok(bumpOfferProblem(offer("sys", { systemManaged: true }), course, SA));
});
check("5. cross-workspace primary refused", () => assert.ok(primaryOfferProblem(offer("x", { subAccountId: "sa2" }), SA)));

console.log("\nSettings sanitising");
check("6/7. one-step and two-step persist through sanitising", () => {
  const prev = defaultCheckoutFields(null, "funnel_step");
  assert.equal(sanitizeCheckoutInput({ format: "two_step" }, prev, "funnel_step", () => "n").value.format, "two_step");
  assert.equal(sanitizeCheckoutInput({ format: "one_step" }, prev, "funnel_step", () => "n").value.format, "one_step");
});
check("15. bump display overrides kept; existing bump ids kept, new ids minted server-side", () => {
  const prev = { ...defaultCheckoutFields(null, "funnel_step"), bumps: [bump("keep", "workbook")] };
  let n = 0;
  const v = sanitizeCheckoutInput({ bumps: [{ id: "keep", offerId: "workbook", headline: "Yes! Add the workbook", badge: "Popular" }, { id: "forged", offerId: "templates" }] }, prev, "funnel_step", () => `new${++n}`).value;
  assert.equal(v.bumps[0].id, "keep");
  assert.equal(v.bumps[0].headline, "Yes! Add the workbook");
  assert.equal(v.bumps[1].id, "new1");
});
check("11. bump order is the array order", () => {
  const prev = defaultCheckoutFields(null, "funnel_step");
  const v = sanitizeCheckoutInput({ bumps: [{ offerId: "templates" }, { offerId: "workbook" }] }, prev, "funnel_step", () => Math.random().toString(36).slice(2)).value;
  assert.deepEqual(v.bumps.map((b) => b.offerId), ["templates", "workbook"]);
});
check("hosted checkout cannot change its primary Offer", () => {
  const prev = defaultCheckoutFields("course", "hosted_offer");
  assert.equal(sanitizeCheckoutInput({ primaryOfferId: "other" }, prev, "hosted_offer", () => "n").value.primaryOfferId, "course");
});
check("unsafe URLs refused", () => {
  const prev = defaultCheckoutFields(null, "hosted_offer");
  assert.ok(sanitizeCheckoutInput({ postPurchase: { type: "url", url: "javascript:alert(1)" } }, prev, "hosted_offer", () => "n").errors.postPurchase);
  assert.ok(sanitizeCheckoutInput({ postPurchase: { type: "funnel_next_step" } }, prev, "hosted_offer", () => "n").errors.postPurchase);
});

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
