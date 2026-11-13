/**
 * Pages & Funnels — Upsell / Downsell Step Settings (Offer, Payment, Routing,
 * CRM & follow-up), against the Firestore EMULATOR: persistence + backwards
 * compatibility, Offer / tag / Workflow ownership, pricing never accepted from
 * the request, payment prerequisites + runtime-not-enabled status, Tags
 * library integration (usage, rename, merge, delete → needs attention),
 * independent duplication, no side effects on save, the Accept / Decline
 * outcome contract, and route authorization. No network: Stripe, email, SMS
 * and QStash keys are removed, and nothing here calls Stripe.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8085},"ui":{"enabled":false}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-step-offer \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-funnel-step-offer.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "QSTASH_TOKEN", "QSTASH_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "OPENROUTER_API_KEY"]) delete process.env[k];

const SA = "sa_step_offer";
const SA2 = "sa_step_offer_other";
const AG = "ag_step_offer";
const UID = "uid_step_offer";
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
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const funnels = await import("../src/lib/server/checkout/funnels-service");
  const configs = await import("../src/lib/server/checkout/config-service");
  const offerSvc = await import("../src/lib/server/checkout/funnel-offer-service");
  const rules = await import("../src/lib/checkout/funnel-offer");
  const caps = await import("../src/lib/checkout/capabilities");
  const tags = await import("../src/lib/server/contact-tags/service");
  const { CheckoutError } = await import("../src/lib/server/checkout/common");
  const db = getAdminDb();
  const isErr = (status: number, field?: string) => (e: unknown) => e instanceof CheckoutError && e.status === status && (!field || !!e.fields?.[field]);

  /* -------------------------------- seed -------------------------------- */
  await db.doc(`subAccounts/${SA}`).set({ name: "Step Offer QA", agencyId: AG, createdByUid: UID });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: "ag_other", createdByUid: "uid_other" });
  const page = (id: string, sa = SA) =>
    db.doc(`pages/${id}`).set({ name: id, slug: id, pageType: "sales", goal: "sales", status: "published", origin: "blank", funnelId: null, blocks: [], seo: {}, templateId: null, agencyId: sa === SA ? AG : "ag_other", subAccountId: sa, createdByUid: UID, createdAt: new Date(), updatedAt: new Date(), publishedAt: null, puckDraftData: { content: [], root: { props: {} } } });
  for (const id of ["pg_sales", "pg_up", "pg_down", "pg_ty", "pg_other_up"]) await page(id);
  const offer = (id: string, extra: Record<string, unknown>, sa = SA) =>
    db.doc(`subAccounts/${sa}/courseOffers/${id}`).set({
      subAccountId: sa, agencyId: sa === SA ? AG : "ag_other", title: id, slug: id, descriptionHtml: "", courseIds: [], type: "oneTime", priceCents: 4700, currency: "USD",
      recurringInterval: null, trialDays: null, paymentMode: "test", priceTextOverride: null, visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false,
      showRecentPurchasePopup: false, access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null }, advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" },
      checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "", linkUrl: "" } }, booking: null, projectTemplates: [], communityAccess: [], createdAt: new Date(), updatedAt: new Date(),
      ...extra,
    });
  await offer("off_main", {});
  await offer("off_one", { title: "VIP Bundle", priceCents: 9700 });
  await offer("off_sub", { title: "Inner Circle", type: "recurring", priceCents: 2900, recurringInterval: "month" });
  await offer("off_free", { title: "Free thing", type: "free", priceCents: null });
  await offer("off_archived", { title: "Old", visibility: "archived" });
  await offer("off_noprice", { title: "No price", priceCents: null });
  await offer("off_system", { title: "Community price", systemManaged: true });
  await offer("off_later_archived", { title: "Soon archived" });
  await offer("off_later_deleted", { title: "Soon deleted" });
  await offer("off_foreign", { title: "Foreign" }, SA2);
  const wf = (id: string, status: string, sa = SA) => db.doc(`workflows/${id}`).set({ id, name: id, status, subAccountId: sa, agencyId: sa === SA ? AG : "ag_other", trigger: { type: "contact.created", filters: { all: [] } }, nodes: {}, startNodeId: null });
  await wf("wf_onboard", "active");
  await wf("wf_followup", "active");
  await wf("wf_draft", "draft");
  await wf("wf_later_paused", "active");
  await wf("wf_foreign", "active", SA2);
  for (const name of ["VIP Customer", "Prospect", "Offer Declined", "Temp Tag", "Old Name", "Merge Me", "Keep Me"]) await tags.createTag({ subAccountId: SA, agencyId: AG, name, uid: UID });
  await db.doc("contacts/c1").set({ name: "C1", email: "c1@example.com", subAccountId: SA, agencyId: AG, tags: ["Prospect"], mode: "live", territoryId: "global", createdAt: new Date(), updatedAt: new Date() });

  const { funnel } = await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "Launch", withCheckoutStep: true } });
  const F = funnel.id;
  const co = (await funnels.listSteps(F))[0];
  const sales = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "page", name: "Sales", pageId: "pg_sales" } });
  const up = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "upsell", name: "VIP", pageId: "pg_up" } });
  const down = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "downsell", name: "Lite", pageId: "pg_down" } });
  const ty = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "thank_you", name: "Thanks", pageId: "pg_ty" } });
  await funnels.reorderSteps(SA, F, [sales.id, co.id, up.id, down.id, ty.id]);
  await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: F, stepId: co.id, uid: UID, body: { primaryOfferId: "off_main", postPurchase: { type: "funnel_next_step" } } });
  const stored = async (stepId: string) => (await db.doc(`funnels/${F}/steps/${stepId}`).get()).data()!;
  const full = (o: Partial<import("../src/types/checkout").StepOfferSettings> = {}) => ({ ...rules.defaultStepOffer(), ...o });

  console.log("A. Step & page");
  await check("an older upsell without Offer settings loads with safe defaults", async () => {
    const s = (await funnels.getStep(SA, F, up.id)).step;
    assert.equal(s.offer, undefined);
    assert.deepEqual(rules.normalizeStepOffer(s.offer), rules.defaultStepOffer());
    const payload = await offerSvc.stepOfferSettingsPayload(SA, s.offer);
    assert.equal(payload.settings.offerId, null);
    assert.ok(payload.offers.some((o) => o.id === "off_one") && !payload.offers.some((o) => o.id === "off_foreign"));
  });
  await check("renaming / routing an old step doesn't add Offer settings", async () => {
    await funnels.updateStep(SA, F, up.id, { name: "VIP Upgrade" });
    assert.equal((await stored(up.id)).offer, undefined);
  });

  console.log("B. Offer");
  await check("one-time Offer saved and reloaded; price comes from the Offer", async () => {
    await funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_one" }) });
    const s = await stored(up.id);
    assert.equal(s.offer.offerId, "off_one");
    const payload = await offerSvc.stepOfferSettingsPayload(SA, s.offer);
    assert.equal(payload.savedOffer?.priceCents, 9700);
    assert.equal(payload.savedOffer?.type, "oneTime");
  });
  await check("pricing / interval / currency in the request are ignored (never stored)", async () => {
    await funnels.updateStep(SA, F, up.id, { offer: { ...full({ offerId: "off_one" }), priceCents: 1, currency: "EUR", recurringInterval: "day", payment: { method: "one_click", amountCents: 1, cardNumber: "4242" } } });
    const raw = JSON.stringify((await stored(up.id)).offer);
    assert.ok(!/priceCents|EUR|"day"|amountCents|4242/.test(raw), raw);
  });
  await check("recurring Offer saved with its own interval", async () => {
    await funnels.updateStep(SA, F, down.id, { offer: full({ offerId: "off_sub" }) });
    const p = await offerSvc.stepOfferSettingsPayload(SA, (await stored(down.id)).offer);
    assert.equal(p.savedOffer?.recurringInterval, "month");
    assert.equal(rules.billingSummary({ ...p.savedOffer!, currency: p.savedOffer!.currency }), "Subscription · every month");
  });
  for (const [id, label] of [["off_free", "free"], ["off_archived", "archived"], ["off_noprice", "no price"], ["off_system", "community-managed"], ["off_foreign", "another workspace"], ["off_missing", "missing"]] as const) {
    await check(`new pick refused: ${label} Offer`, async () => {
      await assert.rejects(funnels.updateStep(SA, F, up.id, { offer: full({ offerId: id }) }), isErr(400, "offerId"));
      assert.equal((await stored(up.id)).offer.offerId, "off_one", "previous choice untouched");
    });
  }
  await check("saved Offer later archived: kept, shown as needing attention, never switched", async () => {
    await funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_later_archived" }) });
    await db.doc(`subAccounts/${SA}/courseOffers/off_later_archived`).update({ visibility: "archived" });
    await funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_later_archived", onAccept: { addTags: ["VIP Customer"], removeTags: [], workflowId: null } }) });
    const s = await stored(up.id);
    assert.equal(s.offer.offerId, "off_later_archived");
    const p = await offerSvc.stepOfferSettingsPayload(SA, s.offer);
    assert.equal(p.savedOffer?.id, "off_later_archived");
    assert.match(p.savedOffer?.stepProblem ?? "", /archived/);
    const hub = await funnels.getFunnelHub(SA, F);
    assert.ok(hub.issues.some((i) => i.code === "offer_unavailable" && i.stepId === up.id));
  });
  await check("saved Offer later deleted: kept, flagged, payload doesn't crash", async () => {
    await funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_later_deleted" }) });
    await db.doc(`subAccounts/${SA}/courseOffers/off_later_deleted`).delete();
    const s = await stored(up.id);
    const p = await offerSvc.stepOfferSettingsPayload(SA, s.offer);
    assert.equal(p.savedOfferDeleted, true);
    assert.equal(p.savedOffer, null);
    const hub = await funnels.getFunnelHub(SA, F);
    assert.ok(hub.issues.some((i) => i.code === "offer_unavailable" && /deleted/.test(i.message)));
    await funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_one" }) });
  });
  await check("a step with no Offer shows a hub warning (not a publish blocker)", async () => {
    const hub = await funnels.getFunnelHub(SA, F);
    // down has an Offer; make a fresh upsell with none.
    const extra = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "upsell", name: "Extra" } });
    const hub2 = await funnels.getFunnelHub(SA, F);
    const w = hub2.issues.find((i) => i.code === "offer_missing" && i.stepId === extra.id);
    assert.equal(w?.level, "warning");
    assert.ok(hub.issues.every((i) => i.code !== "offer_missing" || i.stepId !== up.id));
    await funnels.deleteStep(SA, F, extra.id);
  });
  await check("Offer settings refused on Page / Thank-you / Checkout steps", async () => {
    for (const id of [sales.id, ty.id, co.id]) await assert.rejects(funnels.updateStep(SA, F, id, { offer: full({ offerId: "off_one" }) }), isErr(400));
  });

  console.log("C. Payment");
  await check("prerequisites: Stripe not connected / earlier Checkout / subscription disclosure", async () => {
    const p = await offerSvc.stepOfferSettingsPayload(SA, (await stored(down.id)).offer);
    assert.equal(p.stripe, "not_connected");
    const pre = rules.paymentPrerequisites({ offer: { ...p.savedOffer!, currency: p.savedOffer!.currency }, offerAttention: null, stripe: p.stripe, hasEarlierCheckout: true, recurringDisclosureAcknowledged: false });
    assert.deepEqual(pre.map((x) => `${x.key}:${x.state}`), ["offer:met", "stripe:missing", "saved_payment_method:met", "recurring_disclosure:missing"]);
    assert.equal(rules.stepConfigStatus(pre, 0), "missing");
    const noCheckout = rules.paymentPrerequisites({ offer: null, offerAttention: null, stripe: "ready", hasEarlierCheckout: false, recurringDisclosureAcknowledged: false });
    assert.equal(noCheckout.find((x) => x.key === "saved_payment_method")?.state, "missing");
  });
  await check("connected Stripe with charges enabled / disabled is reported from stored data only", async () => {
    await db.doc(`subAccounts/${SA}`).update({ stripeConnect: { test: { accountId: "acct_T", chargesEnabled: false, payoutsEnabled: false, email: null, connectedAt: null } } });
    assert.equal((await offerSvc.stepOfferSettingsPayload(SA, (await stored(down.id)).offer)).stripe, "charges_disabled");
    await db.doc(`subAccounts/${SA}`).update({ "stripeConnect.test.chargesEnabled": true });
    assert.equal((await offerSvc.stepOfferSettingsPayload(SA, (await stored(down.id)).offer)).stripe, "ready");
  });
  await check("recurring step complete only after the disclosure is confirmed; runtime still not enabled", async () => {
    await funnels.updateStep(SA, F, down.id, { offer: full({ offerId: "off_sub", payment: { ...rules.DEFAULT_STEP_PAYMENT, recurringDisclosureAcknowledged: true } }) });
    const s = await stored(down.id);
    assert.equal(s.offer.payment.recurringDisclosureAcknowledged, true);
    assert.equal(s.offer.payment.method, "one_click");
    assert.equal(s.offer.payment.onFailure, "stay_on_step_inline_payment");
    const p = await offerSvc.stepOfferSettingsPayload(SA, s.offer);
    const pre = rules.paymentPrerequisites({ offer: { ...p.savedOffer!, currency: p.savedOffer!.currency }, offerAttention: p.savedOffer!.stepProblem, stripe: p.stripe, hasEarlierCheckout: true, recurringDisclosureAcknowledged: true });
    assert.equal(rules.stepConfigStatus(pre, 0), "complete");
    assert.equal(p.runtime.postPurchaseCharging, false);
    assert.equal(caps.COMMERCE_CAPABILITIES.funnelPostPurchaseCharging, false);
  });
  await check("free-trial subscription Offers are supported: complete once the disclosure is confirmed", () => {
    const base = { offer: { id: "t", title: "Trial", type: "recurring" as const, priceCents: 2900, currency: "USD", recurringInterval: "month" as const, trialDays: 7, visibility: "published" }, offerAttention: null, stripe: "ready" as const, hasEarlierCheckout: true };
    const pending = rules.paymentPrerequisites({ ...base, recurringDisclosureAcknowledged: false });
    assert.equal(rules.stepConfigStatus(pending, 0), "missing");
    const pre = rules.paymentPrerequisites({ ...base, recurringDisclosureAcknowledged: true });
    const d = pre.find((x) => x.key === "recurring_disclosure")!;
    assert.equal(d.state, "met");
    assert.match(d.detail, /7-day free trial/);
    assert.equal(rules.stepConfigStatus(pre, 0), "complete");
  });
  await check("one-time Offers need no subscription disclosure", async () => {
    const pre = rules.paymentPrerequisites({ offer: { id: "x", title: "x", type: "oneTime", priceCents: 100, currency: "USD", recurringInterval: null, visibility: "published" }, offerAttention: null, stripe: "ready", hasEarlierCheckout: true, recurringDisclosureAcknowledged: false });
    assert.ok(!pre.some((x) => x.key === "recurring_disclosure"));
    assert.equal(rules.stepConfigStatus(pre, 0), "complete");
  });

  console.log("D. Routing");
  await check("routing + Offer saved together; an invalid route saves nothing", async () => {
    await funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_step", stepId: down.id } }, offer: full({ offerId: "off_one" }) });
    const before = JSON.stringify((await stored(up.id)).offer);
    await assert.rejects(funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: up.id }, decline: { type: "funnel_next_step" } }, offer: full({ offerId: "off_sub" }) }), isErr(400));
    const s = await stored(up.id);
    assert.equal(JSON.stringify(s.offer), before);
    assert.equal(s.routing.accept.stepId, ty.id);
  });
  await check("outcome contract: failed / pending / auth stay on the step; never Decline", () => {
    const o = full({ onAccept: { addTags: ["VIP Customer"], removeTags: [], workflowId: "wf_onboard" }, onDecline: { addTags: ["Offer Declined"], removeTags: [], workflowId: null } });
    for (const out of ["payment_failed", "authentication_required"] as const) {
      const e = rules.outcomeEffects(out, o);
      assert.equal(e.route, "stay");
      assert.equal(e.crm, null);
      assert.equal(e.showInlinePaymentForm, true);
      assert.equal(e.grantAccess, false);
    }
    for (const out of ["accept_clicked", "payment_pending"] as const) {
      const e = rules.outcomeEffects(out, o);
      assert.deepEqual([e.route, e.crm, e.grantAccess, e.recordPurchase], ["stay", null, false, false]);
    }
  });

  console.log("E. CRM");
  await check("Accept / Decline tags + Workflows saved in the library's spelling", async () => {
    await funnels.updateStep(SA, F, up.id, {
      offer: full({
        offerId: "off_one",
        onAccept: { addTags: ["vip   customer"], removeTags: ["PROSPECT"], workflowId: "wf_onboard" },
        onDecline: { addTags: ["offer declined"], removeTags: [], workflowId: "wf_followup" },
      }),
    });
    const o = (await stored(up.id)).offer;
    assert.deepEqual(o.onAccept, { addTags: ["VIP Customer"], removeTags: ["Prospect"], workflowId: "wf_onboard" });
    assert.deepEqual(o.onDecline, { addTags: ["Offer Declined"], removeTags: [], workflowId: "wf_followup" });
  });
  await check("same tag twice (any capitalization) is stored once", () => {
    assert.deepEqual(rules.cleanStepTags(["VIP Customer", "vip customer", " VIP  CUSTOMER "]), ["VIP Customer"]);
  });
  await check("tag not in the Tags library is refused (no tag is created)", async () => {
    await assert.rejects(funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_one", onAccept: { addTags: ["Brand New Tag"], removeTags: [], workflowId: null } }) }), isErr(400, "onAccept.tags"));
    const names = (await tags.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.map((t) => t.name);
    assert.ok(!names.includes("Brand New Tag"));
  });
  await check("adding and removing the same tag is refused", async () => {
    await assert.rejects(funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_one", onAccept: { addTags: ["Prospect"], removeTags: ["prospect"], workflowId: null } }) }), isErr(400, "onAccept.tags"));
  });
  await check("Workflow: draft, another workspace's, or missing → refused", async () => {
    for (const id of ["wf_draft", "wf_foreign", "wf_missing"]) await assert.rejects(funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_one", onDecline: { addTags: [], removeTags: [], workflowId: id } }) }), isErr(400, "onDecline.workflowId"));
  });
  await check("saved Workflow later paused is kept (flagged in the UI), not replaced", async () => {
    const cur = (await stored(up.id)).offer;
    await funnels.updateStep(SA, F, up.id, { offer: { ...cur, onAccept: { ...cur.onAccept, workflowId: "wf_later_paused" } } });
    await db.doc("workflows/wf_later_paused").update({ status: "paused" });
    const again = (await stored(up.id)).offer;
    await funnels.updateStep(SA, F, up.id, { offer: { ...again, onDecline: { ...again.onDecline, addTags: ["Offer Declined", "Keep Me"] } } });
    assert.equal((await stored(up.id)).offer.onAccept.workflowId, "wf_later_paused");
  });
  await check("the Tags library lists the step as a usage (action)", async () => {
    const vip = (await tags.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.find((t) => t.name === "VIP Customer")!;
    assert.equal(vip.usageByType.funnel_step, 1);
  });
  await check("rename a tag → the step's action follows the new name", async () => {
    await funnels.updateStep(SA, F, down.id, { offer: full({ offerId: "off_sub", payment: { ...rules.DEFAULT_STEP_PAYMENT, recurringDisclosureAcknowledged: true }, onAccept: { addTags: ["Old Name", "Merge Me"], removeTags: ["Temp Tag"], workflowId: null } }) });
    const old = (await tags.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.find((t) => t.name === "Old Name")!;
    await tags.renameTag({ subAccountId: SA, agencyId: AG, tagId: old.id, newName: "New Name", uid: UID });
    assert.deepEqual((await stored(down.id)).offer.onAccept.addTags, ["New Name", "Merge Me"]);
  });
  await check("merge tags → the step keeps one tag, no duplicates", async () => {
    const all = (await tags.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags;
    const keep = all.find((t) => t.name === "New Name")!;
    const drop = all.find((t) => t.name === "Merge Me")!;
    await tags.mergeTags({ subAccountId: SA, agencyId: AG, targetId: keep.id, sourceIds: [drop.id], uid: UID });
    assert.deepEqual((await stored(down.id)).offer.onAccept.addTags, ["New Name"]);
  });
  await check("delete a tag → removed from the action, marked 'needs attention', never executed", async () => {
    const t = (await tags.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.find((x) => x.name === "Temp Tag")!;
    await tags.deleteTag({ subAccountId: SA, tagId: t.id, uid: UID, confirmName: "Temp Tag", expectedReferenceCount: t.usageCount });
    const o = (await stored(down.id)).offer;
    assert.deepEqual(o.onAccept.removeTags, []);
    assert.equal(o.onAccept.invalidTags?.[0]?.tag, "Temp Tag");
    assert.equal(o.onAccept.invalidTags?.[0]?.list, "removeTags");
    assert.ok(!rules.runnableAction(o.onAccept).removeTags.includes("Temp Tag"));
    const hub = await funnels.getFunnelHub(SA, F);
    assert.ok(hub.issues.some((i) => i.code === "crm_needs_attention" && i.stepId === down.id));
  });
  await check("the deleted tag isn't recreated; markers can be dismissed but never invented", async () => {
    assert.ok(!(await tags.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.some((x) => x.name === "Temp Tag"));
    const o = rules.normalizeStepOffer((await stored(down.id)).offer);
    const invented = { ...o, onDecline: { ...o.onDecline, invalidTags: [{ reason: "tag_deleted", tag: "Fake", list: "addTags", at: 1 }] } };
    await funnels.updateStep(SA, F, down.id, { offer: invented });
    assert.equal((await stored(down.id)).offer.onDecline.invalidTags, undefined);
    assert.equal((await stored(down.id)).offer.onAccept.invalidTags?.length, 1, "kept until dismissed");
    await funnels.updateStep(SA, F, down.id, { offer: { ...o, onAccept: { ...o.onAccept, invalidTags: [] } } });
    assert.equal((await stored(down.id)).offer.onAccept.invalidTags, undefined, "dismissed");
  });

  console.log("F/G. Accept / Decline timing contract");
  await check("Accept actions only for a confirmed successful payment; Decline only for a decline", () => {
    const o = rules.normalizeStepOffer({ onAccept: { addTags: ["VIP Customer"], removeTags: ["Prospect"], workflowId: "wf_onboard" }, onDecline: { addTags: ["Offer Declined"], workflowId: "wf_followup" } });
    const ok = rules.outcomeEffects("payment_succeeded", o);
    assert.deepEqual([ok.route, ok.crm?.side, ok.grantAccess, ok.recordPurchase], ["accept", "onAccept", true, true]);
    const no = rules.outcomeEffects("declined", o);
    assert.deepEqual([no.route, no.crm?.side, no.grantAccess, no.recordPurchase], ["decline", "onDecline", false, false]);
    const outcomes = ["accept_clicked", "payment_pending", "authentication_required", "payment_failed", "payment_succeeded", "declined"] as const;
    assert.deepEqual(outcomes.filter((x) => rules.outcomeEffects(x, o).crm?.side === "onAccept"), ["payment_succeeded"]);
    assert.deepEqual(outcomes.filter((x) => rules.outcomeEffects(x, o).crm?.side === "onDecline"), ["declined"]);
  });
  await check("one action key per accepted purchase (redelivery / retry can't run actions twice)", () => {
    const k = (ref: string) => rules.outcomeActionKey({ sessionId: "s1", stepId: "st1", outcome: "payment_succeeded", paymentRef: ref });
    assert.equal(k("pi_1"), k("pi_1"));
    assert.notEqual(k("pi_1"), rules.outcomeActionKey({ sessionId: "s2", stepId: "st1", outcome: "payment_succeeded", paymentRef: "pi_1" }));
    assert.equal(rules.outcomeActionKey({ sessionId: "s1", stepId: "st1", outcome: "declined" }), rules.outcomeActionKey({ sessionId: "s1", stepId: "st1", outcome: "declined" }));
  });
  await check("saving / loading settings has no side effects (no runs, tags, orders, purchases, activity)", async () => {
    const runs = (await db.collection("workflowRuns").get()).size;
    const orders = (await db.collection("checkoutOrders").get()).size;
    const purchases = (await db.collectionGroup("purchases").get()).size;
    const contact = JSON.stringify((await db.doc("contacts/c1").get()).data()?.tags);
    const acts = (await db.collection("contacts/c1/activities").get()).size;
    await funnels.updateStep(SA, F, up.id, { offer: full({ offerId: "off_one", onAccept: { addTags: ["VIP Customer"], removeTags: ["Prospect"], workflowId: "wf_onboard" } }) });
    await offerSvc.stepOfferSettingsPayload(SA, (await stored(up.id)).offer);
    assert.equal((await db.collection("workflowRuns").get()).size, runs);
    assert.equal((await db.collection("checkoutOrders").get()).size, orders);
    assert.equal((await db.collectionGroup("purchases").get()).size, purchases);
    assert.equal(JSON.stringify((await db.doc("contacts/c1").get()).data()?.tags), contact);
    assert.equal((await db.collection("contacts/c1/activities").get()).size, acts);
  });

  console.log("H. Duplicate + page changes");
  await check("duplicate copies Offer/CRM as an independent object", async () => {
    const { step: copy } = await funnels.duplicateStep({ subAccountId: SA, funnelId: F, stepId: up.id, uid: UID, pageMode: "copy" });
    assert.equal((await stored(copy.id)).offer.offerId, "off_one");
    const c = (await stored(copy.id)).offer;
    await funnels.updateStep(SA, F, copy.id, { offer: { ...c, onAccept: { ...c.onAccept, addTags: [] } } });
    assert.deepEqual((await stored(up.id)).offer.onAccept.addTags, ["VIP Customer"]);
    await funnels.deleteStep(SA, F, copy.id);
  });
  await check("changing the page keeps the Offer and CRM settings; shared page still needs Duplicate & Use", async () => {
    const before = JSON.stringify((await stored(up.id)).offer);
    await assert.rejects(funnels.updateStep(SA, F, up.id, { pageId: "pg_down" }), (e: unknown) => e instanceof CheckoutError && e.status === 409);
    await funnels.updateStep(SA, F, up.id, { pageId: "pg_other_up" });
    assert.equal(JSON.stringify((await stored(up.id)).offer), before);
  });

  console.log("I. Security");
  await check("another workspace can't read or write this funnel's steps", async () => {
    await assert.rejects(funnels.getStep(SA2, F, up.id), (e: unknown) => e instanceof CheckoutError && e.status === 404);
    await assert.rejects(funnels.updateStep(SA2, F, up.id, { offer: full({ offerId: "off_foreign" }) }), (e: unknown) => e instanceof CheckoutError && e.status === 404);
  });
  await check("the Step Settings route requires a signed-in workspace admin", async () => {
    const route = await import("../src/app/api/sub-accounts/[id]/commerce/_routes/funnels/[funnelId]/steps/[stepId]/route");
    const ctx = { params: Promise.resolve({ id: SA, funnelId: F, stepId: up.id }) };
    const get = await route.GET(new Request(`http://localhost/api/sub-accounts/${SA}/commerce/funnels/${F}/steps/${up.id}`), ctx);
    const patch = await route.PATCH(new Request(`http://localhost/api/sub-accounts/${SA}/commerce/funnels/${F}/steps/${up.id}`, { method: "PATCH", body: JSON.stringify({ offer: full({ offerId: "off_sub" }) }) }), ctx);
    assert.ok(get.status === 401 || get.status === 403, `GET ${get.status}`);
    assert.ok(patch.status === 401 || patch.status === 403, `PATCH ${patch.status}`);
    assert.equal((await stored(up.id)).offer.offerId, "off_one");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
