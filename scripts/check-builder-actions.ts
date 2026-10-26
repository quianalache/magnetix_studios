/**
 * Builder page defaults, width controls + Button actions — contract checks
 * (2026-10-26).
 *
 * Offline part (no server, no Firebase):
 *   pnpm exec tsx scripts/check-builder-actions.ts
 * Plus the tenant-resolution part against the Firestore emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     pnpm exec tsx --env-file=.env.local scripts/check-builder-actions.ts
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  collectActionTargets,
  isSafeActionUrl,
  isSafeSectionId,
  isValidEmailAddress,
  normalizePhoneNumber,
  normalizeStoredAction,
  resolveActionLink,
} from "../src/lib/pages-funnels/puck/action";
import { ButtonRender, ImageRender } from "../src/components/pages-funnels/puck/elements";
import { PageRootRender, SectionRender } from "../src/components/pages-funnels/puck/layout";
import type { PageAction, ResolvedActionTargets } from "../src/types/pages-funnels-puck";

// tsx compiles the components' JSX with the classic runtime (tsconfig keeps
// `jsx: preserve` for Next), so React must be global when they render.
(globalThis as { React?: typeof React }).React = React;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
}

const resolved: ResolvedActionTargets = {
  pages: { pg_ok: { href: "https://example.com/p/pg_ok" }, pg_draft: null },
  offers: { of_ok: { href: "https://example.com/offer/sa/of_ok" }, of_other: null },
  sectionIds: ["sec_a", "sec_b"],
};
const href = (a: PageAction, opts: Parameters<typeof resolveActionLink>[1] = { resolved }) => resolveActionLink(a, opts).href;

console.log("Action resolution");
check("URL: https link", href({ type: "url", url: "https://a.com" }) === "https://a.com");
check("URL: new tab flag carried", resolveActionLink({ type: "url", url: "https://a.com", openInNewTab: true }, { resolved }).newTab);
check("URL: relative + anchor allowed", href({ type: "url", url: "/pricing" }) === "/pricing" && href({ type: "url", url: "#faq" }) === "#faq");
for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "vbscript:x", ""]) {
  check(`URL: refused ${JSON.stringify(bad)}`, href({ type: "url", url: bad }) === null);
}
check("Page: published same-tenant page links", href({ type: "page", pageId: "pg_ok" }) === "https://example.com/p/pg_ok");
check("Page: unresolved (draft/other tenant) → no link", href({ type: "page", pageId: "pg_draft" }) === null);
check("Page: unknown id → no link", href({ type: "page", pageId: "pg_missing" }) === null);
check("Page: without server resolution → no link", href({ type: "page", pageId: "pg_ok" }, {}) === null);
check("Page: new tab flag carried", resolveActionLink({ type: "page", pageId: "pg_ok", openInNewTab: true }, { resolved }).newTab);
check("Offer: published same-tenant Offer links", href({ type: "purchase", offerId: "of_ok" }) === "https://example.com/offer/sa/of_ok");
check("Offer: other tenant / unpublished → no link", href({ type: "purchase", offerId: "of_other" }) === null);
check("Offer: never opens a new tab", !resolveActionLink({ type: "purchase", offerId: "of_ok" }, { resolved }).newTab);
check("Scroll: existing section → #anchor", href({ type: "scroll", targetElementId: "sec_b" }) === "#sec_b");
check("Scroll: deleted section → no link", href({ type: "scroll", targetElementId: "sec_gone" }) === null);
check("Scroll: unsafe id refused", href({ type: "scroll", targetElementId: 'x"><script>' }) === null);
check("Call: tel: with normalized number", href({ type: "call", phoneNumber: "+1 (555) 123-4567" }) === "tel:+15551234567");
check("SMS: sms: with normalized number", href({ type: "sms", phoneNumber: "555 123 4567" }) === "sms:5551234567");
check("Call: junk refused", href({ type: "call", phoneNumber: "call me" }) === null && href({ type: "call", phoneNumber: "12" }) === null);
check("Email: mailto with encoded subject", href({ type: "email", emailAddress: "hi@site.com", subject: "Hello & welcome" }) === "mailto:hi@site.com?subject=Hello%20%26%20welcome");
check("Email: invalid address refused", href({ type: "email", emailAddress: "not-an-email" }) === null && href({ type: "email", emailAddress: "a@b.com?bcc=x@y.com" }) === null);
check("Editing: never a link (builder never navigates)", (["url", "page", "purchase", "scroll", "call", "sms", "email"] as const).every((t) =>
  resolveActionLink(normalizeStoredAction({ type: t, url: "https://a.com", pageId: "pg_ok", offerId: "of_ok", targetElementId: "sec_a", phoneNumber: "5551234567", emailAddress: "a@b.co" }), { resolved, editing: true }).href === null));
for (const reserved of ["open_popup", "show_hide", "submit_form", "next_funnel_step", "download"] as const) {
  check(`Reserved ${reserved}: never rendered`, href({ type: reserved } as PageAction) === null);
}

console.log("Validators");
check("isSafeActionUrl mailto/tel/sms ok", ["mailto:a@b.co", "tel:+1555", "sms:+1555"].every(isSafeActionUrl));
check("normalizePhoneNumber bounds", normalizePhoneNumber("12345") === null && normalizePhoneNumber("1234567890123456") === null && normalizePhoneNumber("123456") === "123456");
check("isValidEmailAddress", isValidEmailAddress("a.b+c@d.co") && !isValidEmailAddress("a@b") && !isValidEmailAddress("a b@c.co"));
check("isSafeSectionId", isSafeSectionId("Section-abc_1") && !isSafeSectionId("a b") && !isSafeSectionId(""));

console.log("Stored-action normalization (existing pages need no migration)");
check("legacy flat URL action reads unchanged", JSON.stringify(normalizeStoredAction({ type: "url", url: "https://a.com", openInNewTab: true })) === JSON.stringify({ type: "url", url: "https://a.com", openInNewTab: true }));
check("legacy none reads as none", normalizeStoredAction({ type: "none", url: "" }).type === "none");
check("missing/garbage → none", normalizeStoredAction(undefined).type === "none" && normalizeStoredAction("x").type === "none" && normalizeStoredAction({ type: "custom_js", code: "x" }).type === "none");
check("reserved stored types → none", normalizeStoredAction({ type: "open_popup", popupId: "p" }).type === "none");
check("non-string fields coerced safely", JSON.stringify(normalizeStoredAction({ type: "purchase", offerId: { evil: 1 } })) === JSON.stringify({ type: "purchase", offerId: "" }));

console.log("Target collection");
const pageData = {
  root: { props: {} },
  content: [
    { type: "Hero", props: { id: "hero_1", rows: [] } },
    { type: "Section", props: { id: "sec_1", rows: [{ type: "Row", props: { id: "r", columns: [{ type: "Column", props: { id: "c", elements: [
      { type: "Button", props: { id: "b1", action: { type: "page", pageId: "pg_ok" } } },
      { type: "Button", props: { id: "b2", action: { type: "purchase", offerId: "of_ok" } } },
      { type: "Image", props: { id: "i1", action: { type: "page", pageId: "pg_two" } } },
      { type: "Button", props: { id: "b3", action: { type: "url", url: "https://a.com" } } },
    ] } }] } }] } },
  ],
};
const targets = collectActionTargets(pageData);
check("collects nested page ids", JSON.stringify(targets.pageIds.sort()) === JSON.stringify(["pg_ok", "pg_two"]));
check("collects offer ids", JSON.stringify(targets.offerIds) === JSON.stringify(["of_ok"]));
check("collects Section + Hero ids as scroll targets", JSON.stringify(targets.sectionIds.sort()) === JSON.stringify(["hero_1", "sec_1"]));
check("empty/garbage data is safe", collectActionTargets(null).pageIds.length === 0 && collectActionTargets({ content: "x" }).offerIds.length === 0);

console.log("Rendered markup");
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const btn = (action: PageAction, extra: Record<string, unknown> = {}) =>
  html(React.createElement(ButtonRender as React.ComponentType<Record<string, unknown>>, { id: "b", text: "Go", action, style: "primary", alignment: "left", resolved, ...extra }));
check("Button: Offer renders the resolved href", btn({ type: "purchase", offerId: "of_ok" }).includes('href="https://example.com/offer/sa/of_ok"'));
// rel=noreferrer implies noopener.
check("Button: new-tab page link has target=_blank rel=noreferrer", /target="_blank"[^>]*rel="noreferrer"/.test(btn({ type: "page", pageId: "pg_ok", openInNewTab: true })));
check("Button: editing renders no href", !btn({ type: "url", url: "https://a.com" }, { editing: true }).includes("href="));
check("Button: unresolved target renders no href and no #", !/href=/.test(btn({ type: "purchase", offerId: "of_other" })));
check("Button: javascript: never reaches markup", !btn({ type: "url", url: "javascript:alert(1)" }).includes("javascript"));
const img = html(React.createElement(ImageRender as React.ComponentType<Record<string, unknown>>, { id: "i", src: "https://img.example/x.png", alt: "x", action: { type: "page", pageId: "pg_ok" }, resolved }));
check("Image: linked when its target resolves", img.includes('href="https://example.com/p/pg_ok"'));

console.log("Page defaults + width");
const root = html(React.createElement(PageRootRender, null, React.createElement("p", null, "x")));
check("new/unstyled page root paints white", /data-page-root[^>]*style="background-color:#ffffff"/.test(root));
const editRoot = html(React.createElement(PageRootRender, { editing: true }, React.createElement("p", null, "x")));
check("editor: root drop zone fills the page (drop anywhere on an empty canvas)", editRoot.includes("flex-1") && editRoot.includes("flex-col"));
check("live page: sections are never stretched", !root.includes("flex-1"));
const Rows = () => null;
const sec = (maxWidth: "contained" | "wide" | "full" | "bleed", fullWidthBackground = true) =>
  html(React.createElement(SectionRender, { id: "s", background: { type: "none" } as never, maxWidth, fullWidthBackground, paddingTop: 0, paddingBottom: 0, rows: Rows }));
check("Contained: 1024px content + side gutter", sec("contained").includes("max-width:1024px") && sec("contained").includes("px-6"));
check("Wide: 1280px content", sec("wide").includes("max-width:1280px"));
check("Full width: no max width, keeps side gutter (unchanged)", !sec("full").includes("max-width") && sec("full").includes("px-6"));
check("Edge to edge: no max width and no gutter", !sec("bleed").includes("max-width") && sec("bleed").includes("px-0") && !sec("bleed").includes("px-6"));

// ── Tenant resolution (emulator) ───────────────────────────────────────
async function tenancy() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { resolveActionTargets } = await import("../src/lib/server/page-action-targets");
  const db = getAdminDb();
  const A = "sa_act_a";
  const B = "sa_act_b";
  await Promise.all([
    db.doc(`subAccounts/${A}`).set({ name: "A", agencyId: "ag" }),
    db.doc(`subAccounts/${B}`).set({ name: "B", agencyId: "ag" }),
    db.doc("pages/act_pub_a").set({ subAccountId: A, status: "published", name: "A pub" }),
    db.doc("pages/act_draft_a").set({ subAccountId: A, status: "draft", name: "A draft" }),
    db.doc("pages/act_pub_b").set({ subAccountId: B, status: "published", name: "B pub" }),
    db.doc(`subAccounts/${A}/courseOffers/act_offer_a`).set({ subAccountId: A, visibility: "published", title: "A offer", slug: "a-offer" }),
    db.doc(`subAccounts/${A}/courseOffers/act_offer_draft`).set({ subAccountId: A, visibility: "draft", title: "A draft offer" }),
    db.doc(`subAccounts/${B}/courseOffers/act_offer_b`).set({ subAccountId: B, visibility: "published", title: "B offer" }),
  ]);
  const r = await resolveActionTargets(A, {
    pageIds: ["act_pub_a", "act_draft_a", "act_pub_b", "act_nope", "../evil"],
    offerIds: ["act_offer_a", "act_offer_draft", "act_offer_b"],
  });
  console.log("Tenant resolution (emulator)");
  check("own published page resolves to /p/{id}", !!r.pages.act_pub_a?.href.endsWith("/p/act_pub_a"));
  check("own draft page → null", r.pages.act_draft_a === null);
  check("other tenant's published page → null", r.pages.act_pub_b === null);
  check("missing page → null", r.pages.act_nope === null);
  check("malformed id ignored", !("../evil" in r.pages));
  check("own published Offer resolves to /offer/{sa}/{id}", !!r.offers.act_offer_a?.href.endsWith(`/offer/${A}/act_offer_a`));
  check("own draft Offer → null", r.offers.act_offer_draft === null);
  check("other tenant's Offer → null", r.offers.act_offer_b === null);
  const empty = await resolveActionTargets("", { pageIds: ["act_pub_a"], offerIds: [] });
  check("no sub-account → nothing resolves", Object.keys(empty.pages).length === 0);
}

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) await tenancy();
  else console.log("(tenant resolution skipped — set FIRESTORE_EMULATOR_HOST to run it)");
  console.log(`\nBuilder actions/defaults/width: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
