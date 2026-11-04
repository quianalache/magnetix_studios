/**
 * Wave 2C — Pricing / Comparison block. Deterministic checks.
 *
 * Offline: model (defaults, lenient render, strict save, limits), all seven
 * price display modes, presentation (previous price, badge, captions,
 * featured, list), the three layouts over ONE card list (layout switching
 * loses nothing), stable ids + one comparison cell per card (resolveData
 * sync), card buttons through the shared action resolver (no Offer link),
 * inline-editor values kept intact, empty state, registry / guard / Popup /
 * AI integration, multiple independent blocks.
 * Emulator (FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-*): Save Draft,
 * reload, Publish, draft/published isolation, strict save refusals.
 *
 * Run: pnpm check:pricing
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PRICE_MODES,
  PRICING_LIMITS,
  cellFor,
  defaultPricingProps,
  findPricingProblem,
  normalizePricing,
  plainText,
  pricingBlockProblem,
  syncPricingProps,
} from "../src/lib/pages-funnels/pricing";
import { PricingComparisonRender } from "../src/components/pages-funnels/puck/pricing-block";
import { collectActionTargets } from "../src/lib/pages-funnels/puck/action";
import { findUnknownBlockTypes, KNOWN_PUCK_BLOCK_TYPES } from "../src/lib/pages-funnels/puck/known-blocks";
import { POPUP_ALLOWED_BLOCKS } from "../src/lib/pages-funnels/popup-content";
import { assertSafePuck } from "../src/lib/pages-funnels/ai/page-plan";
import { autoWrapRootNode } from "../src/lib/pages-funnels/puck/auto-hierarchy";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { BLOCK_ICONS } from "../src/components/pages-funnels/puck/block-icons";
import type { Data } from "@puckeditor/core";
import type { ResolvedActionTargets } from "../src/types/pages-funnels-puck";

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
const D = defaultPricingProps();
const html = (props: Record<string, unknown>, opts: { editing?: boolean; resolved?: ResolvedActionTargets } = {}) =>
  renderToStaticMarkup(h(PricingComparisonRender, { id: "Pricing-1", ...D, ...props, ...opts }));
const withCard = (i: number, over: Record<string, unknown>) => ({ cards: D.cards.map((c, j) => (j === i ? { ...c, ...over } : c)) });
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function offline() {
  // ---- model ----
  await check("default: polished 3-card Grid, one featured card, generic copy, generic comparison label", () => {
    assert.equal(D.layout, "grid");
    assert.equal(D.cards.length, 3);
    assert.equal(D.cards.filter((c) => c.featured).length, 1);
    assert.equal(D.tableLabel, "What's included");
    assert.ok(!JSON.stringify(D).includes("Magnetix"));
    assert.equal(pricingBlockProblem(D), null);
  });
  await check("default rows hold one cell per card, keyed by card id", () => {
    for (const row of D.rows) assert.deepEqual(row.cells.map((c) => c.cardId), D.cards.map((c) => c.id));
  });
  await check("lenient render: malformed data never throws and falls back safely", () => {
    for (const bad of [null, 7, "x", [], { cards: "x", rows: 5, layout: "mosaic", pricingStyle: [] }, { cards: [null, 3, { priceMode: "barter", items: "no" }] }]) {
      const p = normalizePricing(bad);
      assert.ok(Array.isArray(p.cards) && Array.isArray(p.rows));
      assert.ok(["grid", "carousel", "table"].includes(p.layout));
      assert.doesNotThrow(() => renderToStaticMarkup(h(PricingComparisonRender, { id: "x", ...(bad && typeof bad === "object" && !Array.isArray(bad) ? bad : {}) })));
    }
    assert.equal(normalizePricing({ cards: [{ priceMode: "barter" }] }).cards[0].priceMode, "fixed");
  });
  await check("lenient render: caps counts and lengths", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, title: "x".repeat(500), items: Array.from({ length: 50 }, (_, j) => ({ id: `i${j}`, text: "y" })) }));
    const p = normalizePricing({ cards: many });
    assert.equal(p.cards.length, PRICING_LIMITS.cards);
    assert.equal((p.cards[0].title as string).length, PRICING_LIMITS.title);
    assert.equal(p.cards[0].items.length, PRICING_LIMITS.items);
  });
  await check("strict save: every malformed field is refused with a plain reason", () => {
    const bad = (over: Record<string, unknown>) => pricingBlockProblem({ ...D, ...over });
    assert.match(bad({ layout: "classic" })!, /unknown layout/);
    assert.match(bad({ cards: "x" })!, /cards couldn't be read/);
    assert.match(bad({ cards: Array.from({ length: 9 }, (_, i) => ({ ...D.cards[0], id: `c${i}` })) })!, /at most 8 cards/);
    assert.match(bad(withCard(0, { id: "" }))!, /missing its id/);
    assert.match(bad({ cards: [D.cards[0], { ...D.cards[1], id: D.cards[0].id }] })!, /missing its id/);
    assert.match(bad(withCard(0, { priceMode: "barter" }))!, /unknown price display/);
    assert.match(bad(withCard(0, { title: "x".repeat(81) }))!, /title can be at most 80/);
    assert.match(bad(withCard(0, { badge: 5 }))!, /badge/);
    assert.match(bad(withCard(0, { items: Array.from({ length: 21 }, (_, i) => ({ id: `i${i}`, text: "x" })) }))!, /at most 20 list items/);
    assert.match(bad(withCard(0, { action: "url" }))!, /destination couldn't be read/);
    assert.match(bad({ rows: [{ id: "r", label: "x", cells: [{ cardId: "a", kind: "maybe" }] }] })!, /unknown value type/);
    assert.match(bad({ rows: [{ id: "r", label: "x" }, { id: "r", label: "y" }] })!, /missing its id/);
    assert.match(bad({ pricingStyle: { appearance: "neon" } })!, /appearance/);
    assert.match(bad({ heading: "x".repeat(161) })!, /heading can be at most/);
  });
  await check("findPricingProblem walks nested Section → Row → Column", () => {
    const page = (props: unknown) => ({ content: [{ type: "Section", props: { id: "s", rows: [{ type: "Row", props: { id: "r", columns: [{ type: "Column", props: { id: "c", elements: [{ type: "PricingComparison", props }] } }] } }] } }] });
    assert.equal(findPricingProblem(page(D)), null);
    assert.match(findPricingProblem(page({ ...D, layout: "x" }))!, /layout/);
  });

  // ---- price modes ----
  const priceText = (mode: string, over: Record<string, unknown> = {}) => text(html({ ...withCard(0, { priceMode: mode, price: "$99", priceTo: "$1,500", period: "month", customPrice: "", previousPrice: "", ...over }) })).split("Growth")[0];
  await check("Fixed: $99", () => {
    assert.match(priceText("fixed"), /\$99/);
    assert.doesNotMatch(priceText("fixed"), /\/ month/);
  });
  await check("Subscription: $79 / month", () => assert.match(priceText("subscription", { price: "$79" }), /\$79 \/ month/));
  await check("From: From $500", () => assert.match(priceText("from", { price: "$500" }), /From \$500/));
  await check("Range: $500–$1,500", () => assert.match(priceText("range", { price: "$500" }), /\$500 – \$1,500/));
  await check("Per unit: $20 / seat", () => assert.match(priceText("perUnit", { price: "$20", period: "seat" }), /\$20 \/ seat/));
  await check("Free: 'Free' by default, or the owner's text", () => {
    assert.match(priceText("free"), /Free/);
    assert.match(priceText("free", { customPrice: "No cost" }), /No cost/);
  });
  await check("Custom: 'Let’s talk' by default, or the owner's text", () => {
    assert.match(priceText("custom"), /Let’s talk/);
    assert.match(priceText("custom", { customPrice: "Request a quote" }), /Request a quote/);
  });
  await check("every price mode renders without errors", () => {
    for (const mode of PRICE_MODES) assert.doesNotThrow(() => html(withCard(0, { priceMode: mode })));
  });

  // ---- presentation ----
  await check("previous price: struck through, announced as 'Previously … now'", () => {
    const out = html({});
    assert.match(out, /<s data-pricing-field="previousPrice">\$159<\/s>/);
    assert.match(out, /Previously/);
  });
  await check("badge, billing label, pricing caption, button caption render; empty ones are omitted publicly", () => {
    const out = html(withCard(0, { pricingCaption: "Taxes not included" }));
    assert.match(out, /Most popular/);
    assert.match(out, /Billed monthly/);
    assert.match(out, /Taxes not included/);
    assert.match(out, /Cancel anytime/);
    const bare = html(withCard(1, { badge: "", ctaCaption: "", billingLabel: "" }));
    assert.equal((bare.match(/data-pricing-field="badge"/g) ?? []).length, 0);
  });
  await check("featured card is marked and emphasized; list items render in order", () => {
    const out = html({});
    assert.match(out, /data-pricing-card="card-growth" data-featured="true"/);
    assert.ok(out.indexOf("Everything in Starter") < out.indexOf("Expanded deliverables"));
  });
  await check("headings: block h2, card titles h3", () => {
    const out = html({});
    assert.match(out, /<h2[^>]*>Choose the plan/);
    assert.equal((out.match(/<h3/g) ?? []).length, 3);
  });

  // ---- layouts ----
  await check("Grid: wrapping flexible columns (min 12.5rem → up to 5 across), width capped by card count", () => {
    const out = html({ layout: "grid" });
    assert.match(out, /data-pricing-grid/);
    assert.match(out, /minmax\(min\(100%, 12.5rem\), 1fr\)/);
    assert.match(out, /max-width:calc\(3 \* 22rem \+ 2 \* 24px\)/);
  });
  await check("Carousel: named region, slides labelled 'n of N', named Previous/Next buttons, no auto-advance", () => {
    const out = html({ layout: "carousel" });
    assert.match(out, /role="region" aria-roledescription="carousel"/);
    assert.match(out, /aria-roledescription="slide" aria-label="1 of 3"/);
    assert.match(out, /aria-label="Previous plans"/);
    assert.match(out, /aria-label="Next plans"/);
    assert.match(out, /tabindex="0"/);
    assert.doesNotMatch(out, /setInterval|autoplay/i);
  });
  await check("Comparison table: real table, caption, column + row headers, owner-named first column, included/excluded announced", () => {
    const out = html({ layout: "table" });
    assert.match(out, /<table/);
    assert.match(out, /<caption class="sr-only">/);
    assert.equal((out.match(/<th scope="col"/g) ?? []).length, 4);
    assert.equal((out.match(/<th scope="row"/g) ?? []).length, D.rows.length);
    assert.match(out, /What&#x27;s included/);
    assert.match(out, /Not included/);
    assert.match(out, />Included</);
    assert.match(out, /sticky left-0/);
    assert.match(out, /role="region" aria-label="[^"]*scroll sideways/);
  });
  await check("first column heading is never hard-coded 'Features'; blank heading stays blank (sr-only label)", () => {
    assert.doesNotMatch(html({ layout: "table" }), /Features/);
    assert.match(html({ layout: "table", tableLabel: "Benefits" }), />Benefits</);
    assert.match(html({ layout: "table", tableLabel: "" }), /sr-only">Plan details/);
  });
  await check("layout switching keeps every card and row (one shared card list)", () => {
    const grid = html({ layout: "grid" }), carousel = html({ layout: "carousel" }), table = html({ layout: "table" });
    for (const out of [grid, carousel]) for (const c of D.cards) assert.ok(out.includes(c.title as string));
    for (const c of D.cards) assert.ok(table.includes(c.title as string));
    assert.deepEqual(normalizePricing({ ...D, layout: "table" }).cards, normalizePricing({ ...D, layout: "grid" }).cards);
  });

  // ---- sync (resolveData) ----
  await check("sync: unchanged props are returned as the SAME object (opening a page never rewrites it)", () => {
    assert.equal(syncPricingProps(D as unknown as Record<string, unknown>), D);
  });
  await check("sync: a new card gets an id and an empty cell in every row; a removed card's cells are dropped", () => {
    const added = syncPricingProps({ ...D, cards: [...D.cards, { title: "New" }] } as unknown as Record<string, unknown>) as unknown as typeof D;
    const newId = added.cards[3].id;
    assert.match(newId, /^card[-_]/);
    for (const row of added.rows) assert.deepEqual(row.cells.map((c) => c.cardId), [...D.cards.map((c) => c.id), newId]);
    const removed = syncPricingProps({ ...D, cards: D.cards.slice(1) } as unknown as Record<string, unknown>) as unknown as typeof D;
    for (const row of removed.rows) assert.deepEqual(row.cells.map((c) => c.cardId), D.cards.slice(1).map((c) => c.id));
  });
  await check("sync: a duplicated card gets a new id and a copy of the original's cells", () => {
    const dup = syncPricingProps({ ...D, cards: [...D.cards, { ...D.cards[1] }] } as unknown as Record<string, unknown>) as unknown as typeof D;
    const copy = dup.cards[3];
    assert.notEqual(copy.id, D.cards[1].id);
    const row = dup.rows.find((r) => r.id === "row-priority")!;
    assert.equal(cellFor(row, copy.id)?.kind, cellFor(row, D.cards[1].id)?.kind);
  });
  await check("sync: reordering cards reorders cells to match, values follow their card", () => {
    const re = syncPricingProps({ ...D, cards: [...D.cards].reverse() } as unknown as Record<string, unknown>) as unknown as typeof D;
    const row = re.rows.find((r) => r.id === "row-projects")!;
    assert.deepEqual(row.cells.map((c) => c.text), ["Unlimited", "Up to 3", "1"]);
  });
  await check("sync: missing / duplicate item and row ids are fixed", () => {
    const fixed = syncPricingProps({ ...D, cards: [{ ...D.cards[0], items: [{ text: "a" }, { text: "b", id: "x" }, { text: "c", id: "x" }] }], rows: [{ label: "r", cells: [] }] } as unknown as Record<string, unknown>) as unknown as typeof D;
    const ids = fixed.cards[0].items.map((i) => i.id);
    assert.equal(new Set(ids).size, 3);
    assert.match(fixed.rows[0].id, /^row[-_]/);
    assert.equal(pricingBlockProblem(fixed), null);
  });

  // ---- actions (shared destination system; no Offer coupling) ----
  const actions = { type: "Section", props: { id: "s", rows: [] } };
  await check("card buttons are collected as page action targets (Page, Offer, Booking)", () => {
    const props = { ...D, cards: [
      { ...D.cards[0], action: { type: "page", pageId: "pg_1" } },
      { ...D.cards[1], action: { type: "purchase", offerId: "of_1" } },
      { ...D.cards[2], action: { type: "booking", bookingPageSlug: "call" } },
    ] };
    const t = collectActionTargets({ content: [actions, { type: "PricingComparison", props }] });
    assert.deepEqual([t.pageIds, t.offerIds, t.bookingSlugs], [["pg_1"], ["of_1"], ["call"]]);
  });
  await check("published: buttons link through the resolver; unresolved → no link; builder → never a link", () => {
    const resolved: ResolvedActionTargets = { pages: { pg_1: { href: "https://x.test/p/pg_1" } }, offers: { of_1: { href: "https://x.test/offer/of_1" } }, bookings: { call: { href: "https://x.test/b/call" } }, sectionIds: ["Section-a"] };
    const props = { cards: [
      { ...D.cards[0], action: { type: "page", pageId: "pg_1" } },
      { ...D.cards[1], action: { type: "purchase", offerId: "of_1" } },
      { ...D.cards[2], action: { type: "booking", bookingPageSlug: "call" } },
    ] };
    const out = html(props, { resolved });
    for (const href of ["https://x.test/p/pg_1", "https://x.test/offer/of_1", "https://x.test/b/call"]) assert.ok(out.includes(`href="${href}"`), href);
    assert.ok(!/href=/.test(html(props, { resolved, editing: true })), "builder buttons never link");
    assert.ok(!/href="https:\/\/x.test/.test(html(props, { resolved: { pages: {}, offers: {}, bookings: {}, sectionIds: [] } })), "unresolved → no link");
    const misc = html({ cards: [{ ...D.cards[0], action: { type: "url", url: "https://example.com" } }, { ...D.cards[1], action: { type: "scroll", targetElementId: "Section-a" } }, { ...D.cards[2], action: { type: "email", emailAddress: "a@b.co" } }] }, { resolved });
    assert.ok(misc.includes('href="https://example.com"') && misc.includes('href="#Section-a"') && misc.includes('href="mailto:a@b.co"'));
  });
  await check("no Offer required: a card with no action and arbitrary price copy is valid and renders", () => {
    const p = { ...D, cards: [{ ...D.cards[0], price: "$49", action: { type: "none" } }] };
    assert.equal(pricingBlockProblem(syncPricingProps(p as unknown as Record<string, unknown>)), null);
    assert.match(html(p), /\$49/);
    assert.ok(!JSON.stringify(D.cards).includes("offerId"));
  });

  // ---- inline editing contract ----
  await check("inline-editor values (React nodes) pass through intact; plainText reads their value", () => {
    const node = h("span", { "data-inline": "1", value: "Essentials" } as Record<string, unknown>);
    const p = normalizePricing({ ...D, heading: node, cards: [{ ...D.cards[0], title: node }] });
    assert.equal(p.heading, node);
    assert.equal(p.cards[0].title, node);
    assert.equal(plainText(node), "Essentials");
    assert.match(html({ heading: node, cards: [{ ...D.cards[0], title: node, badge: "" }] }, { editing: true }), /data-inline="1"/);
  });
  await check("every visible copy field is declared contentEditable (heading, subheading, card + list + button text, table heading, rows, cells)", () => {
    const f = (clientPuckConfig as unknown as { components: Record<string, { fields: Record<string, { contentEditable?: boolean; arrayFields?: Record<string, { contentEditable?: boolean; arrayFields?: Record<string, { contentEditable?: boolean }> }> }> }> }).components.PricingComparison.fields;
    for (const k of ["heading", "subheading", "tableLabel"]) assert.equal(f[k].contentEditable, true, k);
    const card = f.cards.arrayFields!;
    for (const k of ["title", "description", "badge", "price", "priceTo", "period", "customPrice", "previousPrice", "billingLabel", "pricingCaption", "ctaLabel", "ctaCaption"]) assert.equal(card[k].contentEditable, true, k);
    assert.equal(card.items.arrayFields!.text.contentEditable, true);
    assert.equal(f.rows.arrayFields!.label.contentEditable, true);
    assert.equal(f.rows.arrayFields!.cells.arrayFields!.text.contentEditable, true);
    const button = (clientPuckConfig as unknown as { components: Record<string, { fields: Record<string, { contentEditable?: boolean }> }> }).components.Button.fields;
    assert.equal(button.text.contentEditable, true, "Button label is inline-editable");
  });

  // ---- empty state, registry, guard, Popup, AI ----
  await check("empty: builder shows 'Add your first pricing card'; public renders nothing", () => {
    assert.match(html({ cards: [] }, { editing: true }), /Add your first pricing card/);
    assert.equal(html({ cards: [] }), "");
  });
  await check("registry: Business category, Column placement, icon, known to the unknown-block guard", () => {
    const cfg = clientPuckConfig as unknown as { components: Record<string, { label?: string }>; categories: Record<string, { components?: string[] }> };
    assert.equal(cfg.components.PricingComparison.label, "Pricing / Comparison");
    assert.ok(cfg.categories.business.components!.includes("PricingComparison"));
    assert.ok(cfg.categories.business.components!.includes("OfferSummary"), "simpler Pricing / Offer Summary kept");
    assert.ok((cfg.components.Column as unknown as { fields: { elements: { allow: string[] } } }).fields.elements.allow.includes("PricingComparison"));
    assert.ok(BLOCK_ICONS.PricingComparison);
    assert.ok((KNOWN_PUCK_BLOCK_TYPES as readonly string[]).includes("PricingComparison"));
    assert.deepEqual(findUnknownBlockTypes({ content: [{ type: "PricingComparison", props: { id: "p", ...D } }] }), []);
    assert.equal((autoWrapRootNode({ type: "PricingComparison", props: { id: "p" } } as never) as { type: string }).type, "Section");
  });
  await check("not in Popups; AI page generation can't produce it", () => {
    assert.ok(!POPUP_ALLOWED_BLOCKS.has("PricingComparison"));
    assert.throws(() => assertSafePuck({ root: { props: {} }, content: [{ type: "PricingComparison", props: { id: "p", ...D } }] } as unknown as Data));
  });
  await check("multiple blocks: independent markup, no duplicate DOM ids", () => {
    const out = renderToStaticMarkup(h("div", null,
      h(PricingComparisonRender, { id: "Pricing-a", ...D, layout: "carousel" }),
      h(PricingComparisonRender, { id: "Pricing-b", ...D, layout: "table" }),
      h(PricingComparisonRender, { id: "Pricing-c", ...D, layout: "grid" })));
    const ids = [...out.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, ids.join(","));
  });
}

async function emulator() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { savePuckDraft, publishPuckPage } = await import("../src/lib/server/pages-funnels-puck-service");
  const { readStoredPuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const db = getAdminDb();
  const SA = `sa_${Date.now()}`, PAGE = `pg_pricing_${Date.now()}`;
  const page = (props: Record<string, unknown>) => ({ root: { props: {} }, content: [{ type: "Section", props: { id: "Section-1", rows: [{ type: "Row", props: { id: "Row-1", columns: [{ type: "Column", props: { id: "Column-1", elements: [{ type: "PricingComparison", props: { id: "Pricing-1", ...D, ...props } }] } }] } }] } }] }) as unknown as Data;
  const pricingOf = (raw: unknown) => ((readStoredPuckData(raw) as unknown as { content: { props: { rows: { props: { columns: { props: { elements: { props: Record<string, unknown> }[] } }[] } }[] } }[] }).content[0].props.rows[0].props.columns[0].props.elements[0].props);
  try {
    await db.doc(`pages/${PAGE}`).set({ subAccountId: SA, name: "QA", status: "draft" });
    await check("Publish A, Save Draft B: draft holds B (heading, card title, price, CTA), public stays A", async () => {
      assert.equal((await publishPuckPage(SA, PAGE, page({}), {})).ok, true);
      const edited = page({ heading: "Pick your plan", layout: "carousel", ...withCard(0, { title: "Essentials", price: "$39", ctaLabel: "Start now", action: { type: "url", url: "https://example.com" } }) });
      assert.equal((await savePuckDraft(SA, PAGE, edited, {})).ok, true);
      const doc = (await db.doc(`pages/${PAGE}`).get()).data()!;
      assert.equal(doc.puckDraftData.encoding, "puck-json-v1");
      const draft = pricingOf(doc.puckDraftData), pub = pricingOf(doc.puckPublishedData);
      assert.equal(draft.heading, "Pick your plan");
      assert.equal((draft.cards as { title: string }[])[0].title, "Essentials");
      assert.equal(draft.layout, "carousel");
      assert.equal(pub.heading, D.heading);
      assert.equal((pub.cards as { title: string }[])[0].title, "Starter");
    });
    await check("reload round-trip keeps ids, rows, cells, style", async () => {
      const draft = pricingOf((await db.doc(`pages/${PAGE}`).get()).data()!.puckDraftData);
      assert.deepEqual((draft.cards as { id: string }[]).map((c) => c.id), D.cards.map((c) => c.id));
      assert.deepEqual(draft.rows, JSON.parse(JSON.stringify(D.rows)));
    });
    await check("Publish: public updates", async () => {
      const doc = (await db.doc(`pages/${PAGE}`).get()).data()!;
      assert.equal((await publishPuckPage(SA, PAGE, readStoredPuckData(doc.puckDraftData)!, {})).ok, true);
      assert.equal(pricingOf((await db.doc(`pages/${PAGE}`).get()).data()!.puckPublishedData).heading, "Pick your plan");
    });
    await check("strict save refuses malformed Pricing and changes nothing", async () => {
      const before = JSON.stringify((await db.doc(`pages/${PAGE}`).get()).data());
      const r = await savePuckDraft(SA, PAGE, page({ layout: "classic" }), {});
      assert.equal(r.ok, false);
      assert.match((r as { error: string }).error, /unknown layout/);
      assert.equal(JSON.stringify((await db.doc(`pages/${PAGE}`).get()).data()), before);
    });
  } finally {
    await db.doc(`pages/${PAGE}`).delete().catch(() => {});
  }
}

async function main() {
  await offline();
  const emu = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emu) await emulator();
  console.log(`Pricing / Comparison checks: ${passed} passed${emu ? " (incl. emulator persistence)" : " (offline; set the emulator env for persistence)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
