/**
 * Checkout Foundation Phase 3 — Page Builder Checkout / Order Form block,
 * deterministic checks (no network, no Firestore, no Stripe): presentation
 * rules (presets, business-config-wins, required disclosures), the block's
 * props never carrying commerce data, and server-rendered markup of the
 * block + shared renderer in builder, preview and published contexts,
 * one-step and two-step.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-checkout-block.tsx
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeOrderTotals, lineFromOffer } from "../src/lib/checkout/pricing";
import { DEFAULT_CHECKOUT_DISPLAY } from "../src/lib/checkout/config";
import { applyPreset, DEFAULT_CHECKOUT_PRESENTATION, effectiveShow, normalizePresentation, type CheckoutPresentation } from "../src/lib/checkout/presentation";
import { normalizeCrm, abandonmentDecision, addTags, removeTags, cleanTags } from "../src/lib/checkout/crm";
import { AUTO_CHECKOUT_KEY, checkoutSettingsHref, collectCheckoutKeys, normalizeCheckoutBlock, type CheckoutBlockPayload } from "../src/lib/pages-funnels/checkout-block";
import { CheckoutRenderer } from "../src/components/checkout/checkout-renderer";
import { CheckoutBlockView } from "../src/components/pages-funnels/puck/checkout-block";
import { KNOWN_PUCK_BLOCK_TYPES } from "../src/lib/pages-funnels/puck/known-blocks";
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
const trial = offer("Trial Plan", { type: "recurring", priceCents: 9700, recurringInterval: "month", trialDays: 7 });

function view(o: Partial<CheckoutView> = {}): CheckoutView {
  return {
    configId: "step_x",
    subAccountId: "sa",
    brand: { name: "Seller Co", logoUrl: null, primary: null },
    format: "one_step",
    nameFormat: "full",
    phone: "hidden",
    billingAddress: "auto",
    agreement: { mode: "custom", customText: "I agree to the TEST terms.", linkUrl: "" },
    couponsEnabled: true,
    display: { ...DEFAULT_CHECKOUT_DISPLAY, guaranteeEnabled: true, guaranteeTitle: "TEST 30-day guarantee", guaranteeText: "Full refund." },
    primary: { offerId: "p", title: "Trial Plan", description: "Everything you need.", thumbnailUrl: "https://example.com/plan.png", priceLabel: "$97 / month", billingNote: "Renews every month", entitlements: ["Course: Core"] },
    bumps: [{ bumpId: "b1", offerId: "w", headline: "The Workbook", description: "Printable pages.", imageUrl: "https://example.com/wb.png", badge: "Popular", checkboxLabel: "Yes, add it", priceLabel: "$27" }],
    initialTotals: computeOrderTotals([lineFromOffer(trial, "primary")]),
    payment: { ready: true, mode: "test", message: null, publishableKey: "pk_test_x", stripeAccount: null },
    preview: true,
    crm: { marketingOptIn: { label: "TEST email me offers." }, captureOnStart: true },
    ...o,
  };
}
const pres = (o: Partial<CheckoutPresentation> = {}, show: Partial<CheckoutPresentation["show"]> = {}) => {
  const p = normalizePresentation(o);
  return { ...p, ...o, show: { ...p.show, ...show } } as CheckoutPresentation;
};
const renderR = (v: CheckoutView, p?: CheckoutPresentation, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(CheckoutRenderer, { view: v, presentation: p, mode: "builder", embedded: true, ...extra }));

/* ------------------------------ pure rules ------------------------------ */
console.log("\nBlock props + presentation rules");
check("1. CheckoutBlock is a registered, known block type", () => assert.ok((KNOWN_PUCK_BLOCK_TYPES as readonly string[]).includes("CheckoutBlock")));
check("8/9. block props keep ONLY the connection + presentation (injected price / Offer / bumps dropped)", () => {
  const p = normalizeCheckoutBlock({ checkoutConfigId: "step_abc", presentation: { preset: "minimal" }, priceCents: 1, primaryOfferId: "evil", bumps: ["x"], couponCode: "FREE" });
  assert.deepEqual(Object.keys(p).sort(), ["checkoutConfigId", "presentation"]);
  assert.equal(p.checkoutConfigId, "step_abc");
});
check("hosted Offer configs and malformed ids are never a block connection", () => {
  assert.equal(normalizeCheckoutBlock({ checkoutConfigId: "hosted_plan" }).checkoutConfigId, "");
  assert.equal(normalizeCheckoutBlock({ checkoutConfigId: "../x" }).checkoutConfigId, "");
});
check("collects resolution keys (connected id or auto) from nested trees", () => {
  const data = { content: [{ type: "Section", props: { rows: [{ type: "Row", props: { columns: [{ type: "Column", props: { content: [{ type: "CheckoutBlock", props: { checkoutConfigId: "" } }, { type: "CheckoutBlock", props: { checkoutConfigId: "step_a" } }] } }] } }] } }] };
  assert.deepEqual(collectCheckoutKeys(data).sort(), [AUTO_CHECKOUT_KEY, "step_a"].sort());
});
check("7. Edit Checkout Settings routes to the connected step's settings", () => {
  assert.equal(checkoutSettingsHref("sa1", { funnelId: "f1", stepId: "s1" }), "/sa/sa1/pages-funnels/funnels/f1/steps/s1");
});
check("11/12. Full and Minimal presets; switching back is reversible and keeps text", () => {
  const withText = { ...DEFAULT_CHECKOUT_PRESENTATION, text: { ...DEFAULT_CHECKOUT_PRESENTATION.text, heading: "Join today" } };
  const min = applyPreset(withText, "minimal");
  assert.equal(min.show.offerImage, false);
  assert.equal(min.show.orderSummary, false);
  assert.equal(min.layout, "single_column");
  assert.equal(min.text.heading, "Join today");
  const full = applyPreset(min, "full");
  assert.deepEqual(full.show, DEFAULT_CHECKOUT_PRESENTATION.show);
  assert.equal(full.text.heading, "Join today");
});
check("BUSINESS CONFIG WINS: the block can't show a coupon field or bumps the checkout doesn't offer", () => {
  const s = effectiveShow(DEFAULT_CHECKOUT_PRESENTATION, view({ couponsEnabled: false, bumps: [] }));
  assert.equal(s.couponField, false);
  assert.equal(s.bumps, false);
  const g = effectiveShow(DEFAULT_CHECKOUT_PRESENTATION, view({ display: { ...DEFAULT_CHECKOUT_DISPLAY, guaranteeEnabled: false } }));
  assert.equal(g.guarantee, false);
});
check("the opt-in box is decided by Checkout Settings, not the block", () => {
  assert.equal(effectiveShow(DEFAULT_CHECKOUT_PRESENTATION, view({ crm: { marketingOptIn: null, captureOnStart: true } })).marketingOptIn, false);
  assert.equal(effectiveShow(applyPreset(DEFAULT_CHECKOUT_PRESENTATION, "minimal"), view()).marketingOptIn, true);
});
check("CRM settings normalise (tags capped/trimmed/de-duplicated; abandonment forces capture)", () => {
  const c = normalizeCrm({ captureContactOnStart: false, abandoned: { enabled: true, delayMinutes: 7 }, startedTags: [" a ", "A", "", 3, "b"] });
  assert.equal(c.captureContactOnStart, true);
  assert.equal(c.abandoned.delayMinutes, 60);
  assert.deepEqual(c.startedTags, ["a", "b"]);
  assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 10);
  assert.deepEqual(addTags(["x"], ["X", "y"]), ["x", "y"]);
  assert.equal(removeTags(["x"], ["z"]), null);
});
check("abandonment definition: started + identity + not completed + delay elapsed + not superseded", () => {
  const crm = normalizeCrm({ abandoned: { enabled: true, delayMinutes: 30 } });
  const s = { status: "started" as const, email: "a@b.co", lastActivityAt: 0, abandonment: { scheduledFor: null, messageId: null, firedAt: null } };
  assert.equal(abandonmentDecision(s, crm, 29 * 60_000).action, "wait");
  assert.equal(abandonmentDecision(s, crm, 30 * 60_000).action, "fire");
  assert.equal(abandonmentDecision({ ...s, status: "completed" }, crm, 1e12).action, "skip");
  assert.equal(abandonmentDecision({ ...s, status: "superseded" }, crm, 1e12).action, "skip");
  assert.equal(abandonmentDecision({ ...s, email: "" }, crm, 1e12).action, "skip");
  assert.equal(abandonmentDecision({ ...s, abandonment: { ...s.abandonment, firedAt: 1 } }, crm, 1e12).action, "skip");
  assert.equal(abandonmentDecision(s, normalizeCrm({}), 1e12).action, "skip");
});

