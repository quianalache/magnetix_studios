/**
 * Checkout Foundation Phase 2 — PUBLIC checkout, deterministic checks (no
 * network, no Firestore): buyer-facing wording (button labels, line billing,
 * due-today vs future schedule, trial dates, coupon effects, payment errors)
 * and server-rendered markup of the shared renderer in one-step and two-step.
 * Interactive states (ticking bumps, coupons, paying) are covered by the
 * browser e2e against the emulator + Stripe test mode.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-checkout-public.tsx
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeOrderTotals, lineFromOffer, type PricingCoupon } from "../src/lib/checkout/pricing";
import { chargeSchedule, ctaLabel, friendlyPaymentError, lineBillingLabel, needsPayment, subscriptionStartDate, whatHappensNext } from "../src/lib/checkout/display";
import { describeCouponEffect } from "../src/lib/checkout/coupons";
import { CheckoutRenderer } from "../src/components/checkout/checkout-renderer";
import { DEFAULT_CHECKOUT_DISPLAY } from "../src/lib/checkout/config";
import type { CheckoutView } from "../src/lib/checkout/view-types";

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

const offer = (id: string, o: Record<string, unknown> = {}) =>
  ({ id, subAccountId: "sa", title: id, type: "oneTime", priceCents: 2700, currency: "USD", recurringInterval: null, trialDays: null, ...o }) as never;
const monthly = offer("Plan", { type: "recurring", priceCents: 9700, recurringInterval: "month" });
const trial = offer("Trial Plan", { type: "recurring", priceCents: 9700, recurringInterval: "month", trialDays: 7 });
const workbook = offer("Workbook", { priceCents: 2700 });
const kit = offer("Kit", { priceCents: 4900 });
const free = offer("Free Guide", { type: "free", priceCents: null });
const pct = (p: number, o: Partial<PricingCoupon> = {}): PricingCoupon => ({ discountType: "percent", percentOff: p, amountOffCents: null, includeOrderBumps: true, recurringDuration: { kind: "once" }, ...o });
const NOW = new Date("2027-01-27T12:00:00Z");

console.log("\nBuyer wording");
check("27. recurring without trial: subscribe label, billed monthly, charged today", () => {
  const t = computeOrderTotals([lineFromOffer(monthly, "primary")]);
  assert.equal(ctaLabel("", t), "Subscribe — $97.00");
  assert.equal(lineBillingLabel(t.lines[0], "USD"), "Billed $97.00/month");
  assert.deepEqual(chargeSchedule(t, NOW), ["$97.00 today for Plan", "Then $97.00/month until you cancel"]);
});
check("28/33/34. recurring with trial: $0 today, start date and future amount", () => {
  const t = computeOrderTotals([lineFromOffer(trial, "primary")]);
  assert.equal(t.dueTodayCents, 0);
  assert.equal(ctaLabel("", t), "Start my 7-day free trial");
  assert.equal(subscriptionStartDate(7, NOW), "Feb 3, 2027");
  assert.deepEqual(chargeSchedule(t, NOW), ["$0.00 today for Trial Plan (free trial)", "From Feb 3, 2027: $97.00/month"]);
});
check("29. trial + one bump: bump due today, plan after the trial", () => {
  const t = computeOrderTotals([lineFromOffer(trial, "primary"), lineFromOffer(workbook, "bump", "b1")]);
  assert.equal(t.dueTodayCents, 2700);
  const s = chargeSchedule(t, NOW);
  assert.ok(s.includes("$27.00 today for Workbook"));
  assert.ok(s.includes("From Feb 3, 2027: $97.00/month"));
});
check("30. trial + multiple bumps", () => {
  const t = computeOrderTotals([lineFromOffer(trial, "primary"), lineFromOffer(workbook, "bump", "b1"), lineFromOffer(kit, "bump", "b2")]);
  assert.equal(t.dueTodayCents, 2700 + 4900);
  assert.equal(chargeSchedule(t, NOW).filter((r) => r.includes("today for")).length, 3);
});
check("31/32/35. coupon + trial + bump: discounted bump today, discounted plan for its duration", () => {
  const t = computeOrderTotals([lineFromOffer(trial, "primary"), lineFromOffer(workbook, "bump", "b1")], pct(10, { recurringDuration: { kind: "repeating", months: 3 } }));
  assert.equal(t.dueTodayCents, 2430);
  const s = chargeSchedule(t, NOW);
  assert.ok(s.includes("$24.30 today for Workbook"), s.join(" | "));
  assert.ok(s.some((r) => r === "From Feb 3, 2027: $87.30/month for your first 3 payments, then $97.00/month"), s.join(" | "));
  const next = whatHappensNext(t, NOW);
  assert.ok(next.includes("Your subscription begins on Feb 3, 2027 ($87.30/month)"), next.join(" | "));
});
check("coupon effect: whole order vs main offer only, and subscription duration", () => {
  const lines = [lineFromOffer(monthly, "primary"), lineFromOffer(workbook, "bump", "b1")];
  const all = describeCouponEffect(pct(25), computeOrderTotals(lines, pct(25)));
  assert.equal(all.label, "25% off");
  assert.match(all.scope, /whole order/);
  assert.match(all.recurringNote ?? "", /first subscription payment/);
  const mainOnly = describeCouponEffect(pct(25, { includeOrderBumps: false }), computeOrderTotals(lines, pct(25, { includeOrderBumps: false })));
  assert.match(mainOnly.scope, /add-ons stay full price/);
  const fixed = describeCouponEffect({ ...pct(0), discountType: "fixed", percentOff: null, amountOffCents: 1000 }, computeOrderTotals([lineFromOffer(workbook, "primary")]));
  assert.equal(fixed.label, "$10.00 off");
});
check("36/37/38. free Offer needs no payment; a paid bump does", () => {
  const t = computeOrderTotals([lineFromOffer(free, "primary")]);
  assert.equal(needsPayment(t), false);
  assert.equal(ctaLabel("", t), "Get access");
  const withBump = computeOrderTotals([lineFromOffer(free, "primary"), lineFromOffer(workbook, "bump", "b1")]);
  assert.equal(needsPayment(withBump), true);
  assert.equal(ctaLabel("", withBump), "Pay $27.00");
});
check("39. coupon never makes a negative total", () => {
  const t = computeOrderTotals([lineFromOffer(workbook, "primary")], { ...pct(0), discountType: "fixed", percentOff: null, amountOffCents: 999999 });
  assert.equal(t.dueTodayCents, 0);
});
check("configured button text wins", () => assert.equal(ctaLabel("Join now", computeOrderTotals([lineFromOffer(monthly, "primary")])), "Join now"));
check("43. payment errors are buyer-friendly (no raw provider text for non-card errors)", () => {
  assert.equal(friendlyPaymentError({ type: "card_error", code: "card_declined", message: "Your card was declined." }), "Your card was declined.");
  assert.match(friendlyPaymentError({ type: "api_error", message: "internal stripe thing req_123" }), /haven't been charged/);
  assert.match(friendlyPaymentError({ type: "invalid_request_error", code: "payment_intent_authentication_failure" }), /bank couldn't confirm/);
  assert.match(friendlyPaymentError(null), /haven't been charged/);
});

console.log("\nRendered markup (shared renderer)");
function view(o: Partial<CheckoutView> = {}): CheckoutView {
  return {
    configId: "step_x",
    subAccountId: "sa",
    brand: { name: "Seller Co", logoUrl: null, primary: null },
    format: "one_step",
    nameFormat: "full",
    phone: "hidden",
    billingAddress: "auto",
    agreement: { mode: "notRequired", customText: "", linkUrl: "" },
    couponsEnabled: true,
    display: { ...DEFAULT_CHECKOUT_DISPLAY },
    primary: { offerId: "p", title: "Trial Plan", description: "Everything you need.", thumbnailUrl: null, priceLabel: "$97 / month", billingNote: "Renews every month · 7-day free trial", entitlements: ["Course: Core"] },
    bumps: [
      { bumpId: "b1", offerId: "w", headline: "The Workbook", description: "Printable pages.", imageUrl: null, badge: "Popular", checkboxLabel: "Yes, add it", priceLabel: "$27" },
      { bumpId: "b2", offerId: "k", headline: "The Kit", description: "", imageUrl: null, badge: "", checkboxLabel: "Add the kit", priceLabel: "$49" },
    ],
    initialTotals: computeOrderTotals([lineFromOffer(trial, "primary")]),
    payment: { ready: false, mode: "test", message: "Card payments aren't configured on this site yet.", publishableKey: null, stripeAccount: null },
    preview: false,
    ...o,
  };
}
const render = (v: CheckoutView) => renderToStaticMarkup(h(CheckoutRenderer, { view: v }));
check("1/4/53/54. one-step renders header, offer intro, terms, summary and schedule", () => {
  const html = render(view());
  assert.match(html, /Secure checkout/);
  assert.match(html, /Seller Co/);
  assert.match(html, /Trial Plan/);
  assert.match(html, /7-day free trial/);
  assert.match(html, /Due today/);
  assert.match(html, /Includes a 7-day free trial/);
  assert.match(html, /Start my 7-day free trial|Card payments aren&#x27;t configured/);
});
check("2/3. only enabled buyer fields render", () => {
  assert.doesNotMatch(render(view({ phone: "hidden" })), /id="co-phone"/);
  const optional = render(view({ phone: "optional" }));
  assert.match(optional, /id="co-phone"/);
  assert.match(optional, /Phone<span class="text-muted-foreground font-normal"> \(optional\)/);
  const firstLast = render(view({ nameFormat: "first_last" }));
  assert.match(firstLast, /id="co-first"/);
  assert.doesNotMatch(firstLast, /id="co-name"/);
});
check("5. bumps render unselected (Optional add-on, unchecked) in configured order", () => {
  const html = render(view());
  assert.ok(html.indexOf("The Workbook") < html.indexOf("The Kit"));
  assert.equal((html.match(/data-bump-state="available"/g) ?? []).length, 2);
  assert.match(html, /Optional add-on/);
  assert.match(html, /Yes, add it: The Workbook/);
});
check("coupon field renders only when coupons are enabled", () => {
  assert.match(render(view()), /aria-label="Discount code"/);
  assert.doesNotMatch(render(view({ couponsEnabled: false })), /aria-label="Discount code"/);
});
check("15. agreement checkbox renders with its link when required", () => {
  const html = render(view({ agreement: { mode: "custom", customText: "I agree to the terms.", linkUrl: "https://example.com/terms" }, payment: { ready: false, mode: null, message: null, publishableKey: null, stripeAccount: null }, initialTotals: computeOrderTotals([lineFromOffer(free, "primary")]) }));
  assert.match(html, /I agree to the terms\./);
  assert.match(html, /https:\/\/example.com\/terms/);
});
check("36. free Offer shows no card form", () => {
  const html = render(view({ initialTotals: computeOrderTotals([lineFromOffer(free, "primary")]) }));
  assert.match(html, /Nothing to pay today — no card needed/);
  assert.match(html, /Get access/);
});
check("18. two-step step 1: progress, buyer info, Continue; no payment or bumps yet", () => {
  const html = render(view({ format: "two_step" }));
  assert.match(html, /aria-current="step"/);
  assert.match(html, /Step 1 of 2/);
  assert.match(html, /Continue to payment/);
  assert.doesNotMatch(html, /Payment details/);
  assert.doesNotMatch(html, /data-bump-state/);
});
check("billing address is never a Magnetix field", () => {
  const html = render(view());
  assert.doesNotMatch(html, /id="co-address"|name="address"|Billing address<\/label>/);
});
check("preview renders without taking payments", () => {
  const html = render(view({ preview: true }));
  assert.match(html, /Preview never takes payments/);
});

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
