/**
 * Saved page templates (2026-10-12) — library, snapshot, insertion and UI
 * wiring checks (pure + server-rendered markup + source guards). Server
 * storage, tenancy, rename and delete: check-report-page-templates-service.ts
 * (emulators).
 *
 * Run: NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-report-page-templates.tsx
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { REPORT_TEMPLATES, REPORT_TEMPLATE_PAGE_TYPES, filterReportTemplates, instantiateReportTemplate, type ReportTemplate } from "../src/lib/energetics/report-templates";
import {
  PageTemplateError,
  isExpiringSignedUrl,
  isValidSavedPageType,
  savedTemplatePageTypes,
  savedTemplateToLibrary,
  snapshotPageForTemplate,
  type ReportPageTemplateRecord,
} from "../src/lib/energetics/report-page-templates";
import { ReportTemplateThumbnail } from "../src/components/energetic-decoder/report-template-library";
import { ReportChartDesignSetsContext } from "../src/components/energetic-decoder/report-chart-preview";
import { REPORT_BUILDER_FIXTURE_READING } from "../src/lib/energetics/report-builder-fixture";
import { resolvePagesForRender } from "../src/lib/energetics/report-shortcode-render";
import { attachChartDesignsFromSets, elementChartDesigns } from "../src/lib/energetics/report-charts";
import type { ChartDesignSetWithMembers } from "../src/types/chart-design-set";
import type { ReportCanvasElement, ReportPage } from "../src/types/report-blocks";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const el = (id: string, type: string, payload: Record<string, unknown>, extra: Partial<ReportCanvasElement> = {}): ReportCanvasElement =>
  ({ id, type, zIndex: 0, geometry: { x: 10, y: 10, width: 200, height: 80, rotation: 0 }, style: { fontSize: 18, color: "#123456" }, payload, ...extra }) as ReportCanvasElement;
const sourcePage = (): ReportPage => ({
  id: "src-page",
  title: "Client Welcome",
  visibleIf: { attribute: "definedCenters", operator: "contains", value: "heart" },
  centerKey: "heart",
  blocks: [],
  elements: [
    el("a", "text", { text: "Welcome, {{first_name}} — your {{center_name}}" }),
    el("b", "shortcode", { token: "center_text", resolvedText: "FROZEN" }),
    el("c", "chart", { piece: "human-design-bodygraph", chartDesignSetId: "set-violet", chartDesigns: { humanDesign: { chartDefinedColor: "#ff0000" } } }),
    el("d", "image", { url: "https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=t", alt: "Me" }, { style: { borderRadius: 100 } }),
    el("e", "frame", { shape: "rectangle", frame: true }, { zIndex: 3 }),
  ],
});
let seq = 0;
const record = (over: Partial<ReportPageTemplateRecord>): ReportPageTemplateRecord => ({
  id: `t${++seq}`,
  subAccountId: "sa",
  createdByUid: "u",
  name: "Saved",
  system: "humanDesign",
  pageType: "About Me",
  page: snapshotPageForTemplate(sourcePage()),
  createdAt: `2026-10-12T10:0${seq}:00.000Z`,
  updatedAt: null,
  ...over,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

async function main() {
  console.log("\nSnapshot");
  await check("a template keeps the page as designed (no page id) and drops only render-time fields", () => {
    const s = snapshotPageForTemplate(sourcePage()) as ReportPage;
    assert.equal(s.id, undefined);
    assert.equal(s.title, "Client Welcome");
    assert.deepEqual(s.visibleIf, sourcePage().visibleIf, "visibility");
    assert.equal(s.centerKey, "heart", "Page Center");
    const by = Object.fromEntries(s.elements!.map((e) => [e.id, e]));
    assert.equal(by.a.payload.text, "Welcome, {{first_name}} — your {{center_name}}", "inline tokens never resolved");
    assert.deepEqual(by.b.payload, { token: "center_text" }, "token kept, frozen value dropped");
    assert.deepEqual(by.c.payload, { piece: "human-design-bodygraph", chartDesignSetId: "set-violet" }, "chart part + design reference, no colors");
    assert.equal(by.d.payload.url, sourcePage().elements![3].payload.url);
    assert.deepEqual(s.elements!.map((e) => [e.geometry, e.style, e.zIndex]), sourcePage().elements!.map((e) => [e.geometry, e.style, e.zIndex]), "geometry, styles, z-order exact");
  });
  await check("bad Page Center values are dropped; invalid pages / too many elements refused", () => {
    assert.equal((snapshotPageForTemplate({ ...sourcePage(), centerKey: "nope" as never }) as ReportPage).centerKey, undefined);
    assert.throws(() => snapshotPageForTemplate(null), PageTemplateError);
    assert.throws(() => snapshotPageForTemplate({ ...sourcePage(), elements: Array.from({ length: 401 }, (_, i) => el(`x${i}`, "text", { text: "x" })) }), /up to 400/);
  });
  await check("expiring (signed) links are recognized; public copies and normal URLs are not", () => {
    assert.ok(isExpiringSignedUrl("https://storage.googleapis.com/b/k.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=1800&X-Goog-Signature=ab"));
    assert.ok(isExpiringSignedUrl("https://storage.googleapis.com/b/k.jpg?GoogleAccessId=x&Expires=1&Signature=y"));
    assert.ok(!isExpiringSignedUrl("https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=t"));
    assert.ok(!isExpiringSignedUrl("https://crm.magnetixstudios.com/magnetix-logo.png"));
    assert.ok(!isExpiringSignedUrl("") && !isExpiringSignedUrl("not a url"));
  });
  await check("page types: each system's categories plus Other (no user-made categories)", () => {
    assert.deepEqual(savedTemplatePageTypes("humanDesign"), ["Cover", "About Me", "Chart", "Summary", "Type", "Center", "Channel", "Gate", "Other"]);
    assert.deepEqual(savedTemplatePageTypes("astrology"), ["Cover", "About Me", "Table", "Other"]);
    assert.ok(isValidSavedPageType("humanDesign", "Other") && !isValidSavedPageType("humanDesign", "Table") && !isValidSavedPageType("astrology", "Gate") && !isValidSavedPageType("humanDesign", "Mine"));
  });

  console.log("\nBrowsing");
  seq = 0;
  const older = savedTemplateToLibrary(record({ name: "Bio Page", pageType: "About Me" }));
  const other = savedTemplateToLibrary(record({ name: "Closing Page", pageType: "Other" }));
  const cover = savedTemplateToLibrary(record({ name: "Studio Cover", pageType: "Cover" }));
  const newest = savedTemplateToLibrary(record({ name: "Client Welcome", pageType: "About Me" }));
  const astro = savedTemplateToLibrary(record({ name: "Astro Note", system: "astrology", pageType: "About Me" }));
  const lib: ReportTemplate[] = [...REPORT_TEMPLATES, older, other, cover, newest, astro];
  const f = (pageType: Parameters<typeof filterReportTemplates>[1]["pageType"], query?: string, system: "humanDesign" | "astrology" = "humanDesign") => ids(filterReportTemplates(lib, { system, pageType, query }));
  await check("Mine = every saved template of the system, any page type (Other included), newest first; no built-ins", () => {
    assert.deepEqual(f("Mine"), [newest.id, cover.id, other.id, older.id]);
    assert.deepEqual(f("Mine", undefined, "astrology"), [astro.id]);
  });
  await check("a saved template also appears in its own category, before the built-ins (newest first); Other only under Mine/All", () => {
    assert.deepEqual(f("About Me"), [newest.id, older.id, "about-note"]);
    assert.deepEqual(f("Cover"), [cover.id, "cover-luminous", "cover-midnight"]);
    for (const t of REPORT_TEMPLATE_PAGE_TYPES.humanDesign) assert.ok(!f(t).includes(other.id), t);
    const all = f("All");
    assert.equal(all.length, 12);
    assert.equal(all.at(-1), other.id, "Other sorts last in All");
  });
  await check("search covers saved templates by name, page type, system and the word “mine”", () => {
    assert.deepEqual(f("All", "closing"), [other.id]);
    assert.deepEqual(f("All", "other"), [other.id]);
    assert.deepEqual(f("All", "mine"), [cover.id, newest.id, older.id, other.id]);
    assert.deepEqual(f("All", "mine about"), [newest.id, older.id]);
    assert.deepEqual(f("All", "astrology mine", "astrology"), [astro.id]);
    assert.ok(!f("All", "mine").some((id) => REPORT_TEMPLATES.some((t) => t.id === id)), "built-ins never match “mine”");
  });
  await check("built-in library unchanged: the eight Human Design templates, filters and search as before", () => {
    assert.deepEqual(ids(REPORT_TEMPLATES), ["cover-luminous", "chart-spotlight", "chart-mandala", "summary-glance", "type-story", "cover-midnight", "about-note", "center-focus"]);
    assert.deepEqual(ids(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "Chart" })), ["chart-spotlight", "chart-mandala"]);
    assert.deepEqual(ids(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "Mine" })), []);
    assert.ok(REPORT_TEMPLATES.every((t) => !t.saved));
  });

  console.log("\nInsertion");
  await check("inserting a saved template = a fresh, independent page (new page + element ids) with Page Center, visibility, tokens and chart reference restored", () => {
    const before = JSON.stringify(newest);
    let n = 0;
    const a = instantiateReportTemplate(newest, () => `a${++n}`);
    const b = instantiateReportTemplate(newest);
    assert.equal(a.id, "a1");
    assert.equal(a.title, "Client Welcome");
    assert.equal(a.centerKey, "heart");
    assert.deepEqual(a.visibleIf, sourcePage().visibleIf);
    assert.ok(a.elements!.every((e) => e.id.startsWith("a")));
    const all = [a.id, b.id, ...a.elements!.map((e) => e.id), ...b.elements!.map((e) => e.id)];
    assert.equal(new Set(all).size, all.length, "two inserts share no ids");
    assert.equal(a.elements!.find((e) => e.type === "chart")!.payload.chartDesignSetId, "set-violet");
    a.elements![0].payload.text = "edited";
    a.elements![0].geometry.x = 999;
    assert.equal(JSON.stringify(newest), before, "editing an inserted page never touches the template");
    assert.notEqual(b.elements![0].geometry.x, 999);
  });
  await check("after insertion the bindings still resolve in the report: inline tokens, Page Center shortcodes, chart design", () => {
    const page = instantiateReportTemplate(newest);
    const values = { "hd:center:heart": { fields: { definedText: "DEF-heart", undefinedText: "UND-heart" } } };
    const out = resolvePagesForRender([page], { ...REPORT_BUILDER_FIXTURE_READING, reportContent: { strict: true, values } })[0];
    const texts = out.elements!.map((e) => String(e.payload.text ?? ""));
    assert.ok(texts.includes("Welcome, Preview — your Heart Center"), texts.join(" | "));
    assert.ok(texts.includes("UND-heart"), "center_text with the page's Center (fixture Heart is open)");
    const set = { id: "set-violet", name: "Violet", designs: { humanDesign: { chartDefinedColor: "#7c3aed" }, mandala: null, astrology: null } } as unknown as ChartDesignSetWithMembers;
    const attached = attachChartDesignsFromSets([page], new Map([[set.id, set]]))[0];
    assert.equal(elementChartDesigns(attached.elements!.find((e) => e.type === "chart")!)?.humanDesign?.chartDefinedColor, "#7c3aed");
  });

  console.log("\nThumbnails");
  await check("a saved template's thumbnail is its own page, drawn with its saved Chart Design", () => {
    const set = { id: "set-violet", name: "Violet", designs: { humanDesign: { chartDefinedColor: "#a1b2c3" }, mandala: null, astrology: null } } as unknown as ChartDesignSetWithMembers;
    const html = renderToStaticMarkup(createElement(ReportChartDesignSetsContext.Provider, { value: new Map([[set.id, set]]) }, createElement(ReportTemplateThumbnail, { template: newest })));
    assert.match(html, new RegExp(`data-template-thumbnail="${newest.id}"`));
    assert.match(html, /#a1b2c3/i, "chart in the saved design's colors");
    assert.match(html, /Welcome, Preview/);
    assert.doesNotMatch(html, /\{\{/);
  });

  console.log("\nUI wiring (source guards)");
  const library = fs.readFileSync("src/components/energetic-decoder/report-template-library.tsx", "utf8");
  const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
  const dialogs = fs.readFileSync("src/components/energetic-decoder/report-page-template-dialogs.tsx", "utf8");
  await check("Mine is pinned at the end of the chip row, outside the scrolling page-type chips; no source filter", () => {
    const scroller = library.indexOf("data-template-chips");
    const mine = library.indexOf("data-template-mine-chip");
    assert.ok(scroller > 0 && mine > scroller);
    const between = library.slice(library.indexOf("{chips.map", scroller), mine);
    assert.ok(between.includes("</div>"), "Mine sits after the scroller closes");
    assert.doesNotMatch(library, /Magnetix<\/|All templates|data-source-filter/);
  });
  await check("saved cards: Mine badge; ⋯ menu = Rename… / Delete… only (Insert stays on the card); never on built-in templates", () => {
    assert.match(library, /\{template\.saved && \(\s*<span[^>]*data-template-mine-badge>\s*Mine/);
    assert.match(library, /\{template\.saved && \(onRename \|\| onDelete\) && \(\s*<DropdownMenu>/);
    const menu = library.slice(library.indexOf("<DropdownMenuContent"), library.indexOf("</DropdownMenuContent>"));
    assert.match(menu, /Rename…/);
    assert.match(menu, /Delete…/);
    assert.doesNotMatch(menu, /Insert/);
    assert.match(library, /aria-label=\{`Insert \$\{template\.name\}`\}/);
  });
  await check("page actions on the selected page in the strip: Duplicate page · Save as template… · Delete page; Pages sheet has Save as template too", () => {
    const menu = editor.slice(editor.indexOf("data-page-actions"), editor.indexOf("</DropdownMenuContent>", editor.indexOf("data-page-actions")));
    const order = ["Duplicate page", "Save as template…", "Delete page"].map((x) => menu.indexOf(x));
    assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
    assert.match(editor, /\{p\.id === activePageId && \(/);
    assert.match(editor, /onClick=\{\(\) => saveAsTemplate\(p\.id\)\}/);
    assert.match(editor, /onClick=\{\(\) => duplicatePage\(p\.id\)\}/, "the Pages sheet duplicates its own row's page");
  });
  await check("after save: Templates panel opens on the template's system → Mine, newest first, marked New; toast names the place", () => {
    const fn = editor.slice(editor.indexOf("async function savePageAsTemplate"), editor.indexOf("async function renameSavedTemplate"));
    for (const s of ["setSavedRecords((prev) => [t, ...prev", 'setTemplateCategory("Templates")', 'setMobileDrawer("elements")', "setLibraryFocus({ system: t.system, highlightId: t.id", "to your templates · ${systemLabel} › Mine"]) assert.ok(fn.includes(s), s);
    assert.match(library, /setPageType\("Mine"\);/);
    assert.match(library, /data-template-new/);
  });
  await check("save dialog: name (prefilled from the page title) · system · page-type chips incl. Other · hint; no style tag", () => {
    assert.match(editor, /pageTitle=\{saveTemplatePage\?\.title \?\? ""\}/);
    assert.match(dialogs, /savedTemplatePageTypes\(system\)/);
    assert.match(dialogs, /`Saved to \$\{systemLabel\} › Mine\.`/);
    assert.match(dialogs, /`Saved to \$\{systemLabel\} › Mine, and also listed under \$\{pageType\}\.`/);
    assert.doesNotMatch(dialogs, /styleTag|Style tag</, "no style-tag field");
    assert.match(dialogs, /Pages you already added to reports from this template stay exactly as they are — they&apos;re independent copies\./);
  });

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
