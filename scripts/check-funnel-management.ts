/**
 * Funnel Phase 2 — service checks against the Firestore EMULATOR: routing
 * saves, loop refusal, page exclusivity for Upsell / Downsell, independent
 * page copies, step duplication (incl. Checkout), rerouting on removal,
 * publish validation, the 30-step limit and workspace isolation. No network,
 * no production credentials.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-funnels \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-funnel-management.ts"
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
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "STRIPE_SECRET_KEY"]) delete process.env[k];

const SA = "sa_funnels";
const SA2 = "sa_other";
const AG = "ag_funnels";
const UID = "admin_uid";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}

async function main() {
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const funnels = await import("../src/lib/server/checkout/funnels-service");
  const configs = await import("../src/lib/server/checkout/config-service");
  const { CheckoutError } = await import("../src/lib/server/checkout/common");
  const db = getAdminDb();
  const isErr = (status: number, code?: string) => (e: unknown) => e instanceof CheckoutError && e.status === status && (!code || e.code === code);

  await db.doc(`subAccounts/${SA}`).set({ name: "Funnels QA", agencyId: AG });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: "ag_other" });
  const page = (id: string, sa = SA, status = "published") =>
    db.doc(`pages/${id}`).set({ name: id, slug: id, pageType: "sales", goal: "sales", status, origin: "blank", funnelId: null, blocks: [], seo: {}, templateId: null, agencyId: sa === SA ? AG : "ag_other", subAccountId: sa, createdByUid: UID, createdAt: new Date(), updatedAt: new Date(), publishedAt: null, puckDraftData: { content: [], root: { props: {} } } });
  for (const id of ["pg_sales", "pg_up", "pg_down", "pg_ty", "pg_shared"]) await page(id);
  await page("pg_foreign", SA2);
  await db.doc(`subAccounts/${SA}/courseOffers/offer1`).set({
    subAccountId: SA, agencyId: AG, title: "QA Offer", slug: "qa-offer", descriptionHtml: "", courseIds: [], type: "oneTime", priceCents: 5000, currency: "USD",
    recurringInterval: null, trialDays: null, paymentMode: "test", priceTextOverride: null, visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false,
    showRecentPurchasePopup: false, access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null }, advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" },
    checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "", linkUrl: "" } }, booking: null, projectTemplates: [], communityAccess: [],
  });

  const { funnel } = await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "QA Launch", withCheckoutStep: true } });
  const F = funnel.id;
  const co = (await funnels.listSteps(F))[0];
  const sales = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "page", name: "Sales", pageId: "pg_sales" } });
  const up = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "upsell", name: "VIP", pageId: "pg_up" } });
  const down = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "downsell", name: "Workbook", pageId: "pg_down" } });
  const ty = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "thank_you", name: "Thanks", pageId: "pg_ty" } });
  await funnels.reorderSteps(SA, F, [sales.id, co.id, up.id, down.id, ty.id]);
  await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: F, stepId: co.id, uid: UID, body: { primaryOfferId: "offer1", postPurchase: { type: "funnel_next_step" } } });

  console.log("\nRouting");
  await check("new upsell starts with next-step routes", async () => {
    assert.deepEqual(up.routing, { accept: { type: "funnel_next_step" }, decline: { type: "funnel_next_step" } });
  });
  await check("save Accept → Thanks, Decline → Workbook", async () => {
    const s = await funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_step", stepId: down.id } } });
    assert.equal(s.routing?.accept.type === "funnel_step" && s.routing.accept.stepId, ty.id);
  });
  await check("routing on a Page step is refused", async () => {
    await assert.rejects(funnels.updateStep(SA, F, sales.id, { routing: { accept: { type: "funnel_next_step" }, decline: { type: "funnel_next_step" } } }), isErr(400));
  });
  await check("self route refused", async () => {
    await assert.rejects(funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: up.id }, decline: { type: "funnel_next_step" } } }), isErr(400, "routing_invalid"));
  });
  await check("route to a step in another funnel refused", async () => {
    const other = await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "Other", withCheckoutStep: true } });
    await assert.rejects(funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: other.steps[0].id }, decline: { type: "funnel_next_step" } } }), isErr(400, "routing_invalid"));
  });
  await check("looping route refused (downsell decline → sales page)", async () => {
    await assert.rejects(funnels.updateStep(SA, F, down.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_step", stepId: sales.id } } }), isErr(400, "routing_invalid"));
  });
  await check("checkout post-purchase that loops is refused by Checkout settings too", async () => {
    // Sales (step 1) → Checkout → Sales again would loop.
    await assert.rejects(
      configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: F, stepId: co.id, uid: UID, body: { primaryOfferId: "offer1", postPurchase: { type: "funnel_step", stepId: sales.id } } }),
      (e: unknown) => e instanceof CheckoutError && !!e.fields?.postPurchase && /loop/.test(e.fields.postPurchase),
    );
  });
  await check("reorder that would loop is refused (409); valid reorder works", async () => {
    // Make down decline → up and up decline → next; order up, down puts up→down→up in a loop.
    await funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_step", stepId: ty.id } } });
    await funnels.updateStep(SA, F, down.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_step", stepId: up.id } } });
    await funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_next_step" } } }).catch(() => undefined);
    const steps = await funnels.listSteps(F);
    const upNow = steps.find((s) => s.id === up.id)!;
    // With up before down, up's "next" decline would loop → the save above was refused, so up still declines → ty.
    assert.equal(upNow.routing?.decline.type, "funnel_step");
    // Put down before up: down → up is fine (up never comes back).
    await funnels.reorderSteps(SA, F, [sales.id, co.id, down.id, up.id, ty.id]);
    // Now set up's decline to next (ty) — fine in this order.
    await funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_next_step" } } });
    // Moving up back before down would make up →(next) down →(decline) up: refused.
    await assert.rejects(funnels.reorderSteps(SA, F, [sales.id, co.id, up.id, down.id, ty.id]), isErr(409, "routing_loop"));
    await funnels.reorderSteps(SA, F, [sales.id, co.id, down.id, up.id, ty.id]);
  });
  await check("stale reorder list still refused with 409 (concurrency protection)", async () => {
    await assert.rejects(funnels.reorderSteps(SA, F, [sales.id, co.id]), isErr(409));
  });

  console.log("\nPages");
  await check("an upsell can't share its page with another step (409 page_in_use)", async () => {
    await assert.rejects(funnels.updateStep(SA, F, ty.id, { pageId: "pg_up" }, UID), isErr(409, "page_in_use"));
    await assert.rejects(funnels.updateStep(SA, F, down.id, { pageId: "pg_sales" }, UID), isErr(409, "page_in_use"));
  });
  await check("ordinary pages can still be reused by page steps", async () => {
    const extra = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "page", name: "Reuse", pageId: "pg_sales" } });
    assert.equal(extra.pageId, "pg_sales");
    await funnels.deleteStep(SA, F, extra.id);
  });
  await check("copyPage assigns an independent draft copy", async () => {
    const s = await funnels.updateStep(SA, F, down.id, { pageId: "pg_sales", copyPage: true }, UID);
    assert.notEqual(s.pageId, "pg_sales");
    const copy = (await db.doc(`pages/${s.pageId}`).get()).data()!;
    assert.equal(copy.subAccountId, SA);
    assert.equal(copy.status, "draft");
    assert.match(copy.name, /\(Copy\)$/);
    await funnels.updateStep(SA, F, down.id, { pageId: "pg_down" }, UID);
  });
  await check("a page from another workspace is refused", async () => {
    await assert.rejects(funnels.updateStep(SA, F, sales.id, { pageId: "pg_foreign" }, UID), isErr(400));
  });
  await check("hub reports a shared upsell page as a warning (existing data is never rewritten)", async () => {
    await db.doc(`funnels/${F}/steps/${ty.id}`).update({ pageId: "pg_up" }); // simulate older data
    const hub = await funnels.getFunnelHub(SA, F);
    assert.ok(hub.issues.some((i) => i.code === "page_shared" && i.stepId === up.id && i.level === "warning"));
    assert.equal((await db.doc(`funnels/${F}/steps/${ty.id}`).get()).data()!.pageId, "pg_up");
    await db.doc(`funnels/${F}/steps/${ty.id}`).update({ pageId: "pg_ty" });
  });

  console.log("\nDuplicate & Use (explicit copies only)");
  const pageCount = async () => (await db.collection("pages").where("subAccountId", "==", SA).get()).size;
  await check("refusing a restricted page creates no copy", async () => {
    const before = await pageCount();
    await assert.rejects(funnels.updateStep(SA, F, down.id, { pageId: "pg_up" }, UID), isErr(409, "page_in_use"));
    await assert.rejects(funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "downsell", pageId: "pg_up" } }), isErr(409, "page_in_use"));
    assert.equal(await pageCount(), before);
  });
  await check("a page an upsell uses can't be reused by a Page step without a copy", async () => {
    await assert.rejects(funnels.updateStep(SA, F, sales.id, { pageId: "pg_up" }, UID), isErr(409, "page_in_use"));
  });
  await check("Duplicate & Use: copy assigned, original unchanged and still on its step", async () => {
    const before = await pageCount();
    const s = await funnels.updateStep(SA, F, down.id, { pageId: "pg_up", copyPage: true }, UID);
    assert.notEqual(s.pageId, "pg_up");
    assert.equal(await pageCount(), before + 1);
    assert.equal((await funnels.listSteps(F)).find((x) => x.id === up.id)!.pageId, "pg_up");
    // Independent editing: changing the copy never touches the original.
    await db.doc(`pages/${s.pageId}`).update({ name: "Edited copy", puckDraftData: { content: [{ type: "Heading", props: { id: "h1", text: "Changed" } }], root: { props: {} } } });
    const orig = (await db.doc("pages/pg_up").get()).data()!;
    assert.equal(orig.name, "pg_up");
    assert.deepEqual(orig.puckDraftData, { content: [], root: { props: {} } });
    await funnels.updateStep(SA, F, down.id, { pageId: "pg_down" }, UID);
  });
  await check("missing / deleted / other-workspace page: refused, no copy made", async () => {
    const before = await pageCount();
    await assert.rejects(funnels.updateStep(SA, F, down.id, { pageId: "pg_missing", copyPage: true }, UID), isErr(400));
    await assert.rejects(funnels.updateStep(SA, F, down.id, { pageId: "pg_foreign", copyPage: true }, UID), isErr(400));
    await assert.rejects(funnels.updateStep(SA, F, down.id, { pageId: "bad id!", copyPage: true }, UID), (e: unknown) => e instanceof CheckoutError);
    assert.equal(await pageCount(), before);
  });
  await check("failed assignment after the copy is made: copy removed, step unchanged", async () => {
    const before = await pageCount();
    // Same request also sets a looping route → refused after the copy was made.
    await assert.rejects(funnels.updateStep(SA, F, down.id, { pageId: "pg_up", copyPage: true, routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_step", stepId: sales.id } } }, UID), isErr(400, "routing_invalid"));
    assert.equal(await pageCount(), before);
    assert.equal((await funnels.listSteps(F)).find((x) => x.id === down.id)!.pageId, "pg_down");
  });
  await check("two Duplicate & Use requests at once: one wins, exactly one copy kept", async () => {
    const before = await pageCount();
    const results = await Promise.allSettled([
      funnels.updateStep(SA, F, down.id, { pageId: "pg_up", copyPage: true }, UID),
      funnels.updateStep(SA, F, down.id, { pageId: "pg_up", copyPage: true }, UID),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1, `fulfilled ${ok.length}`);
    assert.ok(results.some((r) => r.status === "rejected" && r.reason instanceof CheckoutError && r.reason.code === "step_changed"));
    assert.equal(await pageCount(), before + 1);
    const assigned = (await funnels.listSteps(F)).find((x) => x.id === down.id)!.pageId!;
    assert.ok((await db.doc(`pages/${assigned}`).get()).exists);
    await funnels.updateStep(SA, F, down.id, { pageId: "pg_down" }, UID);
  });
  await check("Duplicate Step requires an explicit page choice when the step has a page", async () => {
    const before = (await funnels.listSteps(F)).length;
    await assert.rejects(funnels.duplicateStep({ subAccountId: SA, funnelId: F, stepId: up.id, uid: UID, pageMode: undefined }), isErr(400));
    assert.equal((await funnels.listSteps(F)).length, before);
  });
  await check("Duplicate Step with “no page” leaves the copy unassigned and makes no page", async () => {
    const before = await pageCount();
    const { step } = await funnels.duplicateStep({ subAccountId: SA, funnelId: F, stepId: up.id, uid: UID, pageMode: "none" });
    assert.equal(step.pageId, null);
    assert.equal(await pageCount(), before);
    await funnels.deleteStep(SA, F, step.id);
  });

  console.log("\nDuplicate");
  await check("duplicate an upsell with a page copy, placed right after it, routing kept", async () => {
    const { step } = await funnels.duplicateStep({ subAccountId: SA, funnelId: F, stepId: up.id, uid: UID, pageMode: "copy" });
    const steps = await funnels.listSteps(F);
    assert.equal(steps[steps.findIndex((s) => s.id === up.id) + 1].id, step.id);
    assert.notEqual(step.pageId, "pg_up");
    assert.equal(step.routing?.accept.type === "funnel_step" && step.routing.accept.stepId, ty.id);
    await funnels.deleteStep(SA, F, step.id);
  });
  await check("upsell duplicate can't reuse the same page", async () => {
    await assert.rejects(funnels.duplicateStep({ subAccountId: SA, funnelId: F, stepId: up.id, uid: UID, pageMode: "same" }), isErr(400, "page_in_use"));
  });
  await check("checkout duplicate gets its own checkout with the same Offer", async () => {
    const { step } = await funnels.duplicateStep({ subAccountId: SA, funnelId: F, stepId: co.id, uid: UID, pageMode: "none" });
    assert.ok(step.checkoutConfigId && step.checkoutConfigId !== co.checkoutConfigId);
    const cfg = await configs.getCheckoutConfigDoc(step.checkoutConfigId!);
    assert.equal(cfg?.primaryOfferId, "offer1");
    assert.equal(cfg?.context.type === "funnel_step" && cfg.context.stepId, step.id);
    await funnels.deleteStep(SA, F, step.id);
    assert.equal(await configs.getCheckoutConfigDoc(step.checkoutConfigId!), null);
  });

  console.log("\nRemove + publish");
  await check("removing a step resets routes that pointed at it to next step", async () => {
    const extra = await funnels.addStep({ subAccountId: SA, funnelId: F, uid: UID, body: { type: "thank_you", name: "Alt thanks" } });
    await funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: extra.id }, decline: { type: "funnel_next_step" } } });
    const { reroutedStepIds } = await funnels.deleteStep(SA, F, extra.id);
    assert.deepEqual(reroutedStepIds, [up.id]);
    const upNow = (await funnels.listSteps(F)).find((s) => s.id === up.id)!;
    assert.deepEqual(upNow.routing?.accept, { type: "funnel_next_step" });
    assert.equal((await db.doc(`pages/pg_ty`).get()).exists, true);
  });
  await check("publishing is blocked while a route is broken, allowed once fixed", async () => {
    await db.doc(`funnels/${F}/steps/${up.id}`).update({ routing: { accept: { type: "funnel_step", stepId: "deletedStep" }, decline: { type: "funnel_next_step" } } });
    await assert.rejects(funnels.updateFunnel(SA, F, { status: "published" }), isErr(409, "funnel_invalid"));
    await funnels.updateStep(SA, F, up.id, { routing: { accept: { type: "funnel_step", stepId: ty.id }, decline: { type: "funnel_next_step" } } });
    assert.equal((await funnels.updateFunnel(SA, F, { status: "published" })).status, "published");
    await funnels.updateFunnel(SA, F, { status: "draft" });
  });
  await check("rename funnel", async () => {
    assert.equal((await funnels.updateFunnel(SA, F, { name: "QA Launch 2" })).name, "QA Launch 2");
  });
  await check("30-step limit (no separate upsell cap)", async () => {
    const big = (await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "Big" } })).funnel.id;
    for (let i = 0; i < 30; i++) await funnels.addStep({ subAccountId: SA, funnelId: big, body: { type: i % 2 ? "upsell" : "downsell" } });
    await assert.rejects(funnels.addStep({ subAccountId: SA, funnelId: big, body: { type: "page" } }), isErr(400));
  });

  console.log("\nIsolation");
  await check("another workspace can't read, edit, duplicate or remove this funnel's steps", async () => {
    await assert.rejects(funnels.getFunnelHub(SA2, F), isErr(404));
    await assert.rejects(funnels.updateStep(SA2, F, up.id, { name: "x" }), isErr(404));
    await assert.rejects(funnels.duplicateStep({ subAccountId: SA2, funnelId: F, stepId: up.id, uid: UID, pageMode: "copy" }), isErr(404));
    await assert.rejects(funnels.deleteStep(SA2, F, up.id), isErr(404));
  });
  await check("archived funnel keeps its record", async () => {
    await funnels.archiveFunnel(SA, F);
    assert.equal((await db.doc(`funnels/${F}`).get()).data()!.status, "archived");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
