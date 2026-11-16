/**
 * Saved Page Templates (2026-11-16) — checks against the Firestore EMULATOR:
 * save (page card + current builder state, drafts and published pages,
 * popups, responsive overrides, duplicate submissions, validation), workspace
 * isolation, create-from-template independence and resets (SEO / tracking,
 * no funnel, no publish state, explicit Checkout made automatic), rename /
 * delete never touching pages, Reading Result pages, the funnel-context
 * Checkout rule (incl. intentional standalone embeds) and the Duplicate Step
 * checkout re-point fix. No network, no production credentials, no payments.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-templates \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-page-templates.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import type { Data } from "@puckeditor/core";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "STRIPE_SECRET_KEY", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "AUTOMATIONS_TOKEN_SECRET"]) delete process.env[k];

const SA = "sa_tpl";
const SA2 = "sa_other";
const AG = "ag_tpl";
const UID = "admin_uid";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}
async function rejects(p: Promise<unknown>, status: number) {
  let err: unknown = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert.ok(err, "expected an error");
  assert.equal((err as { status?: number }).status, status, (err as Error).message);
}

const checkout = (id: string, configId: string) => ({ type: "CheckoutBlock", props: { id, checkoutConfigId: configId } });

function designWith(opts: { configId?: string; formId?: string; title?: string; seo?: boolean }): Data {
  return {
    root: {
      props: opts.seo
        ? { pageSettings: { seoTitle: "Old SEO title", seoDescription: "Old description", socialImage: "https://example.com/social.png", noindex: true, tracking: { metaPixelId: "1234567", ga4Id: "G-ABCDE1", gtmId: "GTM-ABCD12" } } }
        : {},
    },
    content: [
      { type: "Heading", props: { id: "h1", text: opts.title ?? "Grow your list", responsive: { mobile: { fontSize: 28 } } } },
      ...(opts.formId ? [{ type: "Form", props: { id: "f1", formId: opts.formId } }] : []),
      ...(opts.configId !== undefined ? [checkout("c1", opts.configId)] : []),
    ],
  } as unknown as Data;
}

async function main() {
  // ── Pure rules ────────────────────────────────────────────────────────────
  const pure = await import("../src/lib/pages-funnels/page-templates");
  const block = await import("../src/lib/pages-funnels/checkout-block");
  console.log("\nPure rules");
  await check("remapCheckoutConfigIds changes explicit ids only and never mutates the input", () => {
    const d = { content: [checkout("a", "cfgA"), checkout("b", ""), { type: "Section", props: { id: "s", items: [checkout("c", "cfgA")] } }] };
    const before = JSON.stringify(d);
    const r = block.remapCheckoutConfigIds(d, (id) => (id === "cfgA" ? "cfgB" : id));
    assert.equal(r.changed, 2);
    assert.equal(JSON.stringify(d), before);
    assert.deepEqual(block.collectCheckoutKeys(r.data).sort(), ["auto", "cfgB"]);
  });
  await check("a new page from a template: explicit checkout → automatic, SEO / tracking / noindex reset, social image kept", () => {
    const data = designWith({ configId: "cfgA", seo: true });
    const popups = { p1: { id: "p1", name: "Offer", content: { root: { props: {} }, content: [checkout("pc", "cfgA")] }, trigger: { type: "manual" }, style: {} } } as never;
    const r = pure.prepareNewPageFromTemplate(data, popups, "https://example.com/social.png");
    assert.equal(r.clearedCheckouts, 2);
    assert.deepEqual(block.collectCheckoutKeys(r.data), ["auto"]);
    const settings = (r.data.root.props as { pageSettings: Record<string, unknown> }).pageSettings;
    assert.deepEqual(settings, { seoTitle: "", seoDescription: "", socialImage: "https://example.com/social.png", noindex: false, tracking: { metaPixelId: "", ga4Id: "", gtmId: "" } });
    assert.deepEqual(block.collectCheckoutKeys((r.popups as Record<string, { content: unknown }>).p1.content), ["auto"]);
    assert.equal(((data.root.props as { pageSettings: { seoTitle: string } }).pageSettings).seoTitle, "Old SEO title", "input untouched");
  });
  await check("connections summary counts forms, links, offers, checkouts and popups", () => {
    const data = designWith({ configId: "cfgA", formId: "form1" });
    (data.content as unknown[]).push({ type: "Button", props: { id: "b1", action: { type: "page", pageId: "pg_other" } } }, { type: "Button", props: { id: "b2", action: { type: "purchase", offerId: "offer1" } } });
    const c = pure.summarizeTemplateConnections(data, {});
    assert.deepEqual([c.forms, c.pageLinks, c.offers, c.checkouts, c.popups], [1, 1, 1, 1, 0]);
    const note = pure.describeRetainedConnections(c);
    assert.ok(note.kept?.includes("1 form") && note.checkout?.includes("isn't connected to any Offer"));
  });
  await check("name validation", () => {
    assert.ok(pure.templateNameProblem("  "));
    assert.ok(pure.templateNameProblem("x".repeat(61)));
    assert.equal(pure.templateNameProblem("Launch page"), null);
  });
  await check("a page screenshot counts as the current design only when it shows this draft", () => {
    const t = (variant: "draft" | "published", v: number) => ({ url: "https://x/y.jpg", storageKey: "k", variant, sourceVersion: v, capturedAt: v, width: 640, height: 400 });
    const ts = (ms: number) => ({ toMillis: () => ms });
    assert.equal(pure.thumbnailShowsCurrentDesign({ thumbnail: t("draft", 100), status: "draft", puckDraftUpdatedAt: ts(100) as never, puckPublishedAt: null, puckPublishedData: null }), true);
    assert.equal(pure.thumbnailShowsCurrentDesign({ thumbnail: t("draft", 90), status: "draft", puckDraftUpdatedAt: ts(100) as never, puckPublishedAt: null, puckPublishedData: null }), false);
    assert.equal(pure.thumbnailShowsCurrentDesign({ thumbnail: t("published", 100), status: "published", puckDraftUpdatedAt: ts(150) as never, puckPublishedAt: ts(100) as never, puckPublishedData: {} as never }), false);
    assert.equal(pure.thumbnailShowsCurrentDesign({ thumbnail: t("published", 100), status: "published", puckDraftUpdatedAt: ts(100) as never, puckPublishedAt: ts(100) as never, puckPublishedData: {} as never }), true);
  });

  // ── Emulator ──────────────────────────────────────────────────────────────
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const svc = await import("../src/lib/server/pages-funnels/page-template-service");
  const puck = await import("../src/lib/server/pages-funnels-puck-service");
  const funnels = await import("../src/lib/server/checkout/funnels-service");
  const configs = await import("../src/lib/server/checkout/config-service");
  const resolver = await import("../src/lib/server/page-checkout-resolver");
  const { encodePuckData, decodeStoredPuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const { encodePopupMapForStorage, normalizePopupMap } = await import("../src/types/pages-funnels-popup");
  const db = getAdminDb();

  await db.doc(`subAccounts/${SA}`).set({ name: "Templates QA", agencyId: AG });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: "ag_other" });
  await db.doc(`users/${UID}`).set({ displayName: "QA Admin", status: "active" });
  const offer = (id: string) =>
    db.doc(`subAccounts/${SA}/courseOffers/${id}`).set({
      subAccountId: SA, agencyId: AG, title: `Offer ${id}`, slug: id, descriptionHtml: "", courseIds: [], type: "oneTime", priceCents: 5000, currency: "USD",
      recurringInterval: null, trialDays: null, paymentMode: "test", priceTextOverride: null, visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false,
      showRecentPurchasePopup: false, access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null }, advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" },
      checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "", linkUrl: "" } }, booking: null, projectTemplates: [], communityAccess: [],
    });
  await offer("offerA");
  await offer("offerB");
  const page = (id: string, data: Data, extra: Record<string, unknown> = {}, sa = SA) =>
    db.doc(`pages/${id}`).set({
      name: id, slug: id, pageType: "sales", goal: "sales", status: "draft", origin: "blank", funnelId: null, blocks: [], seo: { title: "Legacy", description: "", ogImage: "" }, templateId: null,
      agencyId: sa === SA ? AG : "ag_other", subAccountId: sa, createdByUid: UID, createdAt: new Date(), updatedAt: new Date(), publishedAt: null,
      puckDraftData: encodePuckData(data), puckDraftUpdatedAt: new Date(), ...extra,
    });

  // Funnel A (Offer A) and Funnel B (Offer B); a funnel C with no Checkout step.
  const fa = (await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "Funnel A", withCheckoutStep: true } })).funnel;
  const fb = (await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "Funnel B", withCheckoutStep: true } })).funnel;
  const fc = (await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "Funnel C", withCheckoutStep: false } })).funnel;
  const coA = (await funnels.listSteps(fa.id))[0];
  const coB = (await funnels.listSteps(fb.id))[0];
  await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: fa.id, stepId: coA.id, uid: UID, body: { primaryOfferId: "offerA" } });
  await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: fb.id, stepId: coB.id, uid: UID, body: { primaryOfferId: "offerB" } });
  const cfgA = (await funnels.listSteps(fa.id))[0].checkoutConfigId!;
  const cfgB = (await funnels.listSteps(fb.id))[0].checkoutConfigId!;
  assert.ok(cfgA && cfgB && cfgA !== cfgB);

  const popupMap = { p1: { id: "p1", name: "Bonus", content: { root: { props: {} }, content: [{ type: "Heading", props: { id: "ph", text: "Wait!" } }] }, trigger: { type: "manual" }, style: {} } };
  await page("pg_source", designWith({ configId: cfgA, formId: "form1", seo: true }), { puckDraftPopups: encodePopupMapForStorage(normalizePopupMap(popupMap)) });
  await page("pg_published", designWith({ title: "Published version" }), {
    status: "published", puckPublishedData: encodePuckData(designWith({ title: "Published version" })), puckPublishedAt: new Date(Date.now() - 60_000),
    puckDraftData: encodePuckData(designWith({ title: "Newer draft" })),
  });
  await page("pg_foreign", designWith({}), {}, SA2);
  await page("pg_reading", designWith({ title: "Your Reading" }), { pageType: "reading_result", goal: "confirmation", readingResult: { chartDesignSetId: "cds_1", sample: "generator" } });

  console.log("\nSave as Template");
  let tplId = "";
  await check("save from a page card copies the saved draft, popups, page type, goal and attribution", async () => {
    const t = await svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_source", name: "Launch design", description: "For launches", requestId: "req-00000001" });
    tplId = t.id;
    const doc = (await db.doc(`pageTemplates/${t.id}`).get()).data()!;
    assert.equal(doc.subAccountId, SA);
    assert.equal(doc.pageType, "sales");
    assert.equal(doc.goal, "sales");
    assert.equal(doc.createdByName, "QA Admin");
    assert.equal(doc.previewStatus, "pending");
    const design = svc.templateDesign(doc as never);
    assert.equal((design.data.content[0].props as { responsive: unknown }).responsive !== undefined, true, "responsive overrides kept");
    assert.deepEqual(Object.keys(design.popups), ["p1"]);
    assert.deepEqual(block.collectCheckoutKeys(design.data), [cfgA], "the template keeps the design exactly");
    assert.equal(t.connections.forms, 1);
    assert.equal(t.connections.checkouts, 1);
  });
  await check("a repeated submission with the same request id returns the same template", async () => {
    const again = await svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_source", name: "Launch design", description: "", requestId: "req-00000001" });
    assert.equal(again.id, tplId);
    assert.equal((await db.collection("pageTemplates").where("subAccountId", "==", SA).get()).size, 1);
  });
  await check("the builder's current (unsaved) design is what gets saved; the page itself is untouched", async () => {
    const before = (await db.doc("pages/pg_source").get()).data()!;
    const t = await svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_source", name: "Unsaved edits", description: "", requestId: "req-00000002", current: { data: designWith({ title: "Edited, not autosaved yet" }), popups: {} } });
    const design = svc.templateDesign((await db.doc(`pageTemplates/${t.id}`).get()).data() as never);
    assert.equal((design.data.content[0].props as { text: string }).text, "Edited, not autosaved yet");
    const after = (await db.doc("pages/pg_source").get()).data()!;
    assert.deepEqual(after.puckDraftData, before.puckDraftData);
    assert.equal(after.status, "draft");
  });
  await check("a published page saves its current draft, not the older published version, and stays published", async () => {
    const t = await svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_published", name: "From published", description: "", requestId: "req-00000003" });
    const design = svc.templateDesign((await db.doc(`pageTemplates/${t.id}`).get()).data() as never);
    assert.equal((design.data.content[0].props as { text: string }).text, "Newer draft");
    assert.equal((await db.doc("pages/pg_published").get()).data()!.status, "published");
  });
  await check("a name is required; invalid content is refused with a clear error", async () => {
    await rejects(svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_source", name: " ", description: "", requestId: "req-00000004" }), 400);
    await rejects(svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_source", name: "Bad", description: "", requestId: "req-00000005", current: { data: { content: [{ type: "NotABlock", props: {} }], root: { props: {} } }, popups: {} } }), 400);
  });

  console.log("\nWorkspace isolation");
  await check("another workspace can't save, see, rename, delete or use this workspace's templates", async () => {
    await rejects(svc.savePageAsTemplate({ subAccountId: SA2, uid: UID, pageId: "pg_source", name: "Steal", description: "", requestId: "req-00000006" }), 404);
    assert.equal((await svc.listPageTemplates(SA2)).length, 0);
    await rejects(svc.updatePageTemplate(SA2, tplId, { name: "x" }), 404);
    await rejects(svc.deletePageTemplate(SA2, tplId), 404);
    await rejects(svc.createPageFromTemplate({ subAccountId: SA2, uid: UID, templateId: tplId, name: "x", goal: "sales" }), 404);
    await rejects(svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_foreign", name: "Foreign", description: "", requestId: "req-00000007" }), 404);
  });
  await check("every member's templates are listed for the workspace, newest first", async () => {
    const list = await svc.listPageTemplates(SA);
    assert.equal(list.length, 3);
    assert.ok(list[0].updatedAt >= list[list.length - 1].updatedAt);
  });

  console.log("\nCreate from template");
  let newPageId = "";
  await check("creates a new independent Draft page with a fresh identity", async () => {
    const r = await svc.createPageFromTemplate({ subAccountId: SA, uid: UID, templateId: tplId, name: "Spring launch", goal: "lead_generation" });
    newPageId = r.pageId;
    const p = (await db.doc(`pages/${r.pageId}`).get()).data()!;
    assert.notEqual(r.pageId, "pg_source");
    assert.equal(p.status, "draft");
    assert.equal(p.origin, "template");
    assert.equal(p.templateId, tplId);
    assert.equal(p.funnelId, null);
    assert.equal(p.publishedAt, null);
    assert.equal(p.puckPublishedData, undefined);
    assert.equal(p.thumbnail, undefined);
    assert.equal(p.goal, "lead_generation");
    assert.equal(p.pageType, "sales");
    assert.ok(p.slug.startsWith("spring-launch-") && p.slug !== "pg_source");
    assert.deepEqual(p.seo, { title: "", description: "", ogImage: "https://example.com/social.png" });
    const decoded = decodeStoredPuckData(p.puckDraftData);
    assert.ok(decoded.ok);
    const settings = (decoded.data.root.props as { pageSettings: Record<string, unknown> }).pageSettings;
    assert.equal(settings.seoTitle, "");
    assert.equal(settings.noindex, false);
    assert.deepEqual(settings.tracking, { metaPixelId: "", ga4Id: "", gtmId: "" });
    assert.equal(settings.socialImage, "https://example.com/social.png");
    assert.deepEqual(block.collectCheckoutKeys(decoded.data), ["auto"], "no inherited payment connection");
    assert.deepEqual(Object.keys(normalizePopupMap(p.puckDraftPopups)), ["p1"]);
    assert.equal(r.clearedCheckouts, 1);
    assert.equal(r.connections.forms, 1, "the form connection is kept");
  });
  await check("editing the new page changes neither the template nor the source page", async () => {
    const tplBefore = (await db.doc(`pageTemplates/${tplId}`).get()).data()!.puckData;
    const srcBefore = (await db.doc("pages/pg_source").get()).data()!.puckDraftData;
    const res = await puck.savePuckDraft(SA, newPageId, designWith({ title: "Edited copy" }));
    assert.equal(res.ok, true);
    assert.deepEqual((await db.doc(`pageTemplates/${tplId}`).get()).data()!.puckData, tplBefore);
    assert.deepEqual((await db.doc("pages/pg_source").get()).data()!.puckDraftData, srcBefore);
  });
  await check("a page name is required when creating", async () => {
    await rejects(svc.createPageFromTemplate({ subAccountId: SA, uid: UID, templateId: tplId, name: "", goal: "sales" }), 400);
  });

  console.log("\nRename / delete");
  await check("rename changes only the template", async () => {
    const t = await svc.updatePageTemplate(SA, tplId, { name: "Renamed design" });
    assert.equal(t.name, "Renamed design");
    assert.equal((await db.doc("pages/pg_source").get()).data()!.name, "pg_source");
    assert.equal((await db.doc(`pages/${newPageId}`).get()).data()!.name, "Spring launch");
  });
  await check("delete removes the template only — the source page and created pages stay", async () => {
    await svc.deletePageTemplate(SA, tplId);
    assert.equal((await db.doc(`pageTemplates/${tplId}`).get()).exists, false);
    assert.equal((await db.doc("pages/pg_source").get()).exists, true);
    assert.equal((await db.doc(`pages/${newPageId}`).get()).exists, true);
  });

  console.log("\nReading Result pages");
  await check("a Reading Result page saves and recreates with its type and Reading settings, and nothing personal", async () => {
    const t = await svc.savePageAsTemplate({ subAccountId: SA, uid: UID, pageId: "pg_reading", name: "Reading design", description: "", requestId: "req-00000008" });
    const doc = (await db.doc(`pageTemplates/${t.id}`).get()).data()!;
    assert.deepEqual(doc.readingResult, { chartDesignSetId: "cds_1", sample: "generator" });
    const keys = Object.keys(doc).sort();
    assert.deepEqual(keys.filter((k) => /reading/i.test(k)), ["readingResult"]);
    const r = await svc.createPageFromTemplate({ subAccountId: SA, uid: UID, templateId: t.id, name: "New reading page", goal: "confirmation" });
    const p = (await db.doc(`pages/${r.pageId}`).get()).data()!;
    assert.equal(p.pageType, "reading_result");
    assert.deepEqual(p.readingResult, { chartDesignSetId: "cds_1", sample: "generator" });
  });

  console.log("\nCheckout — funnel context");
  const keys = (r: Record<string, { connection: { configId: string }; replaced?: { configId: string } | null } | null>, k: string) => r[k];
  await page("pg_in_b", designWith({ configId: cfgA }));
  await funnels.addStep({ subAccountId: SA, funnelId: fb.id, uid: UID, body: { type: "page", name: "Sales B", pageId: "pg_in_b" } });
  await page("pg_in_c", designWith({ configId: cfgA }));
  await funnels.addStep({ subAccountId: SA, funnelId: fc.id, uid: UID, body: { type: "page", name: "Sales C", pageId: "pg_in_c" } });
  await page("pg_in_a", designWith({ configId: cfgA }));
  await funnels.addStep({ subAccountId: SA, funnelId: fa.id, uid: UID, body: { type: "page", name: "Sales A", pageId: "pg_in_a" } });
  await page("pg_standalone", designWith({ configId: cfgA }));
  await check("a page in Funnel B with Funnel A's checkout resolves through Funnel B's own checkout", async () => {
    const r = keys(await resolver.resolveCheckoutBlocks({ id: "pg_in_b", subAccountId: SA }, [cfgA], "editor") as never, cfgA)!;
    assert.equal(r.connection.configId, cfgB);
    assert.equal(r.replaced?.configId, cfgA);
  });
  await check("a page in a funnel without a Checkout step never sells another funnel's Offer", async () => {
    const pub = await resolver.resolveCheckoutBlocks({ id: "pg_in_c", subAccountId: SA }, [cfgA], "published");
    assert.equal(pub[cfgA], null);
    const ed = (await resolver.resolveCheckoutBlocks({ id: "pg_in_c", subAccountId: SA }, [cfgA], "editor"))[cfgA]!;
    assert.equal(ed.view, null);
    assert.ok(ed.problem?.includes("isn't part of"));
  });
  await check("a page in Funnel A keeps Funnel A's checkout", async () => {
    const r = (await resolver.resolveCheckoutBlocks({ id: "pg_in_a", subAccountId: SA }, [cfgA], "editor"))[cfgA]!;
    assert.equal(r.connection.configId, cfgA);
    assert.equal(r.replaced ?? null, null);
  });
  await check("an intentional standalone embed (page in no funnel) keeps its explicit checkout", async () => {
    const r = (await resolver.resolveCheckoutBlocks({ id: "pg_standalone", subAccountId: SA }, [cfgA], "editor"))[cfgA]!;
    assert.equal(r.connection.configId, cfgA);
    assert.equal(r.replaced ?? null, null);
  });
  await check("another workspace's checkout never resolves", async () => {
    await page("pg_foreign_cfg", designWith({ configId: cfgA }), {}, SA2);
    const r = await resolver.resolveCheckoutBlocks({ id: "pg_foreign_cfg", subAccountId: SA2 }, [cfgA], "editor");
    assert.equal(r[cfgA], null);
  });

  console.log("\nDuplicate Step");
  await check("duplicating a Checkout step with “copy the page” points the copied page at the copy's own checkout", async () => {
    await page("pg_checkout_a", designWith({ configId: cfgA }));
    const co = await funnels.updateStep(SA, fa.id, coA.id, { pageId: "pg_checkout_a" });
    assert.equal(co.pageId, "pg_checkout_a");
    const { step } = await funnels.duplicateStep({ subAccountId: SA, funnelId: fa.id, stepId: coA.id, uid: UID, pageMode: "copy" });
    assert.ok(step.pageId && step.pageId !== "pg_checkout_a");
    assert.ok(step.checkoutConfigId && step.checkoutConfigId !== cfgA);
    const copy = decodeStoredPuckData((await db.doc(`pages/${step.pageId}`).get()).data()!.puckDraftData);
    assert.ok(copy.ok);
    assert.deepEqual(block.collectCheckoutKeys(copy.data), [step.checkoutConfigId]);
    const original = decodeStoredPuckData((await db.doc("pages/pg_checkout_a").get()).data()!.puckDraftData);
    assert.ok(original.ok);
    assert.deepEqual(block.collectCheckoutKeys(original.data), [cfgA], "the original page is unchanged");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
