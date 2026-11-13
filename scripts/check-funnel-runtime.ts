/**
 * Pages & Funnels — post-purchase funnel runtime (one-click Upsell / Downsell,
 * subscriptions, authentication, inline recovery, Accept / Decline outcomes),
 * against the Firestore EMULATOR and an IN-PROCESS MOCK of Stripe's HTTP API.
 *
 * The REAL code runs: the runtime service, the checkout order engine
 * (order creation, PaymentIntent / Subscription calls, Stripe-verified
 * completion, entitlement grant), Batch C's webhook → workflow events, the
 * public runtime route and the page view. Only Stripe's network is replaced:
 * `STRIPE_LOCAL_MOCK_URL` points the Stripe SDK at 127.0.0.1 (honoured only
 * with a TEST key, outside production — see lib/stripe/server.ts), the key is
 * a dummy, so nothing can reach Stripe or charge anyone. Email / SMS /
 * QStash keys are removed. No production credentials, no network.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8085},"ui":{"enabled":false}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-funnel-runtime \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-funnel-runtime.ts"
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "QSTASH_TOKEN", "QSTASH_URL", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "OPENROUTER_API_KEY", "STRIPE_SECRET_KEY_TEST", "STRIPE_SECRET_KEY_LIVE", "STRIPE_PUBLISHABLE_KEY_TEST", "STRIPE_PUBLISHABLE_KEY_LIVE", "STRIPE_CONNECT_WEBHOOK_SECRET", "VERCEL"]) delete process.env[k];
process.env.STRIPE_SECRET_KEY = "sk_test_local_mock_only";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_local_mock_only";
process.env.AUTOMATIONS_TOKEN_SECRET = "local-test-secret-0123456789abcdef";
process.env.NEXT_PUBLIC_FUNNEL_POST_PURCHASE_CHARGING = "on";
process.env.FUNNEL_POST_PURCHASE_TEST_SUBACCOUNT_IDS = "sa_fr";

/* ------------------------------ Mock Stripe ------------------------------ */
type Obj = Record<string, unknown>;
const pis = new Map<string, Obj>();
const subs = new Map<string, Obj>();
const invoices = new Map<string, Obj>();
const idem = new Map<string, { status: number; body: unknown }>();
const counts = { piCreates: 0, subCreates: 0, siCreates: 0, accountsSeen: new Set<string>() };
const sis = new Map<string, Obj>();
let seq = 0;
const nid = (p: string) => `${p}_${(++seq).toString().padStart(6, "0")}`;

function parseForm(body: string): Obj {
  const out: Obj = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let cur = out as Obj;
    path.forEach((seg, i) => {
      if (i === path.length - 1) {
        if (seg === "") (cur as unknown as unknown[]).push(v);
        else cur[seg] = v;
      } else {
        const nextIsArray = path[i + 1] === "" || /^\d+$/.test(path[i + 1]);
        cur[seg] ??= nextIsArray ? [] : {};
        cur = cur[seg] as Obj;
      }
    });
  }
  return out;
}

