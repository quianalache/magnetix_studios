/**
 * Pre-Funnel safety fixes (2026-11-04). Deterministic checks.
 *
 * Offline: custom-domain Page ownership decision, the /p route wiring (page +
 * metadata, before the Reading Result branch), Offer archive wiring (no
 * recursive delete left, PATCH/DELETE archive semantics, checkout guards,
 * historical purchase status, active selectors hide archived Offers),
 * duplicate wiring (server-side, same-workspace).
 * Emulator (FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-*): archive /
 * restore an active and a draft Offer with purchases + upsells kept, checkout
 * start refused, webhook subscription path still finds the purchase, a
 * one-click upsell charge to an archived target refused; page duplication
 * (draft content, settings, popups + triggers + actions, new id, draft with
 * no published snapshot, source unchanged, independent edits, cross-tenant
 * refused).
 *
 * Run: pnpm check:pre-funnel
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decidePageHost } from "../src/lib/domains/page-host";
import { isPlatformHost } from "../src/lib/tracking/surfaces";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

async function offline() {
  const platform = { appUrl: "https://crm.magnetixstudios.com", primaryDomain: "magnetixstudios.com" };
  await check("platform hosts serve every workspace's published Pages", () => {
    for (const host of ["crm.magnetixstudios.com", "magnetixstudios.com", "www.magnetixstudios.com", "localhost:3000", "magnetix-studios-abc.vercel.app"]) {
      assert.equal(isPlatformHost(host, platform), true, host);
      assert.equal(decidePageHost({ isPlatformHost: true, hostSubAccountId: null, pageSubAccountId: "B" }), "allow");
    }
    assert.equal(isPlatformHost("quianalache.com", platform), false);
  });
  await check("a custom domain serves only its own workspace's Pages", () => {
    assert.equal(decidePageHost({ isPlatformHost: false, hostSubAccountId: "A", pageSubAccountId: "A" }), "allow");
    assert.equal(decidePageHost({ isPlatformHost: false, hostSubAccountId: "A", pageSubAccountId: "B" }), "not_found");
    assert.equal(decidePageHost({ isPlatformHost: false, hostSubAccountId: "A", pageSubAccountId: null }), "not_found");
    assert.equal(decidePageHost({ isPlatformHost: false, hostSubAccountId: null, pageSubAccountId: "A" }), "not_found", "unknown / unverified host fails closed");
  });
  await check("/p route checks the host in the page AND metadata, before the Reading Result branch", () => {
    const route = src("src/app/p/[pageId]/page.tsx");
    const uses = route.match(/pageServableOnHost\(/g) ?? [];
    assert.equal(uses.length, 2);
    const pageFn = route.slice(route.indexOf("export default async function"));
    assert.ok(pageFn.indexOf("pageServableOnHost(") < pageFn.indexOf('page.pageType === "reading_result"'), "host check precedes the reading branch");
    assert.ok(pageFn.includes("page.subAccountId))) notFound()"), "mismatch → notFound (no tenant leak)");
    const meta = route.slice(route.indexOf("export async function generateMetadata"), route.indexOf("export default async function"));
    assert.ok(meta.includes("page.subAccountId))) return {}"), "mismatch → empty metadata");
  });
  await check("Offer delete is archive everywhere — no recursive delete left", () => {
    for (const p of ["src/lib/server/course-offer-service.ts", "src/lib/server/agency-course-offer-service.ts"]) {
      const s = src(p);
      assert.ok(!/recursiveDelete/.test(s), `${p} must not recursively delete`);
      assert.ok(/visibility: "archived"/.test(s));
    }
    for (const p of ["src/app/api/sub-accounts/[id]/course-offers/[offerId]/route.ts", "src/app/api/agency/course-offers/[offerId]/route.ts"]) {
      const s = src(p);
      assert.ok(/export async function DELETE[\s\S]*archive\w*CourseOfferServerSide/.test(s), `${p} DELETE archives`);
      assert.ok(/"restore"/.test(s) && /"archive"/.test(s), `${p} PATCH archive/restore`);
      assert.ok(/Restore it before publishing/.test(s), `${p} refuses publishing an archived offer`);
    }
  });
  await check("new purchases need a published Offer; history still reads archived ones", () => {
    const purchase = src("src/lib/server/course-offer-purchase-service.ts");
    assert.equal((purchase.match(/offer\.visibility !== "published" \|\| offer\.type === "free"/g) ?? []).length, 2, "Stripe + PayPal start guards");
    assert.ok(/targetOffer\.visibility !== "published" \|\| configured\?\.targetOfferId !== opts\.targetOfferId/.test(purchase), "upsell charge guard");
    assert.ok(/offer\.visibility !== "published" \|\| offer\.type === "free"/.test(src("src/lib/server/agency-course-offer-purchase-service.ts")));
    assert.ok(/requireOfferApiAccess\(saId, offerId, \{ historical: true \}\)/.test(src("src/app/api/offer/[saId]/[offerId]/purchase-status/route.ts")));
    assert.ok(!/historical/.test(src("src/app/api/offer/[saId]/[offerId]/purchase/route.ts")), "PayPal purchase stays published-only");
  });
  await check("active selectors hide archived Offers (kept + flagged only when already selected)", () => {
    const flagged: Array<[string, RegExp]> = [
      ["src/components/pages-funnels/puck/action-field.tsx", /archived/],
      ["src/components/pages-funnels/puck/reading-block-fields.tsx", /archived/],
      ["src/app/api/sub-accounts/[id]/energetic-decoder/_routes/embeds/[embedId]/route.ts", /archived/],
      ["src/lib/server/ai-page-generation-service.ts", /archived/],
      ["src/components/quotes/quote-builder.tsx", /archived/],
      ["src/components/course-offers/offer-upsell-tab.tsx", /archived/],
      ["src/app/(dashboard)/sa/[subAccountId]/client-portal/page.tsx", /archived/],
    ];
    for (const [p, rx] of flagged) assert.ok(rx.test(src(p)), p);
    assert.ok(/\(Archived\)/.test(src("src/components/pages-funnels/puck/action-field.tsx")), "existing reference is flagged, not swapped");
  });
  await check("duplicate is server-side and same-workspace", () => {
    assert.ok(/case "duplicate"[\s\S]*duplicatePuckPage\(subAccountId, pageId, access\.uid\)/.test(src("src/app/api/pages-funnels/puck/page-settings/route.ts")));
    const client = src("src/lib/firestore/pages-funnels.ts");
    assert.ok(/action: "duplicate"/.test(client));
  });
}

async function emulator() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const offers = await import("../src/lib/server/course-offer-service");
  const purchases = await import("../src/lib/server/course-offer-purchase-service");
  const svc = await import("../src/lib/server/pages-funnels-puck-service");
  const { readStoredPuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const { createDefaultPopup, normalizePopupMap, findStalePopupReferences } = await import("../src/types/pages-funnels-popup");
  const { withPageSettings, resolvePageSettings, EMPTY_PAGE_SETTINGS } = await import("../src/lib/pages-funnels/page-settings");
  const db = getAdminDb();
  const stamp = Date.now();
  const SA = `sa_pf_${stamp}`, OTHER = `sa_pf_other_${stamp}`;

  try {
    // ── Offers ──────────────────────────────────────────────────────────
    const offerRef = (id: string) => db.doc(`subAccounts/${SA}/courseOffers/${id}`);
    const seedOffer = async (id: string, visibility: string) => {
      await offerRef(id).set({ subAccountId: SA, agencyId: "ag_pf", title: `QA ${id}`, slug: id, type: "recurring", priceCents: 1000, currency: "USD", visibility, courseIds: [] });
      await offerRef(id).collection("purchases").doc("p1").set({ memberId: "m1", agencyId: "ag_pf", status: "paid", courseIds: [], stripeSubscriptionId: `sub_${id}`, stripeCustomerId: "cus_qa", stripePaymentIntentId: "pi_qa", qaFixture: true });
      await offerRef(id).collection("upsells").doc("u1").set({ type: "oneClick", visibility: "published", targetOfferId: "target" });
    };
    await seedOffer("active", "published");
    await seedOffer("drafty", "draft");
    await offerRef("target").set({ subAccountId: SA, title: "Target", type: "one_time", priceCents: 500, visibility: "published", courseIds: [] });

    await check("archive an active and a draft Offer — records, purchases and upsells kept", async () => {
      for (const id of ["active", "drafty"]) {
        assert.equal(await offers.archiveCourseOfferServerSide({ subAccountId: SA, offerId: id, uid: "u_owner" }), "archived");
        const d = (await offerRef(id).get()).data()!;
        assert.equal(d.visibility, "archived");
        assert.equal(d.archivedByUid, "u_owner");
        assert.ok(d.archivedAt);
        assert.equal((await offerRef(id).collection("purchases").get()).size, 1, "purchase kept");
        assert.equal((await offerRef(id).collection("upsells").get()).size, 1, "upsell kept");
      }
      assert.equal(await offers.archiveCourseOfferServerSide({ subAccountId: SA, offerId: "nope", uid: "u" }), "not_found");
    });
    await check("archived Offer can't start a checkout", async () => {
      await assert.rejects(
        purchases.startCourseOfferStripeCheckoutServerSide({ subAccountId: SA, offerId: "active", memberId: "m2", memberEmail: "qa@example.com", memberName: "QA", returnUrl: "https://example.com" }),
        /isn't for sale/,
      );
    });
    await check("historical lookup + webhook subscription path still work on an archived Offer", async () => {
      assert.equal(await purchases.hasPaidCourseOffer(SA, "active", "m1"), true);
      assert.equal(await purchases.getPaidPurchaseIdForMember(SA, "active", "m1"), "p1");
      await purchases.handleCourseOfferSubscriptionDeleted({ id: "sub_active", metadata: { subAccountId: SA, offerId: "active" } } as never);
      assert.equal((await offerRef("active").collection("purchases").doc("p1").get()).data()!.status, "canceled", "webhook found + updated the purchase");
    });
    await check("one-click upsell charge refuses an archived or non-configured target", async () => {
      await offerRef("drafty").collection("upsells").doc("u1").set({ type: "oneClick", visibility: "published", targetOfferId: "target" });
      await offers.archiveCourseOfferServerSide({ subAccountId: SA, offerId: "target", uid: "u" });
      const r = await purchases.chargeOneClickUpsellServerSide({ subAccountId: SA, triggerOfferId: "drafty", triggerPurchaseId: "p1", targetOfferId: "target", memberId: "m1" });
      assert.equal(r.ok, false);
      assert.ok(!("needsManualCheckout" in r && r.needsManualCheckout), "refused outright, not routed to checkout");
      await offers.restoreCourseOfferServerSide({ subAccountId: SA, offerId: "target" });
      await offerRef("other").set({ subAccountId: SA, title: "Other", type: "one_time", priceCents: 700, visibility: "published", courseIds: [] });
      const r2 = await purchases.chargeOneClickUpsellServerSide({ subAccountId: SA, triggerOfferId: "drafty", triggerPurchaseId: "p1", targetOfferId: "other", memberId: "m1" });
      assert.equal(r2.ok, false, "a target that isn't the configured upsell is refused");
    });
    await check("restore → draft (never straight to live); restoring a live Offer refused", async () => {
      assert.equal(await offers.restoreCourseOfferServerSide({ subAccountId: SA, offerId: "active" }), "restored");
      const d = (await offerRef("active").get()).data()!;
      assert.equal(d.visibility, "draft");
      assert.equal(d.archivedAt ?? null, null);
      assert.equal((await offerRef("active").collection("purchases").get()).size, 1);
      assert.equal(await offers.restoreCourseOfferServerSide({ subAccountId: SA, offerId: "active" }), "not_archived");
    });

    // ── Page duplication ────────────────────────────────────────────────
    const PAGE = `pg_pf_${stamp}`;
    const SETTINGS = { ...EMPTY_PAGE_SETTINGS, seoTitle: "Draft SEO", seoDescription: "Draft desc" };
    const tree = (heading: string, popupId: string | null, settings = SETTINGS) =>
      withPageSettings(
        {
          root: { props: {} },
          content: [
            { type: "Heading", props: { id: "Heading-1", text: heading, level: "h1" } },
            ...(popupId ? [{ type: "Button", props: { id: "Button-1", text: "Open", action: { type: "open_popup", popupId }, style: "primary" } }] : []),
          ],
        } as never,
        settings,
      );
    await db.doc(`pages/${PAGE}`).set({ subAccountId: SA, agencyId: "ag_pf", name: "QA · Duplicate source", status: "draft", slug: "qa-dup", pageType: "generic", goal: "other", origin: "blank", seo: { title: "", description: "", ogImage: "" } });
    assert.equal((await svc.publishPuckPage(SA, PAGE, tree("published", null, EMPTY_PAGE_SETTINGS), {})).ok, true);
    const popup = { ...createDefaultPopup("popup_a", "QA popup"), trigger: { type: "delay", delaySeconds: 5 } };
    assert.equal((await svc.savePuckDraft(SA, PAGE, tree("draft heading", "popup_a"), { popup_a: popup } as never)).ok, true);
    const before = (await db.doc(`pages/${PAGE}`).get()).data()!;
    let COPY = "";

    await check("duplicate copies the current DRAFT, settings and popups into a new draft page", async () => {
      const r = await svc.duplicatePuckPage(SA, PAGE, "u_dup");
      assert.equal(r.ok, true, JSON.stringify(r));
      COPY = (r as { pageId: string }).pageId;
      assert.notEqual(COPY, PAGE);
      const c = (await db.doc(`pages/${COPY}`).get()).data()!;
      assert.equal(c.subAccountId, SA);
      assert.equal(c.name, "QA · Duplicate source (Copy)");
      assert.equal(c.status, "draft");
      assert.equal(c.puckPublishedData, undefined, "no published snapshot");
      assert.equal(c.puckPublishedPopups, undefined);
      assert.equal(c.publishedAt, null);
      assert.equal(c.funnelId, null);
      assert.equal(c.createdByUid, "u_dup");
      const data = readStoredPuckData(c.puckDraftData)!;
      assert.equal((data.content[0].props as { text: string }).text, "draft heading", "draft (not published) content");
      assert.equal(resolvePageSettings(data, c.seo).seoTitle, "Draft SEO");
      const pops = normalizePopupMap(c.puckDraftPopups);
      assert.deepEqual(Object.keys(pops), ["popup_a"]);
      assert.equal(pops.popup_a.trigger.type, "delay");
      assert.deepEqual(findStalePopupReferences(data, pops), [], "popup actions resolve in the copy");
      for (const k of ["visits", "views", "analytics", "publishHistory"]) assert.equal(c[k], undefined, k);
    });
    await check("source unchanged; copy is independently editable", async () => {
      assert.deepEqual((await db.doc(`pages/${PAGE}`).get()).data(), before);
      assert.equal((await svc.savePuckDraft(SA, COPY, tree("copy edit", null), {})).ok, true);
      const src2 = (await db.doc(`pages/${PAGE}`).get()).data()!;
      assert.deepEqual(src2.puckDraftData, before.puckDraftData);
      assert.deepEqual(src2.puckDraftPopups, before.puckDraftPopups);
      assert.equal((await svc.publishPuckPage(SA, COPY, tree("copy live", null), {})).ok, true);
      assert.deepEqual((await db.doc(`pages/${PAGE}`).get()).data()!.puckPublishedData, before.puckPublishedData, "publishing the copy leaves the source's live page alone");
    });
    await check("duplicate refuses another workspace and a missing page (same not-found)", async () => {
      const r = await svc.duplicatePuckPage(OTHER, PAGE, "u_x");
      assert.equal(r.ok, false);
      assert.equal((r as { status: number }).status, 404);
      const m = await svc.duplicatePuckPage(SA, "missing_page", "u_x");
      assert.equal((m as { error: string }).error, (r as { error: string }).error);
      assert.equal((await db.collection("pages").where("subAccountId", "==", OTHER).get()).size, 0);
    });
    await db.doc(`pages/${PAGE}`).delete();
    if (COPY) await db.doc(`pages/${COPY}`).delete();
  } finally {
    await db.recursiveDelete(db.doc(`subAccounts/${SA}`)).catch(() => {});
  }
}

async function main() {
  await offline();
  const emu = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emu) await emulator();
  console.log(`Pre-Funnel safety checks: ${passed} passed${emu ? " (incl. emulator persistence)" : " (offline; set the emulator env for persistence)"}`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
