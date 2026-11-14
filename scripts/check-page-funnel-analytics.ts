/**
 * Page & Funnel Analytics (2026-11) — recording rules, goal verification,
 * TEST exclusion, trial/free distinction, currencies, tenant isolation,
 * honest comparisons and the shared report builders, against the Firestore
 * EMULATOR only. No Stripe, no network, no production credentials.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8087},"ui":{"enabled":false}}}' > /tmp/emu-pfa/firebase.json
 *   firebase emulators:exec --config /tmp/emu-pfa/firebase.json --only firestore --project demo-page-funnel-analytics \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-page-funnel-analytics.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
for (const k of ["STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE", "RESEND_API_KEY", "QSTASH_TOKEN"]) delete process.env[k];
process.env.STRIPE_SECRET_KEY = "sk_test_local_only_not_a_key";
initializeApp({ projectId: PROJECT });

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err instanceof Error ? err.message.replace(/\n/g, " ") : String(err)}`);
  }
}

async function main() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { encodePuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const pages = await import("../src/lib/server/page-analytics-service");
  const funnels = await import("../src/lib/server/funnel-analytics-service");
  const report = await import("../src/lib/server/page-funnel-analytics-report");
  const m = await import("../src/lib/analytics/page-funnel-metrics");
  const db = getAdminDb();
  const AG = "ag-pfa";
  const SA = "sa-pfa";
  const OTHER = "sa-other";
  const today = m.utcDay(Date.now());
  const DAY = 86_400_000;

  const content = (blocks: unknown[]) => encodePuckData({ root: { props: {} }, content: blocks } as never);
  const page = (id: string, sa: string, status: string, goal: string, blocks: unknown[]) =>
    db.doc(`pages/${id}`).set({ name: id, subAccountId: sa, agencyId: AG, status, goal, pageType: "landing", updatedAt: Date.now(), puckPublishedData: status === "published" ? content(blocks) : null });
  const FORM = { type: "Form", props: { id: "f", formId: "form_1" } };
  const CHECKOUT = { type: "CheckoutBlock", props: { id: "c", checkoutConfigId: "step_s1" } };
  await page("pg_lead", SA, "published", "lead_generation", [FORM]);
  await page("pg_sales", SA, "published", "sales", [CHECKOUT]);
  await page("pg_info", SA, "published", "other", []);
  await page("pg_draft", SA, "draft", "lead_generation", [FORM]);
  await page("pg_salesnocheckout", SA, "published", "sales", []);
  await page("pg_other", OTHER, "published", "lead_generation", [FORM]);

  const funnel = (id: string, sa: string, steps: { id: string; type: string; order: number; pageId: string | null }[]) =>
    Promise.all([
      db.doc(`funnels/${id}`).set({ agencyId: AG, subAccountId: sa, name: id, status: "published", createdByUid: "u", createdAt: Date.now(), updatedAt: Date.now() }),
      ...steps.map((s) => db.doc(`funnels/${id}/steps/${s.id}`).set({ funnelId: id, subAccountId: sa, name: s.id, type: s.type, order: s.order, pageId: s.pageId, createdAt: Date.now(), checkoutConfigId: s.type === "checkout" ? "step_s1" : null })),
    ]);
  await funnel("F1", SA, [{ id: "s0", type: "page", order: 0, pageId: "pg_lead" }, { id: "s1", type: "checkout", order: 1, pageId: "pg_sales" }, { id: "s2", type: "upsell", order: 2, pageId: null }]);
  await funnel("F2", SA, [{ id: "o0", type: "page", order: 0, pageId: "pg_info" }]);
  await funnel("F3", OTHER, [{ id: "x0", type: "page", order: 0, pageId: "pg_other" }]);

  console.log("Pure definitions");
  await check("range: 30 UTC days ending today + an equal previous period", () => {
    const r = m.rangeFor("30d", Date.parse("2026-11-14T12:00:00Z"));
    assert.deepEqual(r, { from: "2026-10-16", to: "2026-11-14", prevFrom: "2026-09-16", prevTo: "2026-10-15", days: 30 });
  });
  await check("page goals come from the page's Goal + what it can measure", () => {
    assert.equal(m.pageGoalFor({ goal: "sales", hasForm: false, hasCheckout: true }).kind, "purchase");
    assert.equal(m.pageGoalFor({ goal: "lead_generation", hasForm: true, hasCheckout: false }).kind, "form_submission");
    assert.equal(m.pageGoalFor({ goal: "registration", hasForm: false, hasCheckout: false }).kind, null);
    assert.equal(m.pageGoalFor({ goal: "other", hasForm: true, hasCheckout: true }).kind, null);
  });
  await check("no conversion rate for a funnel that sells nothing or a page without a goal", () => {
    assert.equal(m.funnelConversionRate({ purchases: 0, entries: 10 }, false), null);
    const goal = m.pageGoalFor({ goal: "other", hasForm: false, hasCheckout: false });
    assert.equal(m.pageConversionRate({ ...m.EMPTY_PAGE_METRICS, visitors: 10 }, goal), null);
  });
  await check("comparisons only when tracking covered the previous period", () => {
    const r = m.rangeFor("30d");
    assert.equal(m.comparable(today, r), false);
    assert.equal(m.comparable(r.prevFrom, r), true);
    assert.equal(m.percentChange(10, 5, false), null);
    assert.equal(m.percentChange(10, 5, true), 1);
  });
  await check("money is never summed across currencies", () => {
    assert.equal(m.formatRevenue({ USD: 4700 }).text, "$47");
    assert.equal(m.formatRevenue({ USD: 4700, EUR: 2000 }).text, "Multiple currencies");
  });

  console.log("Page views and goals");
  await check("published page view counted; refresh = view, not a new visitor", async () => {
    assert.equal(await pages.recordPageView({ pageId: "pg_lead", visitorId: "visitorA0001" }), true);
    assert.equal(await pages.recordPageView({ pageId: "pg_lead", visitorId: "visitorA0001" }), true);
    assert.equal(await pages.recordPageView({ pageId: "pg_lead", visitorId: "visitorB0001" }), true);
    const d = (await db.doc(`pages/pg_lead/analyticsDaily/${today}`).get()).data()!;
    assert.equal(d.views, 3);
    assert.equal(d.uniqueVisitors, 2);
  });
  await check("draft / unknown pages are never tracked", async () => {
    assert.equal(await pages.recordPageView({ pageId: "pg_draft", visitorId: "visitorA0001" }), false);
    assert.equal(await pages.recordPageView({ pageId: "nope", visitorId: "visitorA0001" }), false);
    assert.equal((await db.doc(`pages/pg_draft/analyticsDaily/${today}`).get()).exists, false);
  });
  await check("form goal: counted once, only for a page that really contains the form in the form's workspace", async () => {
    assert.equal(await pages.recordPageFormSubmission({ pageId: "pg_lead", formId: "form_1", subAccountId: SA, submissionId: "sub1" }), true);
    assert.equal(await pages.recordPageFormSubmission({ pageId: "pg_lead", formId: "form_1", subAccountId: SA, submissionId: "sub1" }), false, "duplicate");
    assert.equal(await pages.recordPageFormSubmission({ pageId: "pg_lead", formId: "form_2", subAccountId: SA, submissionId: "sub2" }), false, "form not on page");
    assert.equal(await pages.recordPageFormSubmission({ pageId: "pg_info", formId: "form_1", subAccountId: SA, submissionId: "sub3" }), false, "page has no form");
    assert.equal(await pages.recordPageFormSubmission({ pageId: "pg_other", formId: "form_1", subAccountId: SA, submissionId: "sub4" }), false, "other workspace");
    assert.equal((await db.doc(`pages/pg_lead/analyticsDaily/${today}`).get()).get("goals.form_submission"), 1);
  });

  console.log("Funnel events (checkout outcomes, modes, currencies)");
  const order = (id: string, mode: "live" | "test", due: number, currency = "USD", trialDays = 0) =>
    ({ id, agencyId: AG, subAccountId: SA, configId: "step_s1", memberId: "m", paymentMode: mode, stripeAccountId: "acct_x", currency,
      totals: { dueTodayCents: due, recurring: trialDays ? { trialDays, amountCents: 4700, interval: "month" } : null } }) as never;
  const complete = (o: never, key: string) => funnels.recordCheckoutAnalytics({ event: "checkout_completed", order: o, funnelId: "F1", stepId: "s1", idempotencyKey: key });
  await check("verified completions are classified: paid / free trial / test", async () => {
    await complete(order("o_live", "live", 4700), "c1");
    await complete(order("o_live", "live", 4700), "c1"); // retry → idempotent
    await complete(order("o_eur", "live", 2000, "EUR"), "c2");
    await complete(order("o_trial", "live", 0, "USD", 7), "c3");
    await complete(order("o_test", "test", 9900), "c4");
    const d = (await db.doc(`funnels/F1/analyticsDaily/${today}`).get()).data()!;
    assert.equal(d.modes.live.outcomes.checkout_completed.payment, 2);
    assert.equal(d.modes.live.outcomes.checkout_completed.trial_activation, 1);
    assert.equal(d.modes.live.revenueByCurrency.USD, 4700);
    assert.equal(d.modes.live.revenueByCurrency.EUR, 2000);
    assert.equal(d.modes.test.revenue.initialPurchaseCents, 9900);
  });
  await check("a paid purchase is also the hosting page's goal (live paid only, idempotent)", async () => {
    const d = (await db.doc(`pages/pg_sales/analyticsDaily/${today}`).get()).data()!;
    assert.equal(d.modes.live.purchases, 2, "trial not counted");
    assert.equal(d.modes.live.revenueByCurrency.USD, 4700);
    assert.equal(d.modes.test.purchases, 1, "test kept separate");
  });
  const ev = (type: string, key: string, extra: Record<string, unknown> = {}) =>
    funnels.recordFunnelAnalyticsEvent({ type: type as never, agencyId: AG, subAccountId: SA, funnelId: "F1", stepId: "s0", verified: false, idempotencyKey: key, paymentMode: "unknown", ...extra });
  await check("traffic: one entry per visitor session across the funnel; views every time", async () => {
    // Same workspace-scoped visitor id on the landing page and the checkout page.
    await ev("funnel_entry", "entry:visitorA0001:F1", { anonymousUniqueKey: "visitorA0001:entry:F1" });
    await ev("funnel_entry", "entry:visitorA0001:F1", { anonymousUniqueKey: "visitorA0001:entry:F1" });
    await ev("funnel_entry", "entry:visitorB0001:F1", { anonymousUniqueKey: "visitorB0001:entry:F1" });
    await ev("step_viewed", "view:1", { anonymousUniqueKey: "visitorA0001:view:s0" });
    await ev("step_viewed", "view:2", { anonymousUniqueKey: "visitorA0001:view:s0" });
    await ev("step_viewed", "view:3", { stepId: "s1", anonymousUniqueKey: "visitorA0001:view:s1" });
    await ev("checkout_started", "cs:live", { stepId: "s1", paymentMode: "live" });
    await ev("checkout_started", "cs:test", { stepId: "s1", paymentMode: "test" });
    await ev("checkout_failed", "cf:live", { stepId: "s1", paymentMode: "live", outcome: "failed" });
    await ev("offer_accepted", "oa:live", { stepId: "s2", paymentMode: "live", verified: true, amountCents: 1500, currency: "usd", outcome: "payment" });
    await ev("offer_accepted", "oa:test", { stepId: "s2", paymentMode: "test", verified: true, amountCents: 8800, currency: "usd", outcome: "payment" });
    await ev("offer_declined", "od:live", { stepId: "s2", paymentMode: "live", outcome: "declined" });
  });

  console.log("Report builders (shared by Pages & Funnels and Reports)");
  // A forged rollup naming another workspace must be ignored.
  await db.doc(`funnels/F1/analyticsDaily/${m.utcDay(Date.now() - 3 * DAY)}`).set({ day: m.utcDay(Date.now() - 3 * DAY), subAccountId: OTHER, modes: { live: { events: { funnel_entry: 999 } } } });
  // F2: tracking began 65 days ago (before the 30-day comparison period) and
  // had 4 entries 45 days ago (inside it) → the previous period is comparable.
  const old = m.utcDay(Date.now() - 65 * DAY);
  const inPrev = m.utcDay(Date.now() - 45 * DAY);
  await db.doc(`funnels/F2/analyticsDaily/${old}`).set({ day: old, subAccountId: SA, modes: { unknown: { events: { step_viewed: 1 } } } });
  await db.doc(`funnels/F2/analyticsDaily/${inPrev}`).set({ day: inPrev, subAccountId: SA, modes: { unknown: { events: { funnel_entry: 4 } } } });
  const fr = await report.buildFunnelAnalytics(SA, "30d");
  const f1 = fr.funnels.find((f) => f.id === "F1")!;
  const f2 = fr.funnels.find((f) => f.id === "F2")!;
  await check("tenant isolation: only this workspace's funnels; forged rollups ignored", () => {
    assert.deepEqual(fr.funnels.map((f) => f.id).sort(), ["F1", "F2"]);
    assert.equal(f1.totals.entries, 2);
  });
  await check("business results: TEST excluded; trials ≠ purchases; LIVE revenue per currency", () => {
    assert.equal(f1.totals.checkoutStarts, 1);
    assert.equal(f1.totals.checkoutFailures, 1);
    assert.equal(f1.totals.purchases, 2);
    assert.equal(f1.totals.trials, 1);
    assert.equal(f1.totals.offersAccepted, 1);
    assert.equal(f1.totals.offersDeclined, 1);
    assert.deepEqual(f1.totals.revenueByCurrency, { USD: 6200, EUR: 2000 });
    assert.equal(f1.totals.views, 3);
  });
  await check("conversion = purchases ÷ entries for a selling funnel; none for an opt-in funnel", () => {
    assert.equal(f1.sells, true);
    assert.equal(m.funnelConversionRate(f1.totals, f1.sells), 1);
    assert.equal(f2.sells, false);
    assert.equal(m.funnelConversionRate(f2.totals, f2.sells), null);
  });
  await check("step breakdown: checkout + offer outcomes per step", () => {
    const s1 = f1.steps.find((s) => s.id === "s1")!;
    const s2 = f1.steps.find((s) => s.id === "s2")!;
    assert.equal(s1.metrics.purchases, 2);
    assert.equal(s1.metrics.checkoutStarts, 1);
    assert.equal(s2.metrics.offersAccepted, 1);
    assert.equal(s2.metrics.offersDeclined, 1);
  });
  await check("no comparison for a funnel tracked only today; comparison once tracking covers the prior period", () => {
    assert.equal(f1.trackingSince, today);
    assert.equal(f1.previous, null);
    assert.equal(f2.trackingSince, old);
    assert.notEqual(f2.previous, null);
    assert.equal(f2.previous!.entries, 4);
  });
  const pr = await report.buildPageAnalytics(SA, "30d");
  const byId = new Map(pr.pages.map((p) => [p.id, p]));
  await check("pages: workspace only; goals, completions and rates", () => {
    assert.equal(byId.has("pg_other"), false);
    const lead = byId.get("pg_lead")!;
    assert.equal(lead.goal.kind, "form_submission");
    assert.equal(lead.totals.views, 3);
    assert.equal(lead.totals.visitors, 2);
    assert.equal(m.pageConversions(lead.totals, lead.goal), 1);
    assert.equal(m.pageConversionRate(lead.totals, lead.goal), 0.5);
    const sales = byId.get("pg_sales")!;
    assert.equal(sales.goal.kind, "purchase");
    assert.equal(sales.totals.purchases, 2);
    assert.equal(byId.get("pg_info")!.goal.kind, null);
    assert.equal(byId.get("pg_salesnocheckout")!.goal.label, "Not measurable");
  });
  await check("the same API numbers feed both views (Pages & Funnels light view = Reports totals)", () => {
    const light = fr.funnels.find((f) => f.id === "F1")!;
    assert.deepEqual(light.totals, f1.totals);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