function piFor(amount: number, currency: string, pm: string | null, metadata: Obj, customer: string | null): { pi: Obj; error: Obj | null } {
  const id = nid("pi");
  const pi: Obj = { id, object: "payment_intent", created: Math.floor(Date.now() / 1000), description: null, amount, currency, customer, payment_method: pm, metadata, client_secret: `${id}_secret_mock`, amount_received: 0, status: "requires_payment_method", last_payment_error: null, latest_charge: null };
  let error: Obj | null = null;
  if (pm === "pm_ok") Object.assign(pi, { status: "succeeded", amount_received: amount, latest_charge: { id: nid("ch"), object: "charge", billing_details: { address: { city: null, state: null, country: "US" } } } });
  else if (pm === "pm_3ds") pi.status = "requires_action";
  else if (pm === "pm_processing") pi.status = "processing";
  else if (pm === "pm_decline") {
    pi.last_payment_error = { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." };
    error = { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds.", payment_intent: pi };
  }
  pis.set(id, pi);
  return { pi, error };
}

function succeedPi(id: string) {
  const pi = pis.get(id);
  if (!pi || pi.status === "canceled") return; // like Stripe: a canceled intent can't succeed
  Object.assign(pi, { status: "succeeded", amount_received: pi.amount, last_payment_error: null, latest_charge: { id: nid("ch"), object: "charge", billing_details: { address: { city: null, state: null, country: "US" } } } });
  for (const inv of invoices.values()) {
    if ((inv.confirmation_secret as Obj | null)?.client_secret === pi.client_secret) {
      Object.assign(inv, { status: "paid", amount_paid: pi.amount });
      const sub = subs.get(inv.subscription as string);
      if (sub) sub.status = "active";
    }
  }
}

function withInvoice(sub: Obj): Obj {
  return { ...sub, latest_invoice: invoices.get(sub.latest_invoice_id as string) ?? null };
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const account = (req.headers["stripe-account"] as string) || "platform";
    counts.accountsSeen.add(account);
    const key = req.headers["idempotency-key"] as string | undefined;
    const idemKey = key ? `${account}|${req.method}|${url.pathname}|${key}` : null;
    if (idemKey && idem.has(idemKey)) {
      const hit = idem.get(idemKey)!;
      return send(hit.status, hit.body);
    }
    const reply = (status: number, body: unknown) => {
      if (idemKey) idem.set(idemKey, { status, body });
      send(status, body);
    };
    const body = parseForm(raw);
    const p = url.pathname;
    let m: RegExpExecArray | null;
    // Test controls (never part of Stripe's API).
    if ((m = /^\/__mock\/seed_pi\/(pi_[\w]+)$/.exec(p))) {
      pis.set(m[1], { id: m[1], object: "payment_intent", status: "succeeded", payment_method: body.payment_method ?? null, metadata: {}, amount: 4700, amount_received: 4700 });
      return send(200, { ok: true });
    }
    if ((m = /^\/__mock\/succeed\/(pi_[\w]+)$/.exec(p))) {
      succeedPi(m[1]);
      return send(200, { ok: true });
    }
    if ((m = /^\/__mock\/fail\/(pi_[\w]+)$/.exec(p))) {
      const pi = pis.get(m[1]);
      if (pi) Object.assign(pi, { status: "requires_payment_method", last_payment_error: { code: "payment_intent_authentication_failure", message: "Authentication failed." } });
      return send(200, { ok: true });
    }
    if (req.method === "POST" && p === "/v1/payment_intents") {
      counts.piCreates++;
      const { pi, error } = piFor(Number(body.amount), String(body.currency), (body.payment_method as string) ?? null, (body.metadata as Obj) ?? {}, (body.customer as string) ?? null);
      return error ? reply(402, { error }) : reply(200, pi);
    }
    if ((m = /^\/v1\/payment_intents\/(pi_[\w]+)$/.exec(p)) && req.method === "GET") {
      const pi = pis.get(m[1]);
      return pi ? send(200, pi) : send(404, { error: { type: "invalid_request_error", message: "No such payment_intent" } });
    }
    if ((m = /^\/v1\/payment_intents\/(pi_[\w]+)\/cancel$/.exec(p))) {
      const pi = pis.get(m[1]);
      if (pi && pi.status !== "succeeded") pi.status = "canceled";
      return pi ? send(200, pi) : send(404, { error: { type: "invalid_request_error" } });
    }
    if (req.method === "POST" && p === "/v1/products") return reply(200, { id: nid("prod"), object: "product", name: body.name });
    // SetupIntents (free-trial card authorization).
    if (req.method === "POST" && p === "/v1/setup_intents") {
      counts.siCreates++;
      const id = nid("seti");
      const pm = (body.payment_method as string) ?? null;
      const si: Obj = { id, object: "setup_intent", customer: body.customer ?? null, payment_method: pm, usage: body.usage, metadata: body.metadata ?? {}, client_secret: `${id}_secret_mock`, status: "requires_payment_method", last_setup_error: null };
      if (pm === "pm_ok") si.status = "succeeded";
      else if (pm === "pm_3ds") si.status = "requires_action";
      else if (pm === "pm_decline") {
        si.last_setup_error = { code: "card_declined", message: "Your card was declined." };
        sis.set(id, si);
        return reply(402, { error: { type: "card_error", code: "card_declined", message: "Your card was declined.", setup_intent: si } });
      }
      sis.set(id, si);
      return reply(200, si);
    }
    if ((m = /^\/v1\/setup_intents\/(seti_[\w]+)$/.exec(p)) && req.method === "GET") {
      const si = sis.get(m[1]);
      return si ? send(200, si) : send(404, { error: { type: "invalid_request_error" } });
    }
    if ((m = /^\/v1\/setup_intents\/(seti_[\w]+)\/cancel$/.exec(p))) {
      const si = sis.get(m[1]);
      if (si && si.status !== "succeeded") si.status = "canceled";
      return si ? send(200, si) : send(404, { error: { type: "invalid_request_error" } });
    }
    if ((m = /^\/__mock\/succeed_si\/(seti_[\w]+)$/.exec(p))) {
      const si = sis.get(m[1]);
      if (si && si.status !== "canceled") Object.assign(si, { status: "succeeded", payment_method: si.payment_method && si.payment_method !== "pm_decline" ? si.payment_method : "pm_new_card", last_setup_error: null });
      return send(200, { ok: true });
    }
    if ((m = /^\/__mock\/fail_si\/(seti_[\w]+)$/.exec(p))) {
      const si = sis.get(m[1]);
      if (si) Object.assign(si, { status: "requires_payment_method", last_setup_error: { code: "setup_intent_authentication_failure" } });
      return send(200, { ok: true });
    }
    if (req.method === "POST" && p === "/v1/subscriptions" && body.trial_period_days) {
      counts.subCreates++;
      const id = nid("sub");
      const item = ((body.items as Obj[]) ?? [])[0] as Obj;
      const price = (item?.price_data ?? {}) as Obj;
      const invId = nid("in");
      invoices.set(invId, { id: invId, object: "invoice", subscription: id, status: "paid", amount_due: 0, amount_paid: 0, billing_reason: "subscription_create", confirmation_secret: null });
      const sub: Obj = { id, object: "subscription", status: "trialing", trial_period_days: Number(body.trial_period_days), customer: body.customer, default_payment_method: body.default_payment_method ?? null, metadata: body.metadata ?? {}, latest_invoice_id: invId, items: { data: [{ price: { unit_amount: Number(price.unit_amount), currency: price.currency, recurring: (price.recurring as Obj) ?? null } }] } };
      subs.set(id, sub);
      return reply(200, withInvoice(sub));
    }
    if (req.method === "POST" && p === "/v1/subscriptions") {
      counts.subCreates++;
      const id = nid("sub");
      const pm = (body.default_payment_method as string) ?? null;
      const item = ((body.items as Obj[]) ?? [])[0] as Obj;
      const price = (item?.price_data ?? {}) as Obj;
      const amount = Number(price.unit_amount);
      const invId = nid("in");
      const { pi } = piFor(amount, String(price.currency), pm, {}, (body.customer as string) ?? null);
      const paid = pi.status === "succeeded";
      invoices.set(invId, { id: invId, object: "invoice", subscription: id, status: paid ? "paid" : "open", amount_due: amount, amount_paid: paid ? amount : 0, confirmation_secret: { client_secret: pi.client_secret, type: "payment_intent" } });
      const sub: Obj = { id, object: "subscription", status: paid ? "active" : "incomplete", customer: body.customer, default_payment_method: pm, metadata: body.metadata ?? {}, latest_invoice_id: invId, items: { data: [{ price: { unit_amount: amount, currency: price.currency, recurring: (price.recurring as Obj) ?? null } }] } };
      subs.set(id, sub);
      return reply(200, withInvoice(sub));
    }
    if ((m = /^\/v1\/subscriptions\/(sub_[\w]+)$/.exec(p))) {
      const sub = subs.get(m[1]);
      if (!sub) return send(404, { error: { type: "invalid_request_error" } });
      if (req.method === "DELETE") sub.status = "canceled";
      if (req.method === "POST" && body.default_payment_method) sub.default_payment_method = body.default_payment_method;
      return send(200, withInvoice(sub));
    }
    if ((m = /^\/v1\/invoices\/(in_[\w]+)$/.exec(p))) {
      const inv = invoices.get(m[1]);
      return inv ? send(200, inv) : send(404, { error: { type: "invalid_request_error" } });
    }
    if (req.method === "GET" && p === "/v1/invoice_payments") return send(200, { object: "list", data: [], has_more: false });
    return send(404, { error: { type: "invalid_request_error", message: `Mock has no ${req.method} ${p}` } });
  });
});