/* --------------------------- one-step rendering -------------------------- */
console.log("\nOne-step presentation (builder canvas)");
const full = renderR(view(), DEFAULT_CHECKOUT_PRESENTATION);
const minimal = renderR(view(), applyPreset(DEFAULT_CHECKOUT_PRESENTATION, "minimal"));
check("10/11. one-step renders in the editor with the Full preset (image, benefits, full summary, guarantee, trust)", () => {
  assert.match(full, /data-checkout-preset="full"/);
  assert.match(full, /plan\.png/);
  assert.match(full, /Course: Core/);
  assert.match(full, /data-summary-style="full"/);
  assert.match(full, /TEST 30-day guarantee/);
  assert.match(full, /Secure, encrypted payment/);
});
check("12. Minimal hides optional pieces…", () => {
  assert.match(minimal, /data-checkout-preset="minimal"/);
  assert.doesNotMatch(minimal, /plan\.png/);
  assert.doesNotMatch(minimal, /Course: Core/);
  assert.doesNotMatch(minimal, /TEST 30-day guarantee/);
  assert.match(minimal, /data-summary-style="concise"/);
  assert.match(minimal, /data-checkout-layout="stacked"/);
});
check("…but NEVER the required disclosures (price, trial terms, due today, agreement, CTA, payment area)", () => {
  for (const re of [/Trial Plan/, /\$97/, /7-day free trial/, /Due today/, /I agree to the TEST terms\./, /Start my 7-day free trial/, /data-checkout-payment="placeholder"/]) assert.match(minimal, re);
});
check("13. Order Summary visibility toggle → concise summary", () => assert.match(renderR(view(), pres({}, { orderSummary: false })), /data-summary-style="concise"/));
check("14. Offer image visibility", () => assert.doesNotMatch(renderR(view(), pres({}, { offerImage: false })), /plan\.png/));
check("15. benefits visibility", () => assert.doesNotMatch(renderR(view(), pres({}, { benefits: false })), /Course: Core/));
check("16. trust area visibility", () => {
  const html = renderR(view(), pres({}, { trust: false, guarantee: false }));
  assert.doesNotMatch(html, /Secure, encrypted payment/);
  assert.doesNotMatch(html, /TEST 30-day guarantee/);
});
check("17. Order Bump appearance (style, image, description)", () => {
  const html = renderR(view(), pres({ bumpStyle: "highlight", showBumpImages: false, showBumpDescriptions: false }));
  assert.match(html, /data-bump-style="highlight"/);
  assert.doesNotMatch(html, /wb\.png/);
  assert.doesNotMatch(html, /Printable pages\./);
  assert.match(html, /\$27/, "bump price always shows");
});
check("18. button styling (fit-to-text, left) + label override keeps the amount wording", () => {
  const html = renderR(view(), pres({ buttonWidth: "auto", buttonAlign: "left", text: { ...DEFAULT_CHECKOUT_PRESENTATION.text, submitLabel: "Join now" } }));
  assert.match(html, /justify-start/);
  assert.match(html, /Join now/);
  assert.doesNotMatch(html, /type="submit"[^>]*w-full/);
});
check("19. responsive: single column stacks; two-column on desktop keeps both columns", () => {
  assert.match(renderR(view(), pres({ layout: "single_column" })), /data-checkout-layout="stacked"/);
  assert.match(renderR(view(), pres({ layout: "two_column" })), /data-checkout-layout="columns"/);
  assert.match(renderR(view(), pres(), { device: "mobile" }), /data-checkout-layout="stacked"/);
});
check("coupon field: hidden by toggle, never shown when the checkout doesn't accept codes", () => {
  assert.doesNotMatch(renderR(view(), pres({}, { couponField: false })), /Discount code/);
  assert.doesNotMatch(renderR(view({ couponsEnabled: false }), pres()), /Discount code/);
  assert.match(renderR(view(), pres()), /Discount code/);
});
check("42/41. marketing opt-in: shown UNCHECKED when Checkout Settings enable it; absent otherwise", () => {
  assert.match(full, /data-checkout-optin=""/);
  assert.match(full, /TEST email me offers\./);
  assert.doesNotMatch(full, /id="co-marketing"[^>]*data-checked/);
  assert.doesNotMatch(renderR(view({ crm: { marketingOptIn: null, captureOnStart: true } }), pres()), /data-checkout-optin/);
});
check("58. NO PAYMENT FROM EDITOR: placeholder only, no Stripe field, purchase button disabled", () => {
  assert.match(full, /data-checkout-payment="placeholder"/);
  assert.match(full, /Payments can(&#x27;|')t be taken in the editor/);
  assert.doesNotMatch(full, /__privateStripe|StripeElement/i);
  assert.match(full, /<button type="submit" disabled=""/);
});

/* --------------------------- two-step rendering -------------------------- */
console.log("\nTwo-step presentation");
const two = view({ format: "two_step" });
const twoPres = pres({ text: { ...DEFAULT_CHECKOUT_PRESENTATION.text, step1Title: "About you", step2Title: "Pay & finish", continueLabel: "Next: payment" } });
const s1 = renderR(two, twoPres, { forcedStep: 1 });
const s2 = renderR(two, twoPres, { forcedStep: 2 });
check("20. Step 1 editor preview (details, custom title + Continue label, no payment yet)", () => {
  assert.match(s1, /About you/);
  assert.match(s1, /Next: payment/);
  assert.doesNotMatch(s1, /data-checkout-payment/);
});
check("21. Step 2 editor preview (payment area, bumps, agreement, custom title)", () => {
  assert.match(s2, /Pay &amp; finish/);
  assert.match(s2, /data-checkout-payment="placeholder"/);
  assert.match(s2, /The Workbook/);
  assert.match(s2, /I agree to the TEST terms\./);
});
check("23. progress indicator visibility", () => {
  assert.match(s1, /aria-label="Checkout progress"/);
  assert.doesNotMatch(renderR(two, pres({}, { progress: false }), { forcedStep: 1 }), /Checkout progress/);
  assert.doesNotMatch(full, /Checkout progress/, "never on one-step");
});
check("24/25. Step titles + Continue label persist through normalisation", () => {
  const stored = JSON.parse(JSON.stringify(twoPres));
  const p = normalizePresentation(stored);
  assert.equal(p.text.step1Title, "About you");
  assert.equal(p.text.continueLabel, "Next: payment");
});
check("26. Order Summary per-step visibility", () => {
  assert.match(s1, /aria-label="Your order"/);
  assert.doesNotMatch(renderR(two, pres({}, { summaryOnStep1: false }), { forcedStep: 1 }), /aria-label="Your order"/);
  assert.match(renderR(two, pres({}, { summaryOnStep1: false }), { forcedStep: 2 }), /Due today/);
});
check("27. mobile two-step stacks", () => assert.match(renderR(two, twoPres, { forcedStep: 2, device: "mobile" }), /data-checkout-layout="stacked"/));

/* ------------------------------- block view ------------------------------ */
console.log("\nBlock contexts");
const payload: CheckoutBlockPayload = {
  connection: { configId: "step_x", funnelId: "f1", funnelName: "TEST Funnel", funnelStatus: "published", stepId: "s1", stepName: "Checkout", linkedToPage: true, primaryOfferTitle: "Trial Plan" },
  view: view({ format: "two_step" }),
  problem: null,
};
const block = (context: "builder" | "preview" | "published", p: CheckoutBlockPayload | null, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(CheckoutBlockView, { id: "blk", props, context, resolution: { status: "done", payload: p }, subAccountId: "sa" }));
check("4/5/6. builder shows the connection, primary Offer and Edit Checkout Settings", () => {
  const html = block("builder", payload);
  assert.match(html, /Connected to: <strong>Checkout — TEST Funnel<\/strong>/);
  assert.match(html, /Trial Plan/);
  assert.match(html, /href="\/sa\/sa\/pages-funnels\/funnels\/f1\/steps\/s1"/);
});
check("22. builder preview step is display-only state (no form, no network) — label follows the panel switcher", () => {
  const html = block("builder", payload);
  assert.match(html, /data-checkout-preview-step="1"/);
  assert.match(html, /Previewing Step 1/);
});
check("unconnected: builder explains how to connect; visitors see nothing", () => {
  assert.match(block("builder", null), /Connect a Checkout Step/);
  assert.equal(block("published", null), "");
});
check("a step that can't render yet: editor notice, visitors see nothing", () => {
  const broken = { ...payload, view: null, problem: "Choose a primary Offer for this checkout first." };
  assert.match(block("builder", broken), /Choose a primary Offer/);
  assert.equal(block("published", broken), "");
});
check("28. published block renders the SAME Phase 2 renderer (tenant surface, summary, CTA) without builder chrome", () => {
  const pub = { ...payload, view: view({ preview: false, format: "one_step" }) };
  const html = block("published", pub);
  assert.match(html, /data-public-shell="checkout-block"/);
  assert.match(html, /tenant-surface/);
  assert.match(html, /id="co-summary-title"/);
  assert.doesNotMatch(html, /data-checkout-builder-bar/);
  assert.doesNotMatch(html, /Edit Checkout Settings/);
  assert.match(html, /Test mode — no real money/);
});
check("29. pricing comes from the server view, not block props (injected price ignored)", () => {
  const pub = { ...payload, view: view({ preview: false, format: "one_step" }) };
  const html = block("published", pub, { priceCents: 1, presentation: { text: { submitLabel: "" } } });
  assert.match(html, /\$97/);
  assert.doesNotMatch(html, /\$0\.01/);
});
check("draft funnel: editor warns, preview stays non-payable", () => {
  const draft = { ...payload, connection: { ...payload.connection, funnelStatus: "draft" } };
  assert.match(block("builder", draft), /is a draft/);
  assert.match(block("preview", { ...draft, view: view({ format: "one_step" }) }), /data-checkout-payment="placeholder"/);
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
