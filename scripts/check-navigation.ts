/**
 * Wave 2B-1 — Navigation block. Deterministic checks against the REAL
 * model (normalize + strict parse), the shared destination resolver, target
 * collection, the save boundary, the registry, root-level placement, the
 * AI / Popup allowlists and the block's server-rendered markup (landmark,
 * ARIA, builder inertness, responsive CSS). Interactions (open/close,
 * Escape, focus) are covered by the browser QA.
 * Run: pnpm check:navigation
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NAV_CTA_ACTION_TYPES,
  NAV_LABEL_MAX,
  NAV_LINK_ACTION_TYPES,
  NAV_LOGO_HEIGHT_MAX,
  NAV_LOGO_HEIGHT_MIN,
  NAV_MAX_CHILDREN,
  NAV_MAX_ITEMS,
  defaultNavigationItems,
  findNavigationProblem,
  navAction,
  normalizeNavColor,
  normalizeNavigation,
  normalizeNavigationItems,
  parseNavigation,
  resolveNavColor,
} from "../src/lib/pages-funnels/navigation";
import { collectActionTargets, resolveActionLink } from "../src/lib/pages-funnels/puck/action";
import { autoWrapRootNode } from "../src/lib/pages-funnels/puck/auto-hierarchy";
import { POPUP_ALLOWED_BLOCKS } from "../src/lib/pages-funnels/popup-content";
import { assertSafePuck } from "../src/lib/pages-funnels/ai/page-plan";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { BLOCK_ICONS } from "../src/components/pages-funnels/puck/block-icons";
import { NavigationRender, type NavigationRenderProps } from "../src/components/pages-funnels/puck/navigation-block";
import type { ResolvedActionTargets } from "../src/types/pages-funnels-puck";

let passed = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${label}`);
    throw err;
  }
};

const link = (id: string, label: string, action: unknown = { type: "none" }) => ({ id, kind: "link", label, action });
const child = (id: string, label: string, action: unknown = { type: "none" }) => ({ id, label, action });
const dropdown = (id: string, label: string, children: unknown[]) => ({ id, kind: "dropdown", label, children });
const props = (over: Record<string, unknown> = {}) => ({
  id: "Navigation-1",
  ariaLabel: "Main",
  logo: { src: "https://example.com/logo.png", alt: "Acme", height: 40 },
  items: [
    link("home", "Home", { type: "page", pageId: "page_home" }),
    link("about", "About", { type: "scroll", targetElementId: "Section-about" }),
    dropdown("services", "Services", [child("coaching", "Coaching", { type: "url", url: "https://example.com/coaching" }), child("courses", "Courses", { type: "page", pageId: "page_courses" })]),
  ],
  cta: { enabled: true, label: "Book a call", action: { type: "url", url: "https://example.com/book" }, variant: "solid" },
  mobile: { collapseAt: "mobile" },
  navStyle: {},
  ...over,
});

// ---------- DATA MODEL ----------
check("normal link item normalizes", () => {
  const [item] = normalizeNavigationItems([link("a", " Home ", { type: "url", url: "https://x.com" })]);
  assert.deepEqual(item, { id: "a", kind: "link", label: "Home", action: { type: "url", url: "https://x.com", openInNewTab: false } });
});
check("dropdown item keeps ordered children", () => {
  const [item] = normalizeNavigationItems([dropdown("d", "Services", [child("c1", "One"), child("c2", "Two")])]);
  assert.equal(item.kind, "dropdown");
  assert.deepEqual(item.kind === "dropdown" && item.children.map((c) => c.label), ["One", "Two"]);
});
check("CTA normalizes; off by default", () => {
  const nav = normalizeNavigation({});
  assert.equal(nav.cta.enabled, false);
  assert.equal(nav.ariaLabel, "Main");
  assert.equal(normalizeNavigation(props()).cta.label, "Book a call");
});
check("default items are inert placeholders with stable ids", () => {
  const items = defaultNavigationItems();
  assert.deepEqual(items.map((i) => i.label), ["Home", "About", "Contact"]);
  assert.ok(items.every((i) => i.kind === "link" && i.action.type === "none"));
});
check("lenient: malformed items dropped, nested dropdown flattened, counts and labels capped", () => {
  const items = normalizeNavigationItems([
    null,
    "x",
    dropdown("d", "Deep", [{ id: "c", label: "Child", kind: "dropdown", children: [child("g", "Grandchild")] }]),
    link("long", "L".repeat(200)),
    ...Array.from({ length: 20 }, (_, i) => link(`i${i}`, `Item ${i}`)),
  ]);
  assert.ok(items.length <= NAV_MAX_ITEMS);
  const d = items.find((i) => i.id === "d");
  assert.ok(d && d.kind === "dropdown" && d.children.length === 1 && !("children" in d.children[0]), "grandchildren never survive");
  assert.equal(items.find((i) => i.id === "long")?.label.length, NAV_LABEL_MAX);
});
check("lenient: non-array items read as an empty menu (never throws)", () => {
  assert.deepEqual(normalizeNavigationItems("nope"), []);
  assert.doesNotThrow(() => normalizeNavigation({ items: { a: 1 }, cta: 7, logo: "x", navStyle: null, mobile: [] }));
});
check("logo height clamps", () => {
  assert.equal(normalizeNavigation({ logo: { src: "a", height: 9999 } }).logo.height, NAV_LOGO_HEIGHT_MAX);
  assert.equal(normalizeNavigation({ logo: { src: "a", height: -3 } }).logo.height, NAV_LOGO_HEIGHT_MIN);
});
check("disallowed destinations read as no link (call/email/sms/popup never execute)", () => {
  for (const type of ["call", "email", "sms", "open_popup", "close_popup", "purchase"]) {
    assert.equal(navAction({ type, phoneNumber: "+15551234567", emailAddress: "a@b.co", popupId: "p", offerId: "o" }, NAV_LINK_ACTION_TYPES).type, "none", type);
  }
  assert.equal(navAction({ type: "purchase", offerId: "o" }, NAV_CTA_ACTION_TYPES).type, "purchase", "CTA may go to an Offer");
});

// ---------- STRICT VALIDATION ----------
check("valid navigation parses", () => assert.deepEqual(parseNavigation(props()), { ok: true }));
check("nested dropdown (grandchild) rejected", () => {
  const r = parseNavigation(props({ items: [dropdown("d", "D", [{ id: "c", label: "C", kind: "dropdown", children: [child("g", "G")] }])] }));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /one level deep/);
});
check("too many items / children rejected", () => {
  assert.equal(parseNavigation(props({ items: Array.from({ length: NAV_MAX_ITEMS + 1 }, (_, i) => link(`i${i}`, "x")) })).ok, false);
  assert.equal(parseNavigation(props({ items: [dropdown("d", "D", Array.from({ length: NAV_MAX_CHILDREN + 1 }, (_, i) => child(`c${i}`, "x")))] })).ok, false);
});
check("bad ids, duplicate ids, bad kind, long labels rejected", () => {
  assert.equal(parseNavigation(props({ items: [link("bad id!", "x")] })).ok, false);
  assert.equal(parseNavigation(props({ items: [link("a", "x"), link("a", "y")] })).ok, false);
  assert.equal(parseNavigation(props({ items: [{ id: "a", kind: "mega", label: "x" }] })).ok, false);
  assert.equal(parseNavigation(props({ items: [link("a", "x".repeat(NAV_LABEL_MAX + 1))] })).ok, false);
});
check("link with children / unsupported destination / unreadable destination rejected", () => {
  assert.equal(parseNavigation(props({ items: [{ ...link("a", "x"), children: [] }] })).ok, false);
  assert.equal(parseNavigation(props({ items: [link("a", "x", { type: "call", phoneNumber: "1" })] })).ok, false);
  assert.equal(parseNavigation(props({ items: [link("a", "x", { type: "url", url: 42 })] })).ok, false);
  assert.equal(parseNavigation(props({ cta: { enabled: true, label: "x", action: { type: "email", emailAddress: "a@b.co" } } })).ok, false);
  assert.equal(parseNavigation(props({ cta: { enabled: true, label: "x", action: { type: "purchase", offerId: "o1" } } })).ok, true);
});
check("in-progress destinations (chosen type, no target yet) still save", () => {
  assert.equal(parseNavigation(props({ items: [link("a", "x", { type: "page", pageId: "" })] })).ok, true);
});
check("save boundary finds the first problem across content + zones and numbers multiple navs", () => {
  const good = { type: "Navigation", props: props() };
  const bad = { type: "Navigation", props: props({ items: "x" }) };
  assert.equal(findNavigationProblem({ content: [good], root: {} }), null);
  assert.match(findNavigationProblem({ content: [good, bad], root: {} }) ?? "", /^Navigation 2:/);
  assert.ok(findNavigationProblem({ content: [], zones: { "x:y": [bad] } }));
});

// ---------- DESTINATIONS ----------
const resolved: ResolvedActionTargets = { pages: { page_home: { href: "https://acme.test/p/page_home" }, page_gone: null }, offers: {}, sectionIds: ["Section-about"] };
check("Page destination resolves through the shared same-tenant targets", () => {
  assert.equal(resolveActionLink({ type: "page", pageId: "page_home" }, { resolved }).href, "https://acme.test/p/page_home");
});
check("stale / cross-tenant / unpublished Page renders no link (never retargeted)", () => {
  assert.equal(resolveActionLink({ type: "page", pageId: "page_gone" }, { resolved }).href, null);
  assert.equal(resolveActionLink({ type: "page", pageId: "page_unknown" }, { resolved }).href, null);
});
check("URL destination uses the shared safe-scheme check", () => {
  assert.equal(resolveActionLink({ type: "url", url: "https://example.com" }, { resolved }).href, "https://example.com");
  assert.equal(resolveActionLink({ type: "url", url: "javascript:alert(1)" }, { resolved }).href, null);
});
check("Section destination resolves only to a Section on this page", () => {
  assert.equal(resolveActionLink({ type: "scroll", targetElementId: "Section-about" }, { resolved }).href, "#Section-about");
  assert.equal(resolveActionLink({ type: "scroll", targetElementId: "Section-deleted" }, { resolved }).href, null);
});
check("builder never renders a link", () => {
  assert.equal(resolveActionLink({ type: "url", url: "https://example.com" }, { resolved, editing: true }).href, null);
});
check("target collection includes menu links, sub-items and the CTA", () => {
  const targets = collectActionTargets({
    content: [
      { type: "Navigation", props: props({ cta: { enabled: true, label: "Buy", action: { type: "purchase", offerId: "offer_1" } } }) },
      { type: "Section", props: { id: "Section-about", rows: [] } },
    ],
  });
  assert.deepEqual(targets.pageIds.sort(), ["page_courses", "page_home"]);
  assert.deepEqual(targets.offerIds, ["offer_1"]);
  assert.deepEqual(targets.sectionIds, ["Section-about"]);
});

// ---------- COLORS (Brand Colors architecture) ----------
check("colors: default / brand by stable id / custom; removed brand color falls back to default", () => {
  const kit = [{ id: "b1", hex: "#2F5D50" }, { id: "b2", hex: "#C42A7B" }];
  assert.equal(resolveNavColor(normalizeNavColor(undefined), kit), null);
  assert.equal(resolveNavColor(normalizeNavColor({ source: "brand", brandColorId: "b2" }), kit), "#C42A7B");
  assert.equal(resolveNavColor(normalizeNavColor({ source: "brand" }), kit), "#2F5D50", "no id follows Primary");
  assert.equal(resolveNavColor(normalizeNavColor({ source: "brand", brandColorId: "gone" }), kit), null);
  assert.equal(resolveNavColor(normalizeNavColor({ source: "custom", custom: "#abc" }), kit), "#AABBCC", "the shared hex normalizer");
  assert.equal(normalizeNavColor({ source: "custom", custom: "red" }).source, "default", "non-hex custom falls back");
  assert.equal(resolveNavColor(normalizeNavColor({ source: "custom", custom: "#aabbcc" }), kit), "#AABBCC");
  assert.equal(normalizeNavColor({ source: "magnetix" }).source, "default", "no internal palette source exists");
});

// ---------- REGISTRY / PLACEMENT / AI / POPUPS ----------
check("registered in Elements with label + icon", () => {
  assert.ok(clientPuckConfig.categories?.elements?.components?.includes("Navigation"));
  assert.equal(clientPuckConfig.components.Navigation?.label, "Navigation");
  assert.ok(BLOCK_ICONS.Navigation);
});
check("root-level: never auto-wrapped, never allowed inside a Column", () => {
  const node = { type: "Navigation", props: { id: "n" } } as never;
  assert.equal(autoWrapRootNode(node), node);
  const columnAllow = (clientPuckConfig.components.Column?.fields as Record<string, { allow?: string[] }>).elements.allow ?? [];
  assert.ok(!columnAllow.includes("Navigation"));
});
check("not offered inside Popups", () => assert.ok(!POPUP_ALLOWED_BLOCKS.has("Navigation")));
check("AI page generation cannot emit Navigation", () => {
  assert.throws(() => assertSafePuck({ root: { props: {} }, content: [{ type: "Navigation", props: { id: "n" } }] } as never), /unsupported component/);
});

// ---------- RENDER: landmark, ARIA, builder vs visitor ----------
const render = (over: Record<string, unknown> = {}, opts: { editing?: boolean } = {}) =>
  renderToStaticMarkup(h(NavigationRender, { ...(props(over) as unknown as NavigationRenderProps), resolved, editing: opts.editing ?? false }));

check("nav landmark with accessible name", () => {
  const html = render();
  assert.match(html, /<nav[^>]*aria-label="Main"/);
});
check("logo renders with alt text; no logo renders without crashing (no placeholder for visitors)", () => {
  assert.match(render(), /<img[^>]*alt="Acme"/);
  const bare = render({ logo: { src: "" } });
  assert.doesNotMatch(bare, /data-nav-logo/);
});
check("visitor links resolve; dropdown parent is a button, not a link", () => {
  const html = render();
  assert.match(html, /href="https:\/\/acme\.test\/p\/page_home"/);
  assert.match(html, /href="#Section-about"/);
  assert.match(html, /href="https:\/\/example\.com\/coaching"/);
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+-services-menu"[^>]*data-nav-dropdown="services"/);
});
check("submenu is associated by id and hidden until opened", () => {
  const html = render();
  const controls = /aria-controls="([^"]+-services-menu)"/.exec(html)?.[1];
  assert.ok(controls && html.includes(`id="${controls}"`));
  assert.match(html, /<div class="absolute[^"]*" hidden="">/);
});
check("stale Page target renders an inert label (no href)", () => {
  const html = render({ items: [link("x", "Gone", { type: "page", pageId: "page_gone" })] });
  assert.match(html, /<a aria-disabled="true" data-nav-link="x"/);
});
check("hamburger: accessible name, expanded state, controls the mobile panel", () => {
  const html = render();
  const m = /<button[^>]*data-nav-toggle=""[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*aria-label="Open menu"/.exec(html);
  assert.ok(m, "hamburger attributes");
  assert.match(html, new RegExp(`id="${m[1]}"[^>]*data-nav-mobile-panel=""[^>]*hidden=""`));
});
check("mobile panel holds items, dropdown parents (buttons) and the CTA", () => {
  const html = render();
  const panel = html.slice(html.indexOf("data-nav-mobile-panel"));
  assert.match(panel, /data-nav-mobile-dropdown="services"/);
  assert.match(panel, /data-nav-mobile-child="courses"/);
  assert.match(panel, /data-nav-cta=""/);
});
check("responsive CSS is scoped and uses the chosen breakpoint (767 / 1279)", () => {
  assert.match(render(), /@media \(max-width:767px\)\{\[data-nav-root="Navigation-1"\] \[data-nav-desktop\]\{display:none\}/);
  assert.match(render({ mobile: { collapseAt: "tablet" } }), /@media \(max-width:1279px\)/);
});
check("CTA renders only when enabled", () => {
  assert.match(render(), /data-nav-cta=""[^>]*>Book a call/);
  assert.doesNotMatch(render({ cta: { enabled: false, label: "x" } }), /data-nav-cta/);
});
check("builder: no hrefs anywhere, placeholders visible", () => {
  const html = render({ logo: { src: "" }, items: [link("a", ""), dropdown("d", "Services", [])] }, { editing: true });
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /data-nav-logo=""[^>]*>Logo/);
  assert.match(html, /No sub-items yet/);
});
check("visitor: empty labels and empty dropdowns are not shown", () => {
  const html = render({ items: [link("a", ""), dropdown("d", "Empty", []), link("b", "Shown", { type: "url", url: "https://x.com" })] });
  assert.doesNotMatch(html, /data-nav-item="a"/);
  assert.doesNotMatch(html, /data-nav-item="d"/);
  assert.match(html, /data-nav-item="b"/);
});
check("colors: brand background picks a readable link color; custom CTA gets readable text", () => {
  const html = renderToStaticMarkup(
    h(NavigationRender, {
      ...(props({ navStyle: { background: { source: "brand", brandColorId: "dark" }, ctaColor: { source: "custom", custom: "#FFD000" } } }) as unknown as NavigationRenderProps),
      resolved,
      brandKit: [{ id: "dark", hex: "#111111" }],
    }),
  );
  assert.match(html, /<nav[^>]*style="background-color:#111111;color:#FFFFFF"/i);
  assert.match(html, /data-nav-cta=""[^>]*style="background-color:#FFD000;color:#1/i);
});
check("two navigations render independently (own ids, own names, own items)", () => {
  const a = render({ id: "Nav-A", ariaLabel: "Main" });
  const b = render({ id: "Nav-B", ariaLabel: "Footer", items: [link("f", "Privacy", { type: "url", url: "https://x.com/p" })] });
  assert.match(a, /data-nav-root="Nav-A"/);
  assert.match(b, /data-nav-root="Nav-B"[\s\S]*Privacy/);
  assert.doesNotMatch(b, /Services/);
});

console.log(`Navigation checks: ${passed} passed`);
