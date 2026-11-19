/**
 * Page-first funnels (2026-11-17) — EMULATOR ONLY. Exercises the real
 * services and API routes (through the commerce dispatcher) against the
 * Firestore + Auth emulators:
 *  - Add a page: blank / template / existing (explicit draft copy), roles from
 *    content (a page with a Checkout block becomes the funnel's checkout page
 *    with its OWN blank settings), no inherited version history, original
 *    untouched, workspace + admin checks, limits;
 *  - page roles (checkout / one-click offer): settings carried from the page's
 *    previous same-funnel checkout, routing + analytics anchored to the page's
 *    own step, refused on live funnels and shared offer pages;
 *  - Move to another funnel: preview writes nothing, payment pages refused,
 *    page identity kept, routes + after-purchase destinations repaired with
 *    every other checkout setting preserved, cross-workspace refused;
 *  - one Checkout block per page at publish;
 *  - legacy typed steps still work.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8098},"auth":{"port":9198}},"firestore":{"rules":"firestore.rules"}}' > firebase.pagefirst-test.json
 *   firebase emulators:exec --config firebase.pagefirst-test.json --only firestore,auth --project demo-page-first \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-page-first-funnels.ts"
 */
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore + Auth emulators and a demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID = PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT;
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "STRIPE_SECRET_KEY", "NEXT_PUBLIC_FUNNEL_POST_PURCHASE_CHARGING", "FUNNEL_POST_PURCHASE_TEST_SUBACCOUNT_IDS"]) delete process.env[k];

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).stack?.split("\n").slice(0, 4).join("\n       ")}`);
  }
}

const AG = "agPF", SA = "saPF", SA2 = "saPFother", ADMIN = "pfAdmin", COLLAB = "pfCollab";

async function main() {
  const { initializeApp } = await import("firebase-admin/app");
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { getAuth } = await import("firebase-admin/auth");
  const funnels = await import("../src/lib/server/checkout/funnels-service");
  const configs = await import("../src/lib/server/checkout/config-service");
  const { CheckoutError } = await import("../src/lib/server/checkout/common");
  const puck = await import("../src/lib/server/pages-funnels-puck-service");
  const templates = await import("../src/lib/server/pages-funnels/page-template-service");
  const resolver = await import("../src/lib/server/page-checkout-resolver");
  const analytics = await import("../src/lib/server/funnel-analytics-service");
  const { encodePuckData, readStoredPuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const { countCheckoutBlocks } = await import("../src/lib/pages-funnels/checkout-block");
  const { DEFAULT_CHECKOUT_PRESENTATION } = await import("../src/lib/checkout/presentation");
  const { viaDispatcher } = await import("./_via-dispatcher");
  const dispatcher = await import("../src/app/api/sub-accounts/[id]/commerce/[[...path]]/route");
  const stepsRoute = viaDispatcher(dispatcher, "funnels/[funnelId]/steps");
  const stepRoute = viaDispatcher(dispatcher, "funnels/[funnelId]/steps/[stepId]");
  const moveRoute = viaDispatcher(dispatcher, "funnels/[funnelId]/steps/[stepId]/move");

  const db = getAdminDb();
  const auth = getAuth();
  const isErr = (status: number, code?: string) => (e: unknown) => e instanceof CheckoutError && e.status === status && (!code || e.code === code);
  const req = (uid: string, body?: unknown, method = "POST") =>
    new Request("http://test", { method, headers: { "Content-Type": "application/json", "x-user-uid": uid }, body: body === undefined ? undefined : JSON.stringify(body) });

  // ── fixtures ──
  for (const [uid, claims] of [
    [ADMIN, { status: "active", role: "admin", agencyId: AG, agencyRole: null }],
    [COLLAB, { status: "active", role: "admin", agencyId: AG, agencyRole: null }],
  ] as const) {
    await auth.createUser({ uid, email: `${uid}@example.com` }).catch(() => {});
    await auth.setCustomUserClaims(uid, claims);
  }
  await db.doc(`subAccounts/${SA}`).set({ agencyId: AG, name: "Page-first QA" });
  await db.doc(`subAccounts/${SA2}`).set({ agencyId: "agOther", name: "Other" });
  await db.doc(`subAccounts/${SA}/subAccountMembers/${ADMIN}`).set({ status: "active", role: "admin" });
  await db.doc(`subAccounts/${SA}/subAccountMembers/${COLLAB}`).set({ status: "active", role: "collaborator" });
  await db.doc(`subAccounts/${SA}/courseOffers/offerPF`).set({
    subAccountId: SA, agencyId: AG, title: "PF Offer", slug: "pf-offer", descriptionHtml: "", courseIds: [], type: "oneTime", priceCents: 9700, currency: "USD",
    recurringInterval: null, trialDays: null, paymentMode: "test", priceTextOverride: null, visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false,
    showRecentPurchasePopup: false, access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null }, advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" },
    checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "", linkUrl: "" } }, booking: null, projectTemplates: [], communityAccess: [],
  });

  const checkoutBlock = (id: string, configId = "") => ({ type: "CheckoutBlock", props: { id, checkoutConfigId: configId, presentation: DEFAULT_CHECKOUT_PRESENTATION } });
  const heading = (id: string, text: string) => ({ type: "Heading", props: { id, text } });
  const tree = (content: unknown[]) => ({ root: { props: {} }, content, zones: {} });
  const mkPage = async (id: string, content: unknown[], extra: Record<string, unknown> = {}) =>
    db.doc(`pages/${id}`).set({
      name: `Page ${id}`, slug: `page-${id}`, pageType: "sales", goal: "sales", status: "draft", origin: "blank", funnelId: null, blocks: [], seo: { title: "", description: "", ogImage: "" },
      templateId: null, agencyId: AG, subAccountId: SA, createdByUid: ADMIN, createdAt: new Date(), updatedAt: new Date(), publishedAt: null,
      puckDraftData: encodePuckData(tree(content) as never), puckDraftPopups: {}, ...extra,
    });
  const draftOf = async (pageId: string) => readStoredPuckData((await db.doc(`pages/${pageId}`).get()).get("puckDraftData"));
  const pagesCount = async () => (await db.collection("pages").where("subAccountId", "==", SA).get()).size;

  await mkPage("plainSrc", [heading("h1", "Welcome")], { status: "published" });
  await db.doc("pages/plainSrc/versions/v1").set({ pageId: "plainSrc", subAccountId: SA, reason: "manual", createdAtMs: 1 });
  await mkPage("foreignPage", [heading("h1", "Nope")], { subAccountId: SA2, agencyId: "agOther" });

  // Funnel A has a legacy hosted Checkout step with a configured Offer.
  const { funnel: A } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Funnel A", withCheckoutStep: true } });
  const legacyCheckout = (await funnels.listSteps(A.id))[0];
  await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: A.id, stepId: legacyCheckout.id, uid: ADMIN, body: { primaryOfferId: "offerPF", format: "two_step", couponsEnabled: true, postPurchase: { type: "funnel_next_step" } } });
  const { funnel: B } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Funnel B" } });

  console.log("\nAdd a page");
  await check("blank → a new draft page step in this funnel, no history", async () => {
    const before = await pagesCount();
    const res = await stepsRoute.POST(req(ADMIN, { source: "blank", name: "Sales Page" }), { params: Promise.resolve({ id: SA, funnelId: B.id }) });
    assert.equal(res.status, 201);
    const { step, notes } = (await res.json()) as { step: { id: string; type: string; pageId: string; name: string }; notes: string[] };
    assert.equal(step.type, "page");
    assert.equal(step.name, "Sales Page");
    assert.deepEqual(notes, []);
    const page = (await db.doc(`pages/${step.pageId}`).get()).data()!;
    assert.equal(page.subAccountId, SA);
    assert.equal(page.status, "draft");
    assert.equal(page.publishedAt, null);
    assert.equal((await db.collection(`pages/${step.pageId}/versions`).get()).size, 0);
    assert.equal(await pagesCount(), before + 1, "exactly one page created");
  });
  await check("blank needs a name; nothing is created", async () => {
    const before = await pagesCount();
    await assert.rejects(funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "blank", name: "  " } }), isErr(400));
    assert.equal(await pagesCount(), before);
  });
  await check("existing → explicit DRAFT copy; original unchanged; no copied versions", async () => {
    const original = (await db.doc("pages/plainSrc").get()).data()!;
    const { step } = await funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "existing", pageId: "plainSrc" } });
    assert.notEqual(step.pageId, "plainSrc");
    assert.equal(step.type, "page");
    const copy = (await db.doc(`pages/${step.pageId}`).get()).data()!;
    assert.equal(copy.status, "draft");
    assert.equal(copy.funnelId, null);
    assert.match(copy.name, /\(Copy\)$/);
    assert.equal((await db.collection(`pages/${step.pageId}/versions`).get()).size, 0);
    const after = (await db.doc("pages/plainSrc").get()).data()!;
    assert.equal(after.status, "published");
    assert.deepEqual(after.puckDraftData, original.puckDraftData);
    assert.equal((await db.collection("pages/plainSrc/versions").get()).size, 1);
  });
  await check("existing page with a Checkout block → this funnel's checkout page with its OWN blank settings", async () => {
    await mkPage("salesWithCheckout", [heading("h1", "Buy"), checkoutBlock("cb1", legacyCheckout.checkoutConfigId!)]);
    const { step, notes } = await funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "existing", pageId: "salesWithCheckout" } });
    assert.equal(step.type, "checkout");
    assert.equal(step.checkoutConfigId, `step_${step.id}`);
    const cfg = await configs.getCheckoutConfigDoc(step.checkoutConfigId!);
    assert.equal(cfg?.primaryOfferId, null, "another funnel's Offer is never inherited");
    assert.deepEqual(cfg?.context, { type: "funnel_step", funnelId: B.id, stepId: step.id });
    const draft = await draftOf(step.pageId!);
    const props = (draft!.content as Array<{ type: string; props: { checkoutConfigId: string } }>).find((b) => b.type === "CheckoutBlock")!.props;
    assert.equal(props.checkoutConfigId, "", "the copy's block is made automatic (its own checkout)");
    const src = await draftOf("salesWithCheckout");
    assert.equal((src!.content as Array<{ type: string; props: { checkoutConfigId: string } }>)[1].props.checkoutConfigId, legacyCheckout.checkoutConfigId, "original untouched");
    assert.ok(notes.some((n) => /Checkout block/.test(n)));
    // The block on this page resolves through the page's own step.
    const resolved = await resolver.resolveCheckoutBlocks({ id: step.pageId!, subAccountId: SA }, ["auto"], "editor");
    assert.equal(resolved.auto?.connection.stepId, step.id);
  });
  await check("a page with two Checkout blocks is added with a warning note", async () => {
    await mkPage("twoCheckouts", [checkoutBlock("a"), checkoutBlock("b")]);
    const { step, notes } = await funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "existing", pageId: "twoCheckouts" } });
    assert.equal(step.type, "checkout");
    assert.ok(notes.some((n) => /2 Checkout blocks/.test(n)));
  });
  await check("template → independent draft page; template unchanged; Checkout block automatic", async () => {
    await mkPage("tplSource", [heading("h1", "Template me"), checkoutBlock("cbT", legacyCheckout.checkoutConfigId!)]);
    const t = await templates.savePageAsTemplate({ subAccountId: SA, uid: ADMIN, pageId: "tplSource", name: "Launch template", description: "", requestId: "req-pf-0001" });
    const tplBefore = (await db.collection("pageTemplates").doc(t.id).get()).data() ?? null;
    const { step } = await funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "template", templateId: t.id, name: "From template" } });
    assert.equal(step.type, "checkout");
    const page = (await db.doc(`pages/${step.pageId}`).get()).data()!;
    assert.equal(page.status, "draft");
    assert.equal(page.templateId, t.id);
    assert.equal((await db.collection(`pages/${step.pageId}/versions`).get()).size, 0);
    if (tplBefore) assert.deepEqual((await db.collection("pageTemplates").doc(t.id).get()).data(), tplBefore);
  });
  await check("template that doesn't exist → refused, nothing created", async () => {
    const before = await pagesCount();
    await assert.rejects(funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "template", templateId: "nope123", name: "x" } }), isErr(404));
    assert.equal(await pagesCount(), before);
  });
  await check("another workspace's page / funnel is refused", async () => {
    await assert.rejects(funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "existing", pageId: "foreignPage" } }), isErr(400));
    await assert.rejects(funnels.addPageStep({ subAccountId: SA2, funnelId: B.id, uid: ADMIN, body: { source: "blank", name: "x" } }), isErr(404));
  });
  await check("unknown source refused; collaborator (non-admin) gets 403 from the route", async () => {
    await assert.rejects(funnels.addPageStep({ subAccountId: SA, funnelId: B.id, uid: ADMIN, body: { source: "magic" } }), isErr(400));
    const res = await stepsRoute.POST(req(COLLAB, { source: "blank", name: "x" }), { params: Promise.resolve({ id: SA, funnelId: B.id }) });
    assert.equal(res.status, 403);
  });
  await check("30-step limit is checked BEFORE a page is made", async () => {
    const { funnel: full } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Full" } });
    const batch = db.batch();
    for (let i = 0; i < 30; i++) batch.set(db.collection(`funnels/${full.id}/steps`).doc(), { funnelId: full.id, subAccountId: SA, name: `s${i}`, type: "page", order: i, pageId: null, checkoutConfigId: null, createdAt: i, updatedAt: i });
    await batch.commit();
    const before = await pagesCount();
    await assert.rejects(funnels.addPageStep({ subAccountId: SA, funnelId: full.id, uid: ADMIN, body: { source: "blank", name: "x" } }), isErr(400));
    assert.equal(await pagesCount(), before);
  });
  await check("legacy typed steps still work (no `source`)", async () => {
    const res = await stepsRoute.POST(req(ADMIN, { type: "thank_you", name: "Thanks" }), { params: Promise.resolve({ id: SA, funnelId: B.id }) });
    assert.equal(res.status, 201);
    assert.equal(((await res.json()) as { step: { type: string } }).step.type, "thank_you");
  });

  console.log("\nPage roles");
  // Funnel A: Sales page (ordinary page step) whose block shows the legacy hosted Checkout step.
  await mkPage("salesA", [heading("h1", "Sales"), checkoutBlock("cbA")]);
  await mkPage("upA", [heading("h1", "VIP")]);
  const salesA = await funnels.addStep({ subAccountId: SA, funnelId: A.id, uid: ADMIN, body: { type: "page", name: "Sales", pageId: "salesA" } });
  const vipA = await funnels.addStep({ subAccountId: SA, funnelId: A.id, uid: ADMIN, body: { type: "page", name: "VIP", pageId: "upA" } });
  const thanksA = await funnels.addStep({ subAccountId: SA, funnelId: A.id, uid: ADMIN, body: { type: "thank_you", name: "Thanks", pageId: "plainSrc" } });
  await funnels.reorderSteps(SA, A.id, [salesA.id, legacyCheckout.id, vipA.id, thanksA.id]);

  await check("before: the sales page's block sells through the separate Checkout step (the old 'hidden step')", async () => {
    const r = await resolver.resolveCheckoutBlocks({ id: "salesA", subAccountId: SA }, ["auto"], "editor");
    assert.equal(r.auto?.connection.stepId, legacyCheckout.id);
  });
  await check("role refused on a live funnel", async () => {
    await db.doc(`funnels/${A.id}`).update({ status: "published" });
    await assert.rejects(funnels.setStepRole(SA, A.id, salesA.id, "checkout", ADMIN), isErr(409, "funnel_published"));
    await db.doc(`funnels/${A.id}`).update({ status: "draft" });
  });
  await check("checkout role: the page's own step becomes the checkout; settings carried; no hidden step needed", async () => {
    const res = await stepRoute.PATCH(req(ADMIN, { role: "checkout" }, "PATCH"), { params: Promise.resolve({ id: SA, funnelId: A.id, stepId: salesA.id }) });
    assert.equal(res.status, 200);
    const { step, notes } = (await res.json()) as { step: { type: string; checkoutConfigId: string }; notes: string[] };
    assert.equal(step.type, "checkout");
    const cfg = await configs.getCheckoutConfigDoc(step.checkoutConfigId);
    assert.equal(cfg?.primaryOfferId, "offerPF", "Offer carried from the page's previous checkout");
    assert.equal(cfg?.format, "two_step");
    assert.equal(cfg?.couponsEnabled, true);
    assert.deepEqual(cfg?.context, { type: "funnel_step", funnelId: A.id, stepId: salesA.id }, "orders + analytics belong to the page's own step");
    assert.ok(notes.some((n) => /copied from “Checkout”/.test(n)));
    const r = await resolver.resolveCheckoutBlocks({ id: "salesA", subAccountId: SA }, ["auto"], "editor");
    assert.equal(r.auto?.connection.stepId, salesA.id);
    assert.ok(r.auto?.view, "the block renders a checkout");
    // "After purchase → next step" now counts from the SALES page's position.
    const steps = await funnels.listSteps(A.id);
    assert.equal(steps[steps.findIndex((s) => s.id === salesA.id) + 1].id, legacyCheckout.id);
    // The legacy Checkout step is untouched (the creator may remove it).
    const legacyCfg = await configs.getCheckoutConfigDoc(legacyCheckout.checkoutConfigId!);
    assert.equal(legacyCfg?.primaryOfferId, "offerPF");
  });
  await check("checkout role is idempotent; other roles refused once set", async () => {
    const again = await funnels.setStepRole(SA, A.id, salesA.id, "checkout", ADMIN);
    assert.equal(again.step.type, "checkout");
    await assert.rejects(funnels.setStepRole(SA, A.id, salesA.id, "offer", ADMIN), isErr(409, "role_set"));
    await assert.rejects(funnels.setStepRole(SA, A.id, salesA.id, "bogus", ADMIN), isErr(400));
  });
  await check("analytics: page views of the checkout page attribute to that same step", async () => {
    await db.doc(`funnels/${A.id}`).update({ status: "published" });
    await db.doc("pages/salesA").update({ status: "published" });
    const ctx = await analytics.publicFunnelStepForPage("salesA");
    assert.equal(ctx?.step.id, salesA.id);
    assert.equal(ctx?.step.type, "checkout");
    await db.doc(`funnels/${A.id}`).update({ status: "draft" });
  });
  await check("offer role: page step becomes a one-click offer step with next-step routes", async () => {
    const { step } = await funnels.setStepRole(SA, A.id, vipA.id, "offer", ADMIN);
    assert.equal(step.type, "upsell");
    assert.deepEqual(step.routing, { accept: { type: "funnel_next_step" }, decline: { type: "funnel_next_step" } });
    const stored = (await db.doc(`funnels/${A.id}/steps/${vipA.id}`).get()).data()!;
    assert.equal(stored.offer, undefined, "no Offer chosen automatically");
  });
  await check("offer role refused when the page is shared with another step", async () => {
    const { funnel: C } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Funnel C" } });
    const shared = await funnels.addStep({ subAccountId: SA, funnelId: C.id, uid: ADMIN, body: { type: "page", name: "Shared", pageId: "plainSrc" } });
    await assert.rejects(funnels.setStepRole(SA, C.id, shared.id, "offer", ADMIN), isErr(409, "page_in_use"));
  });

  console.log("\nMove to another funnel");
  await check("preview writes nothing and lists consequences", async () => {
    // VIP routes to Thanks on decline → moving Thanks must reroute it.
    await funnels.updateStep(SA, A.id, vipA.id, { routing: { accept: { type: "funnel_next_step" }, decline: { type: "funnel_step", stepId: thanksA.id } } });
    const before = (await funnels.listSteps(A.id)).map((s) => s.id);
    const res = await moveRoute.POST(req(ADMIN, { targetFunnelId: B.id }), { params: Promise.resolve({ id: SA, funnelId: A.id, stepId: thanksA.id }) });
    assert.equal(res.status, 200);
    const { preview } = (await res.json()) as { preview: { blockers: string[]; warnings: string[] } };
    assert.deepEqual(preview.blockers, []);
    assert.ok(preview.warnings.some((w) => /routes will go to the next step/.test(w)));
    assert.deepEqual((await funnels.listSteps(A.id)).map((s) => s.id), before);
  });
  await check("payment pages can't be moved (checkout / offer)", async () => {
    const p1 = await funnels.moveStepToFunnel({ subAccountId: SA, funnelId: A.id, stepId: salesA.id, uid: ADMIN, body: { targetFunnelId: B.id } });
    assert.ok("preview" in p1 && p1.preview.blockers.length === 1);
    await assert.rejects(funnels.moveStepToFunnel({ subAccountId: SA, funnelId: A.id, stepId: vipA.id, uid: ADMIN, body: { targetFunnelId: B.id, confirm: true } }), isErr(409, "move_blocked"));
  });
  await check("same funnel / foreign funnel refused", async () => {
    const same = await funnels.moveStepToFunnel({ subAccountId: SA, funnelId: A.id, stepId: thanksA.id, uid: ADMIN, body: { targetFunnelId: A.id } });
    assert.ok("preview" in same && same.preview.blockers.some((b) => /already in this funnel/.test(b)));
    const { funnel: foreign } = await funnels.createFunnel({ subAccountId: SA2, uid: "x", body: { name: "Foreign" } });
    await assert.rejects(funnels.moveStepToFunnel({ subAccountId: SA, funnelId: A.id, stepId: thanksA.id, uid: ADMIN, body: { targetFunnelId: foreign.id, confirm: true } }), isErr(404));
  });
  await check("move keeps the page itself, repairs routes and after-purchase, preserves other checkout settings", async () => {
    // The (legacy) checkout sends buyers to Thanks after purchase.
    const legacyCfgBefore = await configs.getCheckoutConfigDoc(legacyCheckout.checkoutConfigId!);
    await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: A.id, stepId: legacyCheckout.id, uid: ADMIN, body: { primaryOfferId: "offerPF", format: "two_step", couponsEnabled: true, postPurchase: { type: "funnel_step", stepId: thanksA.id } } });
    const bCountBefore = (await funnels.listSteps(B.id)).length;
    const pagesBefore = await pagesCount();
    const res = await moveRoute.POST(req(ADMIN, { targetFunnelId: B.id, confirm: true }), { params: Promise.resolve({ id: SA, funnelId: A.id, stepId: thanksA.id }) });
    assert.equal(res.status, 200);
    const out = (await res.json()) as { moved: boolean; step: { pageId: string; type: string } };
    assert.equal(out.moved, true);
    assert.equal(out.step.pageId, "plainSrc", "same page, not a copy");
    assert.equal(out.step.type, "thank_you");
    assert.equal(await pagesCount(), pagesBefore, "no page created");
    assert.ok(!(await funnels.listSteps(A.id)).some((s) => s.id === thanksA.id), "removed from the source funnel");
    const bSteps = await funnels.listSteps(B.id);
    assert.equal(bSteps.length, bCountBefore + 1);
    assert.equal(bSteps[bSteps.length - 1].pageId, "plainSrc");
    const vip = (await db.doc(`funnels/${A.id}/steps/${vipA.id}`).get()).data()!;
    assert.deepEqual(vip.routing.decline, { type: "funnel_next_step" });
    const cfg = await configs.getCheckoutConfigDoc(legacyCheckout.checkoutConfigId!);
    assert.deepEqual(cfg?.postPurchase, { type: "funnel_next_step" });
    assert.equal(cfg?.primaryOfferId, "offerPF", "the Offer survives the route repair");
    assert.equal(cfg?.format, "two_step");
    assert.equal(cfg?.couponsEnabled, true);
    assert.ok(legacyCfgBefore);
  });
  await check("moving a page the destination already uses is refused", async () => {
    const again = await funnels.addStep({ subAccountId: SA, funnelId: A.id, uid: ADMIN, body: { type: "page", name: "Again", pageId: "plainSrc" } });
    const r = await funnels.moveStepToFunnel({ subAccountId: SA, funnelId: A.id, stepId: again.id, uid: ADMIN, body: { targetFunnelId: B.id } });
    assert.ok("preview" in r && r.preview.blockers.some((b) => /already uses this page/.test(b)));
  });

  console.log("\nOne Checkout block per page");
  await check("publishing two Checkout blocks is refused; one is fine", async () => {
    await mkPage("pubTest", [heading("h1", "x")]);
    const two = await puck.publishPuckPage(SA, "pubTest", tree([checkoutBlock("a"), checkoutBlock("b")]) as never, {});
    assert.equal(two.ok, false);
    assert.match((two as { error: string }).error, /more than one Checkout block/);
    assert.equal((await db.doc("pages/pubTest").get()).get("status"), "draft");
    const one = await puck.publishPuckPage(SA, "pubTest", tree([heading("h1", "x"), checkoutBlock("a")]) as never, {});
    assert.equal(one.ok, true, JSON.stringify(one));
    assert.equal(countCheckoutBlocks(await draftOf("pubTest")), 1);
  });
  await check("drafts may still hold two while the creator rearranges", async () => {
    const r = await puck.savePuckDraft(SA, "pubTest", tree([checkoutBlock("a"), checkoutBlock("b")]) as never, {});
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  console.log("\nPublishing safeguards (pages + destinations; never auto-publishes pages)");
  const { readFileSync } = await import("node:fs");
  const orders = await import("../src/lib/server/checkout/order-service");
  const publish = (funnelId: string) => funnels.updateFunnel(SA, funnelId, { status: "published" });
  const statusOf = async (path: string) => (await db.doc(path).get()).get("status");
  const hostedCheckout = async (funnelId: string, postPurchase: Record<string, unknown> = { type: "space" }) => {
    const step = await funnels.addStep({ subAccountId: SA, funnelId, uid: ADMIN, body: { type: "checkout", name: "Checkout" } });
    await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId, stepId: step.id, uid: ADMIN, body: { primaryOfferId: "offerPF", format: "two_step", couponsEnabled: true, postPurchase } });
    return step;
  };
  await mkPage("pubLanding", [heading("h1", "Landing")], { status: "published" });
  await mkPage("draftLanding", [heading("h1", "Draft landing")]);
  await mkPage("draftSales", [heading("h1", "Sales"), checkoutBlock("cb")]);
  await mkPage("draftAfter", [heading("h1", "After")]);
  await mkPage("draftOrphan", [heading("h1", "Orphan")]);
  await mkPage("draftOffer", [heading("h1", "Offer")]);

  await check("a draft page buyers would reach blocks publishing, with a plain summary; the page stays a draft", async () => {
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Safeguard 1" } });
    await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "page", name: "Landing", pageId: "draftLanding" } });
    await hostedCheckout(F.id);
    const hub = await funnels.getFunnelHub(SA, F.id);
    const issue = hub.issues.find((i) => i.code === "page_unpublished");
    assert.equal(issue?.level, "error");
    await assert.rejects(publish(F.id), (e: unknown) => isErr(409, "funnel_invalid")(e) && /1 page in this funnel isn't published yet\. Publish that page before making the funnel available to visitors\./.test((e as Error).message));
    assert.equal(await statusOf(`funnels/${F.id}`), "draft");
    assert.equal(await statusOf("pages/draftLanding"), "draft", "publishing a funnel never publishes its pages");
  });
  await check("a valid funnel (published page + hosted checkout) still publishes", async () => {
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Safeguard ok" } });
    await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "page", name: "Landing", pageId: "pubLanding" } });
    await hostedCheckout(F.id);
    assert.deepEqual((await funnels.getFunnelHub(SA, F.id)).issues.filter((i) => i.level === "error"), []);
    await publish(F.id);
    assert.equal(await statusOf(`funnels/${F.id}`), "published");
  });
  await check("a deleted page and a missing page block publishing", async () => {
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Safeguard 2" } });
    await mkPage("goneSoon", [heading("h1", "Gone")], { status: "published" });
    await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "page", name: "Landing", pageId: "goneSoon" } });
    await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "page", name: "No page yet" } });
    await db.doc("pages/goneSoon").delete();
    const codes = (await funnels.getFunnelHub(SA, F.id)).issues.filter((i) => i.level === "error").map((i) => i.code).sort();
    assert.deepEqual(codes, ["no_page", "page_missing"]);
    await assert.rejects(publish(F.id), isErr(409, "funnel_invalid"));
  });
  await check("a checkout step that shows a DRAFT sales page blocks publishing", async () => {
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Safeguard 3" } });
    const { step } = await funnels.addPageStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { source: "existing", pageId: "draftSales" } });
    const stored = (await funnels.listSteps(F.id)).find((s) => s.id === step.id)!;
    assert.equal(stored.type, "checkout");
    const issue = (await funnels.getFunnelHub(SA, F.id)).issues.find((i) => i.stepId === step.id && i.code === "page_unpublished");
    assert.equal(issue?.level, "error");
    await assert.rejects(publish(F.id), isErr(409, "funnel_invalid"));
  });
  await check("after purchase → a draft page outside the funnel blocks publishing", async () => {
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Safeguard 4" } });
    const step = await hostedCheckout(F.id, { type: "page", pageId: "draftAfter" });
    const issue = (await funnels.getFunnelHub(SA, F.id)).issues.find((i) => i.stepId === step.id && i.code === "destination_unavailable");
    assert.equal(issue?.level, "error");
    assert.match(issue!.message, /isn't published yet/);
    await assert.rejects(publish(F.id), isErr(409, "funnel_invalid"));
    assert.equal(await statusOf("pages/draftAfter"), "draft");
  });
  await check("a draft page nobody is sent to is a warning, not a blocker", async () => {
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Safeguard 5" } });
    await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "page", name: "Landing", pageId: "pubLanding" } });
    await hostedCheckout(F.id, { type: "space" });
    await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "page", name: "Orphan", pageId: "draftOrphan" } });
    const issues = (await funnels.getFunnelHub(SA, F.id)).issues;
    assert.equal(issues.find((i) => i.code === "page_unpublished")?.level, "warning");
    await publish(F.id);
  });
  await check("a reachable one-click offer page blocks publishing while charging is off (never trapped, never skipped)", async () => {
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Safeguard 6" } });
    await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "page", name: "Landing", pageId: "pubLanding" } });
    await hostedCheckout(F.id, { type: "funnel_next_step" });
    const up = await funnels.addStep({ subAccountId: SA, funnelId: F.id, uid: ADMIN, body: { type: "upsell", name: "Upgrade", pageId: "draftOffer" } });
    const issues = (await funnels.getFunnelHub(SA, F.id)).issues.filter((i) => i.stepId === up.id);
    const off = issues.find((i) => i.code === "offer_charging_off");
    assert.equal(off?.level, "error");
    assert.match(off!.message, /one-click offers aren't switched on for this workspace yet.*Remove this step or send buyers somewhere else/);
    assert.equal(issues.find((i) => i.code === "offer_missing")?.level, "error", "no Offer on a reachable offer step blocks too");
    assert.equal(issues.find((i) => i.code === "page_unpublished")?.level, "error", "its draft page still blocks");
    await assert.rejects(funnels.updateFunnel(SA, F.id, { status: "published" }), (e: unknown) => (e as { status?: number }).status === 409);
    assert.equal((await db.doc(`funnels/${F.id}`).get()).data()!.status, "draft");
    // Send buyers somewhere else after checkout → the offer step is unreachable → warnings only.
    const co = (await funnels.getFunnelHub(SA, F.id)).steps.find((s) => s.type === "checkout")!;
    await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: F.id, stepId: co.id, uid: ADMIN, body: { postPurchase: { type: "space" } } });
    const after = (await funnels.getFunnelHub(SA, F.id)).issues.filter((i) => i.stepId === up.id);
    assert.equal(after.find((i) => i.code === "offer_charging_off")?.level, "warning");
    assert.ok(!after.some((i) => i.level === "error" && i.code.startsWith("offer_")));
  });
  await check("ordinary checkout is never gated by the post-purchase switch", async () => {
    for (const f of ["src/lib/server/checkout/order-service.ts", "src/lib/server/checkout/config-service.ts", "src/lib/server/page-checkout-resolver.ts"]) {
      assert.ok(!/funnelPostPurchaseCharging|COMMERCE_CAPABILITIES/.test(readFileSync(f, "utf8")), `${f} must not read the post-purchase switch`);
    }
    // A published funnel's checkout resolves for buyers with the switch off.
    const { funnel: F } = await funnels.createFunnel({ subAccountId: SA, uid: ADMIN, body: { name: "Ordinary checkout" } });
    const step = await hostedCheckout(F.id);
    await publish(F.id);
    const cfgId = (await funnels.listSteps(F.id)).find((s) => s.id === step.id)!.checkoutConfigId!;
    const r = await orders.resolveCheckout(cfgId);
    assert.equal(r.primary.id, "offerPF");
    assert.equal(r.config.couponsEnabled, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
