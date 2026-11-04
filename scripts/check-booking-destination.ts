/**
 * Booking destination follow-up (2026-11-04). "Go to booking page" is the
 * stored form of the canonical `booking` destination ({type:"booking",
 * bookingPageSlug}); it renders through the same resolveActionLink /
 * resolveActionTargets as Page and Offer.
 *
 * Offline: picker contexts (page / Popup / Navigation link / Navigation CTA),
 * canonical mapping, link resolution (builder inert, missing → no link),
 * target collection (Button, Image, Popup content, Navigation CTA), Navigation
 * strict + lenient rules, AI exclusion, rendered markup.
 * Emulator (FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST +
 * GCLOUD_PROJECT=demo-*): server resolution per tenant / status / deletion,
 * the real resolve-actions route, and draft/published isolation through the
 * real save + publish service.
 *
 * Run: pnpm check:booking-destination
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canonicalizeStoredAction, toLegacyPageAction } from "../src/lib/pages-funnels/action/normalize";
import { collectActionTargets, inspectStoredAction, normalizeStoredAction, resolveActionLink } from "../src/lib/pages-funnels/puck/action";
import { actionOptions } from "../src/components/pages-funnels/puck/action-field";
import { NAV_CTA_ACTION_TYPES, NAV_LINK_ACTION_TYPES, findNavigationProblem, normalizeNavigation } from "../src/lib/pages-funnels/navigation";
import { withPopupContent, sanitizePopupContent, validatePopupContent } from "../src/lib/pages-funnels/popup-content";
import { createDefaultPopup } from "../src/types/pages-funnels-popup";
import { assertSafePuck } from "../src/lib/pages-funnels/ai/page-plan";
import { ButtonRender } from "../src/components/pages-funnels/puck/elements";
import { NavigationRender } from "../src/components/pages-funnels/puck/navigation-block";
import type { PageAction, ResolvedActionTargets } from "../src/types/pages-funnels-puck";
import type { Data } from "@puckeditor/core";

let passed = 0;
const check = async (label: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${label}`);
    throw err;
  }
};

const booking = (slug: string): PageAction => ({ type: "booking", bookingPageSlug: slug });
const resolved: ResolvedActionTargets = {
  pages: {},
  offers: {},
  bookings: { "call-a": { href: "https://crm.example.com/b/sa_a/call-a" }, "draft-a": null, "call-b": null },
  sectionIds: [],
};
const navProps = (cta: unknown, items: unknown[] = [{ id: "home", kind: "link", label: "Home", action: { type: "none" } }]) => ({
  id: "Navigation-x", ariaLabel: "Main", logo: { src: "", alt: "", height: 40 }, items, cta, mobile: { collapseAt: "mobile" },
});

async function offline() {
  // ---- picker contexts ----
  await check("page Buttons offer Go to booking page alongside Offer, plus Open popup (not Close)", () => {
    const v = actionOptions({ surface: "page", popups: [] }).map((o) => o.value);
    assert.ok(v.includes("booking") && v.includes("purchase") && v.includes("open_popup") && !v.includes("close_popup"));
    assert.equal(actionOptions({ surface: "page", popups: [] }).find((o) => o.value === "booking")?.label, "Go to booking page");
  });
  await check("Popup Buttons offer Go to booking page + Close popup, never Open popup", () => {
    const v = actionOptions({ surface: "popup", popups: [] }).map((o) => o.value);
    assert.ok(v.includes("booking") && v.includes("close_popup") && !v.includes("open_popup"));
  });
  await check("Navigation CTA allows Page / URL / Section / Offer / Booking", () => {
    assert.deepEqual([...NAV_CTA_ACTION_TYPES].sort(), ["booking", "none", "page", "purchase", "scroll", "url"]);
  });
  await check("Navigation menu links + dropdown children stay Page / URL / Section only", () => {
    assert.deepEqual([...NAV_LINK_ACTION_TYPES].sort(), ["none", "page", "scroll", "url"]);
    const picked = actionOptions({ surface: "page", popups: [] }).filter((o) => NAV_LINK_ACTION_TYPES.includes(o.value as never)).map((o) => o.value);
    assert.ok(!picked.includes("booking"));
  });

  // ---- canonical mapping ----
  await check("stored booking action ⇄ canonical booking destination (same slug, no new model)", () => {
    const c = canonicalizeStoredAction(booking("call-a"));
    assert.equal(c.status, "supported");
    assert.deepEqual(c.action, { type: "navigate", destination: { type: "booking", bookingPageSlug: "call-a" } });
    assert.deepEqual(toLegacyPageAction(c.action), booking("call-a"));
  });
  await check("malformed booking slugs are invalid and inert (never a link)", () => {
    for (const bad of ["", "../x", "Call_A", "a/b", 7]) {
      const raw = { type: "booking", bookingPageSlug: bad };
      assert.equal(canonicalizeStoredAction(raw).status, "invalid", String(bad));
      assert.equal(resolveActionLink(raw as PageAction, { resolved }).href, null);
    }
  });
  await check("normalizeStoredAction keeps the stored slug (stale ids stay visible for repair)", () => {
    assert.deepEqual(normalizeStoredAction({ type: "booking", bookingPageSlug: "deleted-call" }), booking("deleted-call"));
    assert.deepEqual(normalizeStoredAction({ type: "booking", bookingPageSlug: { x: 1 } }), booking(""));
    assert.equal(inspectStoredAction(booking("deleted-call")).status, "supported");
  });

  // ---- link resolution ----
  await check("resolved same-workspace published Booking Page → its public URL, same tab", () => {
    const l = resolveActionLink(booking("call-a"), { resolved });
    assert.deepEqual(l, { href: "https://crm.example.com/b/sa_a/call-a", newTab: false });
  });
  await check("draft / foreign / deleted / unresolved → no link", () => {
    for (const slug of ["draft-a", "call-b", "never-seen"]) assert.equal(resolveActionLink(booking(slug), { resolved }).href, null, slug);
    assert.equal(resolveActionLink(booking("call-a"), { resolved: { pages: {}, offers: {}, sectionIds: [] } }).href, null, "no bookings map");
    assert.equal(resolveActionLink(booking("call-a")).href, null, "no metadata");
  });
  await check("builder (editing) never links", () => {
    assert.equal(resolveActionLink(booking("call-a"), { resolved, editing: true }).href, null);
  });

  // ---- collection ----
  await check("targets collected from Button, Image, Navigation CTA (not menu links) and Popup content", () => {
    const popup = createDefaultPopup("popup_a", "P");
    popup.content = { root: { props: {} }, content: [{ type: "Button", props: { id: "pb", text: "x", action: booking("in-popup") } }] } as unknown as Data;
    const data = {
      root: { props: {} },
      content: [
        { type: "Button", props: { id: "b", action: booking("from-button") } },
        { type: "Image", props: { id: "i", src: "x", alt: "", action: booking("from-image") } },
        { type: "Navigation", props: navProps({ enabled: true, label: "Book", action: booking("from-cta"), variant: "solid" }, [{ id: "l", kind: "link", label: "L", action: booking("from-menu-link") }]) },
      ],
    } as unknown as Data;
    const slugs = collectActionTargets(withPopupContent(data, { popup_a: popup })).bookingSlugs.sort();
    assert.ok(slugs.includes("from-button") && slugs.includes("from-image") && slugs.includes("from-cta") && slugs.includes("in-popup"), slugs.join(","));
  });

  // ---- Navigation rules ----
  await check("Navigation strict save: CTA → booking accepted", () => {
    const d = { content: [{ type: "Navigation", props: navProps({ enabled: true, label: "Book", action: booking("call-a"), variant: "solid" }) }] };
    assert.equal(findNavigationProblem(d), null);
  });
  await check("Navigation strict save: menu link / dropdown child → booking refused with a plain reason", () => {
    const link = { content: [{ type: "Navigation", props: navProps(undefined, [{ id: "l", kind: "link", label: "Book", action: booking("call-a") }]) }] };
    assert.match(findNavigationProblem(link)!, /can only link to a page, a web address or a section\./);
    const child = { content: [{ type: "Navigation", props: navProps(undefined, [{ id: "d", kind: "dropdown", label: "More", children: [{ id: "c", label: "Book", action: booking("call-a") }] }]) }] };
    assert.match(findNavigationProblem(child)!, /can only link to a page/);
  });
  await check("Navigation lenient render: booking kept on the CTA, dropped on menu links", () => {
    const n = normalizeNavigation(navProps({ enabled: true, label: "Book", action: booking("call-a"), variant: "solid" }, [{ id: "l", kind: "link", label: "L", action: booking("call-a") }]));
    assert.deepEqual(n.cta.action, booking("call-a"));
    assert.deepEqual((n.items[0] as { action: PageAction }).action, { type: "none" });
  });

  // ---- Popups / AI ----
  await check("Popup content: a Button → booking page is valid and survives sanitizing", () => {
    const content = { root: { props: {} }, content: [{ type: "Button", props: { id: "pb", text: "Book", action: booking("call-a") } }] };
    assert.deepEqual(validatePopupContent(content), []);
    assert.deepEqual((sanitizePopupContent(content).content[0].props as { action: PageAction }).action, booking("call-a"));
  });
  await check("AI page generation can't produce booking destinations", () => {
    assert.throws(() => assertSafePuck({ root: { props: {} }, content: [{ type: "Button", props: { id: "b", text: "x", action: booking("call-a") } }] } as unknown as Data));
  });

  // ---- markup ----
  await check("Button: published renders the booking URL; builder renders no href; unresolved renders no href", () => {
    const btn = (opts: Record<string, unknown>) => renderToStaticMarkup(h(ButtonRender, { id: "b", text: "Book", action: booking("call-a"), style: "primary", alignment: "left", ...opts }));
    assert.match(btn({ resolved }), /href="https:\/\/crm.example.com\/b\/sa_a\/call-a"/);
    assert.ok(!/href=/.test(btn({ resolved, editing: true })));
    assert.ok(!/href=/.test(btn({ resolved: { ...resolved, bookings: {} } })));
  });
  await check("Navigation CTA: published renders the booking URL; builder renders none", () => {
    const nav = (editing: boolean) => renderToStaticMarkup(h(NavigationRender, { ...navProps({ enabled: true, label: "Book a call", action: booking("call-a"), variant: "solid" }), resolved, editing }));
    assert.match(nav(false), /data-nav-cta[^>]*href="https:\/\/crm.example.com\/b\/sa_a\/call-a"|href="https:\/\/crm.example.com\/b\/sa_a\/call-a"[^>]*data-nav-cta/);
    assert.ok(!nav(true).includes("crm.example.com"));
  });
}

async function emulator() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin");
  const { resolveActionTargets, resolvePageActionTargets } = await import("../src/lib/server/page-action-targets");
  const { GET: resolveActionsRoute } = await import("../src/app/api/pages-funnels/puck/resolve-actions/route");
  const { savePuckDraft, publishPuckPage } = await import("../src/lib/server/pages-funnels-puck-service");
  const { readStoredPuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const db = getAdminDb();
  const auth = getAdminAuth();
  const run = `t${Date.now()}`;
  const A = { agency: `ag_a_${run}`, sa: `sa_a_${run}`, uid: `u_a_${run}`, page: `pg_a_${run}` };
  const B = { agency: `ag_b_${run}`, sa: `sa_b_${run}`, uid: `u_b_${run}` };
  const bp = (sa: string, slug: string, status: string) =>
    db.doc(`subAccounts/${sa}/bookingPages/${slug}`).set({ subAccountId: sa, slug, name: slug, status, durationMinutes: 30, timezone: "UTC", workingHours: [], visibleDays: 14, intakeFields: [] });
  try {
    for (const t of [A, B]) {
      await auth.createUser({ uid: t.uid, email: `${t.uid}@example.com` });
      await auth.setCustomUserClaims(t.uid, { role: "user", status: "active", agencyId: t.agency, agencyRole: null });
      await db.doc(`subAccounts/${t.sa}`).set({ agencyId: t.agency, name: t.sa });
      await db.doc(`subAccounts/${t.sa}/subAccountMembers/${t.uid}`).set({ uid: t.uid, role: "admin", status: "active" });
    }
    await bp(A.sa, "call-a", "published");
    await bp(A.sa, "call-a2", "published");
    await bp(A.sa, "draft-a", "draft");
    await bp(B.sa, "call-b", "published");

    await check("server: own published → /b/{sa}/{slug}; own draft, foreign, missing, malformed → null", async () => {
      const r = await resolveActionTargets(A.sa, { pageIds: [], offerIds: [], bookingSlugs: ["call-a", "draft-a", "call-b", "nope", "../x"] }, "published");
      assert.ok(r.bookings?.["call-a"]?.href.endsWith(`/b/${A.sa}/call-a`), JSON.stringify(r.bookings));
      assert.equal(r.bookings?.["draft-a"], null);
      assert.equal(r.bookings?.["call-b"], null);
      assert.equal(r.bookings?.nope, null);
      assert.ok(!("../x" in (r.bookings ?? {})));
    });
    await check("server: Preview policy is the same published-only rule", async () => {
      const r = await resolveActionTargets(A.sa, { pageIds: [], offerIds: [], bookingSlugs: ["call-a", "draft-a"] }, "preview");
      assert.ok(r.bookings?.["call-a"]?.href && r.bookings?.["draft-a"] === null);
    });
    await check("route: member of A resolves A's booking pages; foreign stays null; B member can't ask for A", async () => {
      const call = async (qs: string, uid?: string) => resolveActionsRoute(new Request(`http://localhost/api/pages-funnels/puck/resolve-actions?${qs}`, { headers: uid ? { "x-user-uid": uid } : {} }));
      const ok = await call(`subAccountId=${A.sa}&bookings=call-a,call-b`, A.uid);
      const j = await ok.json();
      assert.equal(ok.status, 200);
      assert.ok(j.bookings["call-a"]?.href && j.bookings["call-b"] === null);
      assert.notEqual((await call(`subAccountId=${A.sa}&bookings=call-a`, B.uid)).status, 200);
      assert.notEqual((await call(`subAccountId=${A.sa}&bookings=call-a`)).status, 200);
    });
    const page = (buttonSlug: string, ctaSlug: string) => ({
      root: { props: {} },
      content: [
        { type: "Navigation", props: navProps({ enabled: true, label: "Book", action: booking(ctaSlug), variant: "solid" }) },
        { type: "Section", props: { id: "Section-1", rows: [{ type: "Row", props: { id: "Row-1", columns: [{ type: "Column", props: { id: "Column-1", elements: [{ type: "Button", props: { id: "Button-1", text: "Book", action: booking(buttonSlug), style: "primary", alignment: "left" } }] } }] } }] } },
      ],
    }) as unknown as Data;
    await db.doc(`pages/${A.page}`).set({ subAccountId: A.sa, agencyId: A.agency, name: "QA", status: "draft" });
    await check("draft/published isolation: Button + Navigation CTA (published A, draft B)", async () => {
      assert.equal((await publishPuckPage(A.sa, A.page, page("call-a", "call-a"), {})).ok, true);
      assert.equal((await savePuckDraft(A.sa, A.page, page("call-a2", "call-a2"), {})).ok, true);
      const doc = (await db.doc(`pages/${A.page}`).get()).data()!;
      const pub = await resolvePageActionTargets(A.sa, readStoredPuckData(doc.puckPublishedData));
      const draft = collectActionTargets(readStoredPuckData(doc.puckDraftData)).bookingSlugs;
      assert.deepEqual(Object.keys(pub.bookings ?? {}), ["call-a"], "public resolves only A");
      assert.deepEqual(draft, ["call-a2"], "draft (builder/Preview) targets B");
      assert.equal((await publishPuckPage(A.sa, A.page, page("call-a2", "call-a2"), {})).ok, true);
      const after = await resolvePageActionTargets(A.sa, readStoredPuckData((await db.doc(`pages/${A.page}`).get()).data()!.puckPublishedData));
      assert.deepEqual(Object.keys(after.bookings ?? {}), ["call-a2"], "after Publish: B");
    });
    await check("save refuses booking on a menu link (Navigation rule enforced at save)", async () => {
      const bad = page("call-a", "call-a") as unknown as { content: { props: { items: unknown[] } }[] };
      bad.content[0].props.items = [{ id: "l", kind: "link", label: "Book", action: booking("call-a") }];
      const r = await savePuckDraft(A.sa, A.page, bad as unknown as Data, {});
      assert.equal(r.ok, false);
    });
    await check("deleted Booking Page: stored slug kept, resolves to nothing (no crash, no retarget)", async () => {
      await db.doc(`subAccounts/${A.sa}/bookingPages/call-a2`).delete();
      const doc = (await db.doc(`pages/${A.page}`).get()).data()!;
      const pub = await resolvePageActionTargets(A.sa, readStoredPuckData(doc.puckPublishedData));
      assert.equal(pub.bookings?.["call-a2"], null);
      assert.deepEqual(collectActionTargets(readStoredPuckData(doc.puckPublishedData)).bookingSlugs, ["call-a2"]);
    });
  } finally {
    for (const t of [A, B]) {
      await auth.deleteUser(t.uid).catch(() => {});
      await db.recursiveDelete(db.doc(`subAccounts/${t.sa}`)).catch(() => {});
    }
    await db.doc(`pages/${A.page}`).delete().catch(() => {});
  }
}

async function main() {
  await offline();
  const emu = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emu) await emulator();
  console.log(`Booking destination checks: ${passed} passed${emu ? " (incl. emulator)" : " (offline; set the emulator env for tenancy + persistence)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