/* -------------------------------- Harness -------------------------------- */
const SA = "sa_fr";
const SA2 = "sa_fr_other";
const AG = "ag_fr";
const UID = "uid_fr";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).stack?.split("\n").slice(0, 4).join("\n       ")}`);
  }
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  process.env.STRIPE_LOCAL_MOCK_URL = `http://127.0.0.1:${port}`;
  const mock = (path: string, form: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });

  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const funnels = await import("../src/lib/server/checkout/funnels-service");
  const configs = await import("../src/lib/server/checkout/config-service");
  const runtime = await import("../src/lib/server/checkout/funnel-runtime-service");
  const orders = await import("../src/lib/server/checkout/order-service");
  const caps = await import("../src/lib/checkout/capabilities");
  const tags = await import("../src/lib/server/contact-tags/service");
  const events = await import("../src/lib/server/payment-workflow-events");
  const rules = await import("../src/lib/checkout/funnel-offer");
  const { CheckoutError } = await import("../src/lib/server/checkout/common");
  const db = getAdminDb();
  assert.equal(caps.COMMERCE_CAPABILITIES.funnelPostPurchaseCharging, true);
  assert.equal(caps.funnelPostPurchaseChargingEnabled({ subAccountId: SA, paymentMode: "test" }), true);
  assert.equal(caps.funnelPostPurchaseChargingEnabled({ subAccountId: SA, paymentMode: "live" }), false);
  assert.equal(caps.funnelPostPurchaseChargingEnabled({ subAccountId: SA2, paymentMode: "test" }), false);

  /* ------------------------------- Fixtures ------------------------------- */
  const now = new Date();
  await db.doc(`subAccounts/${SA}`).set({ name: "Runtime QA", agencyId: AG, createdByUid: UID, slug: "runtime-qa", stripeConnect: { test: { accountId: "acct_T", chargesEnabled: true, payoutsEnabled: true, email: null, connectedAt: null } } });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: "ag_other", createdByUid: "x", stripeConnect: { test: { accountId: "acct_B", chargesEnabled: true, payoutsEnabled: true, email: null, connectedAt: null } } });
  const page = (id: string) => db.doc(`pages/${id}`).set({ name: id, slug: id, pageType: "sales", goal: "sales", status: "published", origin: "blank", funnelId: null, blocks: [], seo: {}, templateId: null, agencyId: AG, subAccountId: SA, createdByUid: UID, createdAt: now, updatedAt: now, publishedAt: now, puckDraftData: { content: [], root: { props: {} } }, puckPublishedData: { content: [], root: { props: {} } } });
  for (const id of ["pg_sales", "pg_up", "pg_down", "pg_up2", "pg_ty", "pg_trial"]) await page(id);
  const offer = (id: string, extra: Record<string, unknown>) =>
    db.doc(`subAccounts/${SA}/courseOffers/${id}`).set({
      subAccountId: SA, agencyId: AG, title: id, slug: id, descriptionHtml: "", courseIds: [], type: "oneTime", priceCents: 4700, currency: "USD", recurringInterval: null, trialDays: null, paymentMode: "test",
      priceTextOverride: null, visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false, showRecentPurchasePopup: false,
      access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null }, advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" },
      checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "", linkUrl: "" } }, booking: null, projectTemplates: [], communityAccess: [], createdAt: now, updatedAt: now, ...extra,
    });
  await offer("off_main", { title: "Main Course" });
  await offer("off_vip", { title: "VIP Bundle", priceCents: 9700 });
  await offer("off_club", { title: "Inner Circle", type: "recurring", priceCents: 2900, recurringInterval: "month", checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "custom", customText: "Cancel anytime from your account.", linkUrl: "https://example.com/terms" } } });
  await offer("off_lite", { title: "Lite Workbook", priceCents: 1900 });
  await offer("off_trial", { title: "Trial Club", type: "recurring", priceCents: 2900, recurringInterval: "month", trialDays: 7 });
  await db.doc("contacts/c1").set({ name: "Buyer", email: "buyer@example.com", emailLower: "buyer@example.com", subAccountId: SA, agencyId: AG, tags: ["Prospect"], mode: "live", territoryId: "global", createdAt: now, updatedAt: now });
  await db.doc(`subAccounts/${SA}/members/m1`).set({ email: "buyer@example.com", contactId: "c1", status: "active", displayName: "Buyer", emailVerified: true });
  const wf = (id: string) => db.doc(`workflows/${id}`).set({ id, name: id, status: "active", subAccountId: SA, agencyId: AG, trigger: { type: "contact.created", filters: { all: [] } }, nodes: { n1: { id: "n1", type: "add_tag", config: { tag: "Prospect" }, next: null } }, startNodeId: "n1", stats: { enrolled: 0, completed: 0 } });
  await wf("wf_accept");
  await wf("wf_decline");
  for (const n of ["Prospect", "VIP Customer", "Offer Declined", "Club Member"]) await tags.createTag({ subAccountId: SA, agencyId: AG, name: n, uid: UID }).catch(() => undefined);

  const { funnel } = await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "Launch", withCheckoutStep: true } });
  const F = funnel.id;
  const co = (await funnels.listSteps(F))[0];
  const up = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "upsell", name: "VIP", pageId: "pg_up" } });
  const down = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "downsell", name: "Club", pageId: "pg_down" } });
  const up2 = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "upsell", name: "Lite", pageId: "pg_up2" } });
  const ty = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "thank_you", name: "Thanks", pageId: "pg_ty" } });
  await funnels.reorderSteps(SA, F, [co.id, up.id, down.id, up2.id, ty.id]);
  await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: F, stepId: co.id, uid: UID, body: { primaryOfferId: "off_main", postPurchase: { type: "funnel_next_step" } } });
  const coStep = (await funnels.getStep(SA, F, co.id)).step;
  await funnels.updateStep(SA, F, up.id, {
    routing: { accept: { type: "funnel_step", stepId: up2.id }, decline: { type: "funnel_next_step" } },
    offer: { ...rules.defaultStepOffer(), offerId: "off_vip", onAccept: { addTags: ["VIP Customer"], removeTags: ["Prospect"], workflowId: "wf_accept" }, onDecline: { addTags: ["Offer Declined"], removeTags: [], workflowId: "wf_decline" } },
  });
  await funnels.updateStep(SA, F, down.id, {
    routing: { accept: { type: "funnel_next_step" }, decline: { type: "funnel_step", stepId: ty.id } },
    offer: { ...rules.defaultStepOffer(), offerId: "off_club", payment: { ...rules.DEFAULT_STEP_PAYMENT, recurringDisclosureAcknowledged: true }, onAccept: { addTags: ["Club Member"], removeTags: [], workflowId: null }, onDecline: { addTags: [], removeTags: [], workflowId: null } },
  });
  await funnels.updateStep(SA, F, up2.id, { offer: { ...rules.defaultStepOffer(), offerId: "off_lite" } });
  await db.doc(`funnels/${F}`).update({ status: "published" });

  let orderSeq = 0;
  /** A PAID funnel Checkout order whose card was `pm` → its funnel session token. */
  async function paidCheckout(pm: string | null = "pm_ok", extra: Record<string, unknown> = {}): Promise<{ token: string; orderId: string; sessionId: string }> {
    const orderId = `co_${++orderSeq}`;
    const piId = `pi_checkout_${orderSeq}`;
    if (pm) await mock(`/__mock/seed_pi/${piId}`, { payment_method: pm });
    await db.doc(`checkoutOrders/${orderId}`).set({
      agencyId: AG, subAccountId: SA, configId: coStep.checkoutConfigId, context: { type: "funnel_step", funnelId: F, stepId: co.id }, memberId: "m1", matchedExistingMember: false,
      buyer: { name: "Buyer", email: "buyer@example.com", phone: "" }, agreementAccepted: true, currency: "USD",
      items: [{ offerId: "off_main", role: "primary", bumpId: null, title: "Main", billing: "one_time", unitAmountCents: 4700, discountCents: 0, dueTodayCents: 4700, purchaseId: null, fulfillment: "granted", fulfillmentError: null }],
      coupon: null, totals: { currency: "USD", subtotalCents: 4700, discountCents: 0, dueTodayCents: 4700, recurring: null, lines: [] }, paymentMode: "test", stripeAccountId: "acct_T", stripeCustomerId: "cus_1",
      stripePaymentIntentId: pm ? piId : null, stripeSetupIntentId: null, stripeSubscriptionId: null, stripeCouponIds: [], status: "paid", failureReason: null, paidAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(), ...extra,
    });
    const s = await runtime.openFunnelSessionForOrder(orderId);
    assert.ok(s, "session opened");
    return { token: s!.token, orderId, sessionId: `fs_${orderId}` };
  }
  const act = (token: string | null, stepId: string, action: "accept" | "decline" | "status", consent?: boolean) => runtime.funnelOfferAction({ funnelId: F, stepId, action, token, consent });
  const session = async (id: string) => (await db.doc(`funnelSessions/${id}`).get()).data()!;
  const contactTags = async () => ((await db.doc("contacts/c1").get()).data()?.tags ?? []) as string[];
  const runsFor = async (wfId: string, key: string) => (await db.collection("workflowRuns").where("workflowId", "==", wfId).get()).docs.filter((d) => d.data().context?.deduplicationKey === key).length;
  const purchases = async (offerId: string) => (await db.collection(`subAccounts/${SA}/courseOffers/${offerId}/purchases`).get()).docs.map((d) => d.data());
  const isErr = (status: number, code?: string) => (e: unknown) => e instanceof CheckoutError && e.status === status && (!code || e.code === code);

  console.log("A. Session");
  await check("a paid funnel checkout opens a session on the next step (Upsell)", async () => {
    const { sessionId } = await paidCheckout();
    const s = await session(sessionId);
    assert.equal(s.currentStepId, up.id);
    assert.equal(s.paymentMethodId, "pm_ok");
    assert.equal(s.stripeAccountId, "acct_T");
    assert.equal(s.status, "active");
    assert.ok(!JSON.stringify(s).includes("4242"));
  });
  await check("unpaid / non-funnel orders open no session", async () => {
    await db.doc("checkoutOrders/co_unpaid").set({ ...(await db.doc("checkoutOrders/co_1").get()).data(), status: "pending" });
    assert.equal(await runtime.openFunnelSessionForOrder("co_unpaid"), null);
    await db.doc("checkoutOrders/co_hosted").set({ ...(await db.doc("checkoutOrders/co_1").get()).data(), context: { type: "hosted_offer", offerId: "off_main" } });
    assert.equal(await runtime.openFunnelSessionForOrder("co_hosted"), null);
  });
  await check("direct visit / missing or forged cookie can't act", async () => {
    await assert.rejects(act(null, up.id, "accept"), isErr(401, "no_session"));
    await assert.rejects(act("fs1.fs_co_1.forgedsignatureforgedsignature", up.id, "accept"), isErr(401, "no_session"));
    await assert.rejects(act("garbage", up.id, "accept"), isErr(401, "no_session"));
  });
  await check("a session from another funnel / workspace is refused", async () => {
    const t = runtime.issueFunnelSessionToken("fs_co_1");
    await assert.rejects(runtime.funnelOfferAction({ funnelId: "other_funnel", stepId: up.id, action: "accept", token: t }), isErr(403, "wrong_funnel"));
    const view = await runtime.funnelOfferViewForPage({ id: "pg_up", subAccountId: SA2 }, [{ name: runtime.funnelSessionCookieName(F), value: t }]);
    assert.equal(view, null);
  });
  await check("skipping ahead (not the current step) is refused", async () => {
    const { token } = await paidCheckout();
    await assert.rejects(act(token, up2.id, "accept"), isErr(409, "not_current_step"));
    await assert.rejects(act(token, ty.id, "decline"), isErr(409, "not_current_step"));
  });
  await check("expired session is refused (and marked expired)", async () => {
    const { token, sessionId } = await paidCheckout();
    await db.doc(`funnelSessions/${sessionId}`).update({ expiresAt: Date.now() - 1 });
    await assert.rejects(act(token, up.id, "accept"), isErr(410, "expired"));
    assert.equal((await session(sessionId)).status, "expired");
  });
  await check("page view: only for the session's current step page; read-only", async () => {
    const { token, sessionId } = await paidCheckout();
    const cookies = [{ name: runtime.funnelSessionCookieName(F), value: token }];
    const before = JSON.stringify(await session(sessionId));
    const v = await runtime.funnelOfferViewForPage({ id: "pg_up", subAccountId: SA }, cookies);
    assert.equal(v?.available, true);
    assert.equal(v?.offer?.amountLabel, "$97.00");
    assert.equal(v?.offer?.billing, "one_time");
    assert.equal(v?.stripe?.publishableKey, "pk_test_local_mock_only");
    assert.equal(v?.stripe?.stripeAccount, "acct_T");
    assert.ok(!JSON.stringify(v).includes(token), "no session token in the page");
    assert.equal(await runtime.funnelOfferViewForPage({ id: "pg_up", subAccountId: SA }, []), null);
    const later = await runtime.funnelOfferViewForPage({ id: "pg_up2", subAccountId: SA }, cookies);
    assert.equal(later?.available, false);
    assert.equal(JSON.stringify(await session(sessionId)), before);
  });

  console.log("B. One-time purchase");
  let mainToken = "";
  let mainSession = "";
  await check("Accept charges the saved card once, grants the Offer, runs Accept actions, routes to the Accept step", async () => {
    const tagsBefore = await contactTags();
    assert.ok(tagsBefore.includes("Prospect"));
    const s = await paidCheckout();
    mainToken = s.token;
    mainSession = s.sessionId;
    const creates = counts.piCreates;
    const r = await act(s.token, up.id, "accept");
    assert.equal(r.state, "succeeded");
    assert.equal(r.nextHref, "/p/pg_up2");
    assert.equal(counts.piCreates, creates + 1);
    const order = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, up.id)}`).get()).data()!;
    assert.equal(order.status, "paid");
    assert.equal(order.totals.dueTodayCents, 9700);
    assert.equal(order.context.type, "funnel_offer");
    const p = (await purchases("off_vip")).find((x) => x.orderId === order.id)!;
    assert.equal(p.status, "paid");
    assert.equal(p.amountCents, 9700);
    assert.equal(p.memberId, "m1");
    assert.equal(p.stripeConnectAccountId, "acct_T");
    const tagsAfter = await contactTags();
    assert.ok(tagsAfter.includes("VIP Customer") && !tagsAfter.includes("Prospect"), JSON.stringify(tagsAfter));
    const ss = await session(s.sessionId);
    assert.equal(ss.currentStepId, up2.id);
    assert.equal(ss.steps[up.id].effects, "done");
    assert.equal(await runsFor("wf_accept", ss.steps[up.id].effectsKey), 1);
    assert.ok(counts.accountsSeen.has("acct_T"));
  });
  await check("repeat Accept / refresh / status after success: no new charge, same destination", async () => {
    const creates = counts.piCreates;
    const r1 = await act(mainToken, up.id, "accept");
    const r2 = await act(mainToken, up.id, "status");
    assert.equal(r1.state, "succeeded");
    assert.equal(r2.nextHref, "/p/pg_up2");
    assert.equal(counts.piCreates, creates);
    const v = await runtime.funnelOfferViewForPage({ id: "pg_up", subAccountId: SA }, [{ name: runtime.funnelSessionCookieName(F), value: mainToken }]);
    assert.equal(v?.state, "succeeded");
    assert.equal(v?.nextHref, "/p/pg_up2");
  });
  await check("Decline after a completed purchase can't undo it", async () => {
    const r = await act(mainToken, up.id, "decline");
    assert.equal(r.state, "succeeded");
  });
  await check("duplicate webhooks + Batch C: one Payment succeeded event, no repeated actions", async () => {
    const orderId = runtime.funnelOfferOrderId(mainSession, up.id);
    const order = (await db.doc(`checkoutOrders/${orderId}`).get()).data()!;
    const pi = { id: order.stripePaymentIntentId, object: "payment_intent", amount: 9700, amount_received: 9700, currency: "usd", status: "succeeded", latest_charge: "ch_x", metadata: { kind: "checkoutOrder", orderId, subAccountId: SA, memberId: "m1", offerId: "off_vip" } };
    const ev = { id: "evt_up1", object: "event", type: "payment_intent.succeeded", account: "acct_T", livemode: false, created: 1_900_000_000, data: { object: pi } } as never;
    await orders.handleCheckoutOrderPaymentIntent(pi as never, "acct_T");
    await orders.handleCheckoutOrderPaymentIntent(pi as never, "acct_T");
    const a = await events.processStripeWorkflowEvent(ev);
    const b = await events.processStripeWorkflowEvent(ev);
    assert.equal(a[0].type, "payment.succeeded");
    assert.equal(a[0].contactId, "c1");
    assert.equal(b[0].outcome, "duplicate");
    const ss = await session(mainSession);
    assert.equal(await runsFor("wf_accept", ss.steps[up.id].effectsKey), 1);
    assert.equal((await purchases("off_vip")).filter((x) => x.orderId === orderId).length, 1);
  });
  await check("concurrent Accept clicks → exactly one charge", async () => {
    const s = await paidCheckout();
    const creates = counts.piCreates;
    const results = await Promise.all([act(s.token, up.id, "accept"), act(s.token, up.id, "accept"), act(s.token, up.id, "accept")].map((p) => p.catch((e) => ({ state: "error", e }))));
    assert.equal(counts.piCreates, creates + 1, JSON.stringify(results));
    const final = await act(s.token, up.id, "status");
    assert.equal(final.state, "succeeded");
  });
  await check("pending payment: no access, no actions, no advance; confirmed later → finalized once", async () => {
    const s = await paidCheckout("pm_processing");
    const r = await act(s.token, up.id, "accept");
    assert.equal(r.state, "processing");
    const ss = await session(s.sessionId);
    assert.equal(ss.currentStepId, up.id);
    assert.equal(ss.steps[up.id].effects, null);
    const order = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, up.id)}`).get()).data()!;
    assert.equal(order.status, "pending");
    // A lost response: the next call asks Stripe, never charges again.
    const creates = counts.piCreates;
    assert.equal((await act(s.token, up.id, "accept")).state, "processing");
    assert.equal(counts.piCreates, creates);
    await mock(`/__mock/succeed/${order.stripePaymentIntentId}`);
    const done = await act(s.token, up.id, "status");
    assert.equal(done.state, "succeeded");
    assert.equal((await session(s.sessionId)).steps[up.id].effects, "done");
  });
  await check("a forged success (status call while Stripe says unpaid) changes nothing", async () => {
    const s = await paidCheckout("pm_processing");
    await act(s.token, up.id, "accept");
    for (let i = 0; i < 3; i++) assert.equal((await act(s.token, up.id, "status")).state, "processing");
    const orderId = runtime.funnelOfferOrderId(s.sessionId, up.id);
    await assert.rejects(orders.completeOrder(orderId, { source: "webhook", eventAccountId: "acct_B" }), isErr(400));
    assert.equal((await db.doc(`checkoutOrders/${orderId}`).get()).data()!.status, "pending");
  });

  console.log("C/D. Failed payment + inline recovery");
  await check("declined saved card: stays on the step with a recovery secret; no Decline actions", async () => {
    const s = await paidCheckout("pm_decline");
    const before = await contactTags();
    const r = await act(s.token, up.id, "accept");
    assert.equal(r.state, "payment_failed");
    assert.ok(r.clientSecret?.startsWith("pi_"));
    assert.match(r.failure ?? "", /insufficient funds/);
    const ss = await session(s.sessionId);
    assert.equal(ss.currentStepId, up.id);
    assert.equal(ss.steps[up.id].effects, null);
    assert.deepEqual(await contactTags(), before);
    // Clicking Accept again reuses the SAME attempt (inline form), never a new charge.
    const creates = counts.piCreates;
    const again = await act(s.token, up.id, "accept");
    assert.equal(again.state, "payment_failed");
    assert.equal(again.clientSecret, r.clientSecret);
    assert.equal(counts.piCreates, creates);
    // Recovery succeeds (Stripe.js confirm → Stripe) → one purchase, Accept route.
    const piId = r.clientSecret!.split("_secret_")[0];
    await mock(`/__mock/succeed/${piId}`);
    const done = await act(s.token, up.id, "status");
    assert.equal(done.state, "succeeded");
    assert.equal(done.nextHref, "/p/pg_up2");
    assert.equal((await purchases("off_vip")).filter((x) => x.orderId === runtime.funnelOfferOrderId(s.sessionId, up.id) && x.status === "paid").length, 1);
  });
  await check("intentional Decline after a failed payment: attempt closed, Decline actions + route", async () => {
    const s = await paidCheckout("pm_decline");
    await db.doc("contacts/c1").update({ tags: ["Prospect"] });
    const r = await act(s.token, up.id, "accept");
    const piId = r.clientSecret!.split("_secret_")[0];
    const d = await act(s.token, up.id, "decline");
    assert.equal(d.state, "declined");
    assert.equal(d.nextHref, "/p/pg_down");
    assert.equal(pis.get(piId)?.status, "canceled");
    const order = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, up.id)}`).get()).data()!;
    assert.equal(order.status, "canceled");
    assert.ok((await contactTags()).includes("Offer Declined"));
    const ss = await session(s.sessionId);
    assert.equal(ss.currentStepId, down.id);
    assert.equal(await runsFor("wf_decline", ss.steps[up.id].effectsKey), 1);
    assert.equal(await runsFor("wf_accept", ss.steps[up.id].effectsKey), 0);
    // A late recovery can't complete a declined offer.
    await mock(`/__mock/succeed/${piId}`);
    assert.equal(pis.get(piId)?.status, "canceled");
  });
  await check("no saved card: Accept goes straight to the inline form (no charge attempted on file)", async () => {
    const s = await paidCheckout(null, { paymentMode: "test" });
    const r = await act(s.token, up.id, "accept");
    assert.equal(r.state, "payment_failed");
    assert.match(r.failure ?? "", /Add a payment method/);
  });

  console.log("E. Authentication");
  await check("authentication required: no actions / access until verified; failed auth stays; success once", async () => {
    const s = await paidCheckout("pm_3ds");
    const r = await act(s.token, up.id, "accept");
    assert.equal(r.state, "requires_action");
    assert.ok(r.clientSecret);
    const piId = r.clientSecret!.split("_secret_")[0];
    assert.equal((await session(s.sessionId)).steps[up.id].effects, null);
    await mock(`/__mock/fail/${piId}`);
    const failedAuth = await act(s.token, up.id, "status");
    assert.equal(failedAuth.state, "payment_failed");
    assert.equal((await session(s.sessionId)).currentStepId, up.id);
    await mock(`/__mock/succeed/${piId}`);
    const ok = await act(s.token, up.id, "status");
    assert.equal(ok.state, "succeeded");
    const again = await act(s.token, up.id, "status");
    assert.equal(again.state, "succeeded");
    const ss = await session(s.sessionId);
    assert.equal(await runsFor("wf_accept", ss.steps[up.id].effectsKey), 1);
  });

  console.log("F/G. Recurring + multi-step routing");
  await check("subscription needs the buyer's consent; then one subscription at the Offer's price + interval", async () => {
    const s = await paidCheckout();
    assert.equal((await act(s.token, up.id, "decline")).nextHref, "/p/pg_down");
    await assert.rejects(act(s.token, down.id, "accept"), isErr(400, "consent_required"));
    const creates = counts.subCreates;
    const r = await act(s.token, down.id, "accept", true);
    assert.equal(r.state, "succeeded");
    assert.equal(counts.subCreates, creates + 1);
    const order = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, down.id)}`).get()).data()!;
    assert.equal(order.totals.recurring.amountCents, 2900);
    assert.equal(order.totals.recurring.interval, "month");
    assert.equal(order.agreementAccepted, true);
    const sub = subs.get(order.stripeSubscriptionId)!;
    assert.equal(((sub.items as Obj).data as Obj[])[0].price && (((sub.items as Obj).data as Obj[])[0].price as Obj).unit_amount, 2900);
    assert.equal(sub.customer, "cus_1");
    assert.equal(((await session(s.sessionId)).steps[down.id].consentAt ?? 0) > 0, true);
    assert.equal(r.nextHref, "/p/pg_up2");
    await act(s.token, down.id, "accept", true);
    assert.equal(counts.subCreates, creates + 1, "no duplicate subscription");
  });
  await check("subscription first payment declined → inline recovery on the same subscription", async () => {
    const s = await paidCheckout("pm_decline");
    await act(s.token, up.id, "decline");
    const r = await act(s.token, down.id, "accept", true);
    assert.equal(r.state, "payment_failed");
    const order = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, down.id)}`).get()).data()!;
    assert.equal(subs.get(order.stripeSubscriptionId)!.status, "incomplete");
    await mock(`/__mock/succeed/${r.clientSecret!.split("_secret_")[0]}`);
    const done = await act(s.token, down.id, "status");
    assert.equal(done.state, "succeeded");
    assert.equal(subs.get(order.stripeSubscriptionId)!.status, "active");
  });
  console.log("Free-trial subscriptions (owner decision 2026-11-13)");
  const trialStep = async () => funnels.updateStep(SA, F, up2.id, { offer: { ...rules.defaultStepOffer(), offerId: "off_trial", payment: { ...rules.DEFAULT_STEP_PAYMENT, recurringDisclosureAcknowledged: true }, onAccept: { addTags: ["Club Member"], removeTags: [], workflowId: "wf_accept" }, onDecline: { addTags: [], removeTags: [], workflowId: null } } });
  /** A fresh paid checkout whose session is on the trial step (fixture: place the session there directly). */
  const toTrial = async (pm: string | null = "pm_ok") => {
    const s = await paidCheckout(pm);
    await db.doc(`funnelSessions/${s.sessionId}`).update({ currentStepId: up2.id, path: [co.id, up2.id] });
    return s;
  };
  await trialStep();
  const trialOrderOf = (sid: string) => runtime.funnelOfferOrderId(sid, up2.id);
  let trialSession = { token: "", sessionId: "", orderId: "" };
  await check("trial: consent required; $0 today; card authorized FIRST, then one trialing subscription; accepted + routed", async () => {
    const s = await paidCheckout();
    await act(s.token, up.id, "accept");
    assert.equal((await session(s.sessionId)).currentStepId, up2.id);
    await assert.rejects(act(s.token, up2.id, "accept"), isErr(400, "consent_required"));
    const before = { si: counts.siCreates, sub: counts.subCreates, pi: counts.piCreates };
    const r = await act(s.token, up2.id, "accept", true);
    assert.equal(r.state, "succeeded");
    assert.equal(r.acceptance, "trial_activation");
    assert.equal(r.nextHref, "/p/pg_ty");
    assert.equal(counts.siCreates, before.si + 1);
    assert.equal(counts.subCreates, before.sub + 1);
    assert.equal(counts.piCreates, before.pi, "no charge for a free trial");
    const order = (await db.doc(`checkoutOrders/${trialOrderOf(s.sessionId)}`).get()).data()!;
    assert.equal(order.acceptance, "trial_activation");
    assert.equal(order.totals.dueTodayCents, 0);
    assert.equal(order.totals.recurring.trialDays, 7);
    assert.equal(order.totals.recurring.amountCents, 2900);
    const sub = subs.get(order.stripeSubscriptionId)!;
    assert.equal(sub.status, "trialing");
    assert.equal(sub.trial_period_days, 7);
    assert.equal(sub.default_payment_method, "pm_ok");
    assert.equal(sis.get(order.stripeSetupIntentId)?.status, "succeeded");
    assert.equal((sis.get(order.stripeSetupIntentId)?.metadata as Obj).orderId, order.id ?? trialOrderOf(s.sessionId));
    trialSession = { ...s, orderId: trialOrderOf(s.sessionId) };
  });
  await check("trial access granted as a TRIAL (not a paid purchase), Contact Activity says so", async () => {
    const p = (await purchases("off_trial")).find((x) => x.orderId === trialSession.orderId)!;
    assert.equal(p.status, "paid", "fulfilled → access granted");
    assert.equal(p.acceptedAs, "trial");
    assert.equal(p.trialDays, 7);
    assert.equal(p.stripePaymentIntentId, null, "no payment");
    const purchaseId = (await db.collection(`subAccounts/${SA}/courseOffers/off_trial/purchases`).where("orderId", "==", trialSession.orderId).get()).docs[0].id;
    const act0 = (await db.doc(`contacts/c1/activities/purchase_offer_${purchaseId}`).get()).data();
    assert.ok(act0, "trial activity row");
    assert.match(String(act0!.content), /Started a 7-day free trial/);
    assert.equal(act0!.meta.amountCents, 0);
  });
  await check("trial Accept actions ran once with their own outcome key and trial context", async () => {
    const ss = await session(trialSession.sessionId);
    const rec = ss.steps[up2.id];
    assert.equal(rec.acceptance, "trial_activation");
    assert.match(rec.effectsKey, /:trial_activated:/);
    assert.equal(rec.effects, "done");
    assert.ok((await contactTags()).includes("Club Member"));
    const runs = (await db.collection("workflowRuns").where("workflowId", "==", "wf_accept").get()).docs.map((d) => d.data()).filter((r) => r.context?.deduplicationKey === rec.effectsKey);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].context.eventType, "funnel.offer.trial_started");
    assert.equal(runs[0].context.acceptance, "trial_activation");
  });
  await check("Batch C: trial → Subscription created (once), NO Payment succeeded; $0 invoice is not a payment", async () => {
    const order = (await db.doc(`checkoutOrders/${trialSession.orderId}`).get()).data()!;
    const sub: Obj = { ...(subs.get(order.stripeSubscriptionId) as Obj), latest_invoice: undefined };
    const created = { id: "evt_trial_created", object: "event", type: "customer.subscription.created", account: "acct_T", livemode: false, created: 1_900_100_000, data: { object: sub } } as never;
    const a = await events.processStripeWorkflowEvent(created);
    const b = await events.processStripeWorkflowEvent(created);
    assert.equal(a[0].type, "subscription.created");
    assert.equal(a[0].contactId, "c1");
    assert.equal(b[0].outcome, "duplicate");
    const zeroInvoice = { id: "in_trial0", object: "invoice", amount_paid: 0, amount_due: 0, currency: "usd", billing_reason: "subscription_create", parent: { subscription_details: { subscription: sub.id, metadata: sub.metadata } }, lines: { data: [] } };
    const paid0 = await events.processStripeWorkflowEvent({ id: "evt_trial_inv0", object: "event", type: "invoice.paid", account: "acct_T", livemode: false, created: 1_900_100_001, data: { object: zeroInvoice } } as never);
    assert.equal(paid0.filter((x) => x.type === "payment.succeeded").length, 0);
    const keys = (await db.collection("paymentWorkflowEvents").get()).docs.map((d) => String(d.data().key));
    assert.ok(!keys.some((k) => k.startsWith("payment.succeeded") && k.includes(String(order.stripeSubscriptionId))));
  });
  await check("first real charge after the trial: Payment succeeded fires; Accept actions + access NOT repeated", async () => {
    const order = (await db.doc(`checkoutOrders/${trialSession.orderId}`).get()).data()!;
    const sub = subs.get(order.stripeSubscriptionId)!;
    const before = { runs: (await db.collection("workflowRuns").get()).size, purchases: (await purchases("off_trial")).length, subs: counts.subCreates };
    const invoice = { id: "in_after_trial", object: "invoice", amount_paid: 2900, amount_due: 2900, currency: "usd", billing_reason: "subscription_cycle", attempt_count: 1, parent: { subscription_details: { subscription: sub.id, metadata: sub.metadata } }, lines: { data: [{ period: { start: 1_900_700_000 } }] } };
    await orders.handleCheckoutOrderInvoicePaid(invoice as never, "acct_T");
    await orders.handleCheckoutOrderInvoicePaid(invoice as never, "acct_T");
    const r = await events.processStripeWorkflowEvent({ id: "evt_after_trial", object: "event", type: "invoice.paid", account: "acct_T", livemode: false, created: 1_900_700_001, data: { object: invoice } } as never);
    assert.ok(r.some((x) => x.type === "payment.succeeded" && x.contactId === "c1"), JSON.stringify(r));
    const ss = await session(trialSession.sessionId);
    assert.equal(ss.steps[up2.id].effects, "done");
    const runs = (await db.collection("workflowRuns").where("workflowId", "==", "wf_accept").get()).docs.filter((d) => d.data().context?.deduplicationKey === ss.steps[up2.id].effectsKey);
    assert.equal(runs.length, 1, "Accept actions not repeated");
    assert.equal((await purchases("off_trial")).length, before.purchases, "no new purchase / grant");
    assert.equal(counts.subCreates, before.subs, "no new subscription");
  });
  await check("trial: duplicate / concurrent accepts + refresh → one SetupIntent, one subscription", async () => {
    const s = await toTrial();
    const before = { si: counts.siCreates, sub: counts.subCreates };
    await Promise.all([act(s.token, up2.id, "accept", true), act(s.token, up2.id, "accept", true), act(s.token, up2.id, "accept", true)].map((x) => x.catch(() => null)));
    const fin = await act(s.token, up2.id, "status");
    assert.equal(fin.state, "succeeded");
    assert.equal(counts.siCreates, before.si + 1);
    assert.equal(counts.subCreates, before.sub + 1);
    assert.equal((await act(s.token, up2.id, "accept", true)).state, "succeeded");
    assert.equal(counts.subCreates, before.sub + 1);
  });
  await check("trial: bank verification required → no subscription, no access, no actions; verified → accepted once", async () => {
    const s = await toTrial("pm_3ds");
    const before = counts.subCreates;
    const r = await act(s.token, up2.id, "accept", true);
    assert.equal(r.state, "requires_action");
    assert.equal(r.intentType, "setup");
    assert.ok(r.clientSecret?.startsWith("seti_"));
    assert.equal(counts.subCreates, before, "no subscription before verification");
    assert.equal((await session(s.sessionId)).steps[up2.id].effects, null);
    const siId = r.clientSecret!.split("_secret_")[0];
    await mock(`/__mock/fail_si/${siId}`);
    const failed = await act(s.token, up2.id, "status");
    assert.equal(failed.state, "payment_failed", "verification failed → stays, recoverable (not a decline)");
    assert.equal(counts.subCreates, before);
    await mock(`/__mock/succeed_si/${siId}`);
    const ok = await act(s.token, up2.id, "status");
    assert.equal(ok.state, "succeeded");
    assert.equal(ok.acceptance, "trial_activation");
    assert.equal(counts.subCreates, before + 1);
  });
  await check("trial: saved card rejected → inline card form completes the SAME setup; never a Decline", async () => {
    const s = await toTrial("pm_decline");
    const before = { si: counts.siCreates, sub: counts.subCreates };
    const r = await act(s.token, up2.id, "accept", true);
    assert.equal(r.state, "payment_failed");
    assert.equal(r.intentType, "setup");
    assert.equal(counts.subCreates, before.sub, "no subscription without an authorized card");
    const again = await act(s.token, up2.id, "accept", true);
    assert.equal(again.clientSecret, r.clientSecret, "same SetupIntent");
    assert.equal(counts.siCreates, before.si + 1);
    await mock(`/__mock/succeed_si/${r.clientSecret!.split("_secret_")[0]}`);
    const done = await act(s.token, up2.id, "status");
    assert.equal(done.state, "succeeded");
    const order = (await db.doc(`checkoutOrders/${trialOrderOf(s.sessionId)}`).get()).data()!;
    assert.equal(subs.get(order.stripeSubscriptionId)!.default_payment_method, "pm_new_card");
  });
  await check("trial: decline after a failed setup → setup voided, no subscription, Decline route", async () => {
    const s = await toTrial("pm_decline");
    const before = counts.subCreates;
    const r = await act(s.token, up2.id, "accept", true);
    const d = await act(s.token, up2.id, "decline");
    assert.equal(d.state, "declined");
    assert.equal(sis.get(r.clientSecret!.split("_secret_")[0])?.status, "canceled");
    assert.equal(counts.subCreates, before);
    await mock(`/__mock/succeed_si/${r.clientSecret!.split("_secret_")[0]}`);
    assert.equal(sis.get(r.clientSecret!.split("_secret_")[0])?.status, "canceled", "a voided setup can't complete later");
  });
  await check("trial: wrong Stripe account / missing consent configuration → refused, nothing created", async () => {
    const s = await toTrial();
    const before = { si: counts.siCreates, sub: counts.subCreates };
    await db.doc(`funnelSessions/${s.sessionId}`).update({ stripeAccountId: "acct_B" });
    await assert.rejects(act(s.token, up2.id, "accept", true), isErr(409, "unavailable"));
    await db.doc(`funnelSessions/${s.sessionId}`).update({ stripeAccountId: "acct_T" });
    await funnels.updateStep(SA, F, up2.id, { offer: { ...rules.defaultStepOffer(), offerId: "off_trial" } });
    await assert.rejects(act(s.token, up2.id, "accept", true), isErr(409, "unavailable"));
    await trialStep();
    assert.deepEqual({ si: counts.siCreates, sub: counts.subCreates }, before);
  });
  await funnels.updateStep(SA, F, up2.id, { offer: { ...rules.defaultStepOffer(), offerId: "off_lite" } });

  console.log("Session limits (owner-approved: 2 h idle, 24 h max)");
  await check("2-hour inactivity: an idle session expires and can't buy", async () => {
    const s = await paidCheckout();
    const ss = await session(s.sessionId);
    assert.ok(Math.abs(ss.expiresAt - (ss.createdAt + 2 * 3600_000)) < 5_000, "idle limit = 2 h");
    await db.doc(`funnelSessions/${s.sessionId}`).update({ expiresAt: Date.now() - 1 });
    await assert.rejects(act(s.token, up.id, "accept"), isErr(410, "expired"));
  });
  await check("activity extends the idle window, never past 24 hours from the start", async () => {
    const s = await paidCheckout("pm_processing");
    const created = Date.now() - (24 * 3600_000 - 10 * 60_000); // 23 h 50 min ago
    await db.doc(`funnelSessions/${s.sessionId}`).update({ createdAt: created, expiresAt: Date.now() + 60_000 });
    await act(s.token, up.id, "accept");
    const ss = await session(s.sessionId);
    assert.ok(ss.expiresAt <= created + 24 * 3600_000, "capped at 24 h");
    await db.doc(`funnelSessions/${s.sessionId}`).update({ createdAt: Date.now() - 25 * 3600_000, expiresAt: Date.now() - 3600_000 });
    await assert.rejects(act(s.token, up.id, "accept"), isErr(410, "expired"));
  });
  await check("expiry never strands an in-flight payment: status still finishes it; no new attempt allowed", async () => {
    const s = await paidCheckout("pm_processing");
    const r = await act(s.token, up.id, "accept");
    assert.equal(r.state, "processing");
    const order = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, up.id)}`).get()).data()!;
    await db.doc(`funnelSessions/${s.sessionId}`).update({ expiresAt: Date.now() - 1 });
    await mock(`/__mock/succeed/${order.stripePaymentIntentId}`);
    const creates = counts.piCreates;
    const done = await act(s.token, up.id, "status");
    assert.equal(done.state, "succeeded");
    assert.equal(counts.piCreates, creates);
    assert.equal((await db.doc(`checkoutOrders/${order.id ?? runtime.funnelOfferOrderId(s.sessionId, up.id)}`).get()).data()!.status, "paid");
  });
  await check("an expired session can't start a fresh purchase (replay refused)", async () => {
    const s = await paidCheckout();
    await db.doc(`funnelSessions/${s.sessionId}`).update({ expiresAt: Date.now() - 1 });
    const creates = counts.piCreates;
    await assert.rejects(act(s.token, up.id, "accept"), isErr(410, "expired"));
    await assert.rejects(act(s.token, up.id, "status"), isErr(410, "expired"));
    assert.equal(counts.piCreates, creates);
  });
  await check("three Offer steps in a row each keep their own order; last one ends at Thank-you", async () => {
    const s = await paidCheckout();
    const a = await act(s.token, up.id, "accept");
    assert.equal(a.nextHref, "/p/pg_up2");
    const b = await act(s.token, up2.id, "accept");
    assert.equal(b.nextHref, "/p/pg_ty");
    const ss = await session(s.sessionId);
    assert.equal(ss.status, "completed");
    assert.equal(ss.currentStepId, ty.id);
    const o1 = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, up.id)}`).get()).data()!;
    const o2 = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, up2.id)}`).get()).data()!;
    assert.equal(o1.items[0].offerId, "off_vip");
    assert.equal(o2.items[0].offerId, "off_lite");
    assert.equal(o2.totals.dueTodayCents, 1900);
    assert.equal((await act(s.token, up.id, "decline")).state, "succeeded", "a completed purchase can't be declined afterwards");
  });
  await check("completed session can't buy again (replay)", async () => {
    const s = await paidCheckout();
    await act(s.token, up.id, "decline");
    await act(s.token, down.id, "decline");
    assert.equal((await session(s.sessionId)).status, "completed");
    await assert.rejects(act(s.token, up2.id, "accept"), isErr(410, "completed"));
  });

  console.log("H. Security + configuration");
  await check("the browser can't choose the Offer or price (body is only action + consent)", async () => {
    const s = await paidCheckout();
    const route = await import("../src/app/api/order-checkout/_routes/funnel-offer/[funnelId]/[stepId]/route");
    const ctx = { params: Promise.resolve({ funnelId: F, stepId: up.id }) };
    const res = await route.POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", cookie: `${runtime.funnelSessionCookieName(F)}=${encodeURIComponent(s.token)}` }, body: JSON.stringify({ action: "accept", offerId: "off_lite", amount: 1, priceCents: 1 }) }), ctx);
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const order = (await db.doc(`checkoutOrders/${runtime.funnelOfferOrderId(s.sessionId, up.id)}`).get()).data()!;
    assert.equal(order.items[0].offerId, "off_vip");
    assert.equal(order.totals.dueTodayCents, 9700);
  });
  await check("route: no cookie → 401; non-JSON → 415; unknown action → 400", async () => {
    const route = await import("../src/app/api/order-checkout/_routes/funnel-offer/[funnelId]/[stepId]/route");
    const ctx = { params: Promise.resolve({ funnelId: F, stepId: up.id }) };
    assert.equal((await route.POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) }), ctx)).status, 401);
    assert.equal((await route.POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "action=accept" }), ctx)).status, 415);
    assert.equal((await route.POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refund" }) }), ctx)).status, 400);
  });
  await check("Stripe account changed since checkout → refused (never charged on another account)", async () => {
    const s = await paidCheckout();
    await db.doc(`funnelSessions/${s.sessionId}`).update({ stripeAccountId: "acct_B" });
    const creates = counts.piCreates;
    await assert.rejects(act(s.token, up.id, "accept"), isErr(409, "unavailable"));
    assert.equal(counts.piCreates, creates);
  });
  await check("step without an Offer / unpublished funnel / archived Offer → no payment endpoint", async () => {
    const s = await paidCheckout();
    await funnels.updateStep(SA, F, up.id, { offer: { ...rules.defaultStepOffer(), offerId: null } });
    await assert.rejects(act(s.token, up.id, "accept"), isErr(409, "unavailable"));
    await funnels.updateStep(SA, F, up.id, { offer: { ...rules.defaultStepOffer(), offerId: "off_vip", onAccept: { addTags: ["VIP Customer"], removeTags: ["Prospect"], workflowId: "wf_accept" }, onDecline: { addTags: ["Offer Declined"], removeTags: [], workflowId: "wf_decline" } } });
    await db.doc(`funnels/${F}`).update({ status: "draft" });
    await assert.rejects(act(s.token, up.id, "accept"), isErr(409, "unavailable"));
    await db.doc(`funnels/${F}`).update({ status: "published" });
    await db.doc(`subAccounts/${SA}/courseOffers/off_vip`).update({ visibility: "archived" });
    await assert.rejects(act(s.token, up.id, "accept"), isErr(409, "unavailable"));
    await db.doc(`subAccounts/${SA}/courseOffers/off_vip`).update({ visibility: "published" });
    // Decline still works on a misconfigured step (no payment involved).
    assert.equal((await act(s.token, up.id, "decline")).state, "declined");
  });
  await check("charging switched off → no session, every action refused", async () => {
    caps.COMMERCE_CAPABILITIES.funnelPostPurchaseCharging = false;
    try {
      const { orderId } = await (async () => {
        caps.COMMERCE_CAPABILITIES.funnelPostPurchaseCharging = true;
        const r = await paidCheckout();
        caps.COMMERCE_CAPABILITIES.funnelPostPurchaseCharging = false;
        return r;
      })();
      assert.equal(await runtime.openFunnelSessionForOrder(orderId), null);
      await assert.rejects(act(runtime.issueFunnelSessionToken(`fs_${orderId}`), up.id, "accept"), isErr(403, "not_enabled"));
      assert.equal(await runtime.funnelOfferViewForPage({ id: "pg_up", subAccountId: SA }, [{ name: runtime.funnelSessionCookieName(F), value: runtime.issueFunnelSessionToken(`fs_${orderId}`) }]), null);
    } finally {
      caps.COMMERCE_CAPABILITIES.funnelPostPurchaseCharging = true;
    }
  });
  await check("a crashed outcome (actions still pending) is completed by the hourly backstop, once", async () => {
    const s = await paidCheckout();
    await act(s.token, up.id, "decline");
    const key = (await session(s.sessionId)).steps[up.id].effectsKey;
    await db.doc(`funnelSessions/${s.sessionId}`).update({ [`steps.${up.id}.effects`]: "pending", effectsPending: true });
    const r = await runtime.retryPendingFunnelEffects();
    assert.ok(r.checked >= 1);
    const ss = await session(s.sessionId);
    assert.equal(ss.steps[up.id].effects, "done");
    assert.equal(ss.effectsPending, false);
    assert.equal(await runsFor("wf_decline", key), 1, "once-only key: no second run");
  });
  await check("no card data or session tokens are stored", async () => {
    const all = (await db.collection("funnelSessions").get()).docs.map((d) => JSON.stringify(d.data())).join("\n");
    assert.ok(!/fs1\.|4242|cvc|card_number|exp_month/i.test(all));
  });
  await check("the mock was only ever called on the connected account", () => {
    assert.ok(!counts.accountsSeen.has("acct_B"));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
