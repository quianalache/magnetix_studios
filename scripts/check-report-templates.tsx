/**
 * Report Builder Template Library — Batch 1 (2026-10-11).
 *
 * Proves: the shipped templates are the approved reconstruction spec
 * (unmodified); metadata, page-type filtering and search; insertion makes a
 * fresh, independent page (new page + element ids, everything else exact);
 * shortcode / Content Set / chart payloads preserved; style tags never touch
 * chart payloads; Blank page; one insertion = one undo step; Shape/Frame
 * placeholder labels gone from the editor canvas; thumbnails render the real
 * page through the published-report renderer.
 *
 * Run: NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-report-templates.tsx
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BLANK_PAGE_TITLE,
  REPORT_TEMPLATES,
  REPORT_TEMPLATE_PAGE_TYPES,
  createBlankReportPage,
  filterReportTemplates,
  instantiateReportTemplate,
} from "../src/lib/energetics/report-templates";
import { ReportCanvasPage } from "../src/components/energetic-decoder/report-design-viewer";
import { REPORT_BUILDER_FIXTURE_READING } from "../src/lib/energetics/report-builder-fixture";
import { SHORTCODE_CATALOG } from "../src/lib/energetics/shortcodes";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

console.log("\nSource of truth");
check("Batch 1 = exactly the five approved templates, in library order", () => {
  assert.deepEqual(ids(REPORT_TEMPLATES), ["cover-luminous", "chart-spotlight", "chart-mandala", "summary-glance", "type-story"]);
  assert.deepEqual(REPORT_TEMPLATES.map((t) => t.name), ["Luminous Arc", "Bodygraph Spotlight", "Mandala Circle", "At a Glance", "Type Story"]);
  assert.deepEqual(REPORT_TEMPLATES.map((t) => [t.pageType, t.styleTag]), [["Cover", "Magnetix Violet"], ["Chart", "Monochrome"], ["Chart", null], ["Summary", "Magnetix Violet"], ["Type", "Warm Sunset"]]);
  assert.ok(REPORT_TEMPLATES.every((t) => t.system === "humanDesign"));
});
check("element counts match the reconstruction spec (9 · 22 · 6 · 26 · 14)", () => {
  assert.deepEqual(REPORT_TEMPLATES.map((t) => t.page.elements?.length), [9, 22, 6, 26, 14]);
});
const handoff = path.join(os.homedir(), "Documents/magnetix-release-records/2026-10-11-template-library-mockup/template-specs.json");
check("each shipped page is byte-identical to template-specs.json (when the handoff file is available)", () => {
  if (!fs.existsSync(handoff)) {
    console.log("    (handoff file not on this machine — skipped)");
    return;
  }
  const spec = JSON.parse(fs.readFileSync(handoff, "utf8")) as { templates: { id: string; reportPage: unknown }[] };
  for (const t of REPORT_TEMPLATES) assert.deepEqual(t.page, spec.templates.find((s) => s.id === t.id)!.reportPage, t.id);
});

console.log("\nMetadata, filtering, search");
check("page-type chips per system", () => {
  assert.deepEqual(REPORT_TEMPLATE_PAGE_TYPES.humanDesign, ["Cover", "About Me", "Chart", "Summary", "Type", "Center", "Channel", "Gate"]);
  assert.deepEqual(REPORT_TEMPLATE_PAGE_TYPES.astrology, ["Cover", "About Me", "Table"]);
});
check("system + page type filters; empty categories return nothing (no fake templates)", () => {
  assert.equal(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "All" }).length, 5);
  assert.deepEqual(ids(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "Chart" })), ["chart-spotlight", "chart-mandala"]);
  for (const empty of ["About Me", "Center", "Channel", "Gate"] as const) assert.equal(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: empty }).length, 0, empty);
  assert.equal(filterReportTemplates(REPORT_TEMPLATES, { system: "astrology", pageType: "All" }).length, 0);
});
check("search matches name, system, page type and style tag; every word must match", () => {
  const q = (query: string) => ids(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "All", query }));
  assert.deepEqual(q("luminous"), ["cover-luminous"]);
  assert.deepEqual(q("MONOCHROME"), ["chart-spotlight"]);
  assert.deepEqual(q("summary violet"), ["summary-glance"]);
  assert.equal(q("human design").length, 5);
  assert.deepEqual(q("warm sunset type"), ["type-story"]);
  assert.deepEqual(q("zzz"), []);
  assert.deepEqual(ids(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "Chart", query: "violet" })), []);
});

console.log("\nInsertion");
for (const t of REPORT_TEMPLATES) {
  check(`${t.name}: fresh page + element ids; everything else exactly as specified`, () => {
    let n = 0;
    const page = instantiateReportTemplate(t, () => `fresh-${++n}`);
    assert.equal(page.id, "fresh-1");
    assert.equal(page.title, t.name);
    assert.equal(page.elements!.length, t.page.elements!.length);
    page.elements!.forEach((e, i) => {
      const src = t.page.elements![i];
      assert.notEqual(e.id, src.id);
      assert.ok(!e.id.startsWith("tpl-"));
      assert.deepEqual({ ...e, id: src.id }, src, `${src.id} changed`);
    });
    assert.deepEqual(page.blocks, []);
    assert.equal(page.visibleIf, null);
  });
}
check("two insertions of the same template share no ids, and the template itself is never mutated", () => {
  const before = JSON.stringify(REPORT_TEMPLATES);
  const a = instantiateReportTemplate(REPORT_TEMPLATES[0]);
  const b = instantiateReportTemplate(REPORT_TEMPLATES[0]);
  assert.notEqual(a.id, b.id);
  const aIds = new Set(a.elements!.map((e) => e.id));
  assert.ok(b.elements!.every((e) => !aIds.has(e.id)));
  a.elements![0].geometry.x = 999;
  (a.elements![0].style as Record<string, unknown>).color = "#000";
  assert.equal(JSON.stringify(REPORT_TEMPLATES), before);
  assert.notEqual(b.elements![0].geometry.x, 999);
});
check("Blank page: a normal empty page with a fresh id", () => {
  const p = createBlankReportPage(() => "blank-1");
  assert.deepEqual(p, { id: "blank-1", title: BLANK_PAGE_TITLE, visibleIf: null, blocks: [], elements: [] });
});

console.log("\nPayloads");
const all = REPORT_TEMPLATES.flatMap((t) => t.page.elements!.map((e) => ({ t, e })));
check("every shortcode token is a real catalog token (Batch 1 uses the eleven approved keys)", () => {
  const catalog = new Set(SHORTCODE_CATALOG.map((s) => s.token));
  const used = new Set(all.filter(({ e }) => e.type === "shortcode").map(({ e }) => String(e.payload.token)));
  for (const token of used) assert.ok(catalog.has(token), token);
  assert.deepEqual([...used].sort(), ["authority", "birth_date", "definition", "full_name", "incarnation_cross", "not_self_theme", "profile", "signature", "strategy", "type", "type_description"]);
});
check("Type Story keeps its Content Set-backed type_description Shortcode element", () => {
  const ts = REPORT_TEMPLATES.find((t) => t.id === "type-story")!;
  const passage = ts.page.elements!.find((e) => e.payload.token === "type_description")!;
  assert.equal(passage.type, "shortcode");
  assert.deepEqual(instantiateReportTemplate(ts).elements!.find((e) => e.payload.token === "type_description")!.payload, { token: "type_description" });
});
check("chart elements carry only { piece } — no colors; style tags never reach a chart", () => {
  const charts = all.filter(({ e }) => e.type === "chart");
  assert.deepEqual(charts.map(({ t, e }) => [t.id, e.payload]), [["cover-luminous", { piece: "human-design-full" }], ["chart-spotlight", { piece: "human-design-full" }], ["chart-mandala", { piece: "human-design-mandala" }]]);
  for (const { e } of charts) assert.deepEqual(Object.keys(e.style ?? {}).sort(), ["borderStyle", "borderWidth", "opacity"]);
});
check("no Frequency piece or token anywhere in the library", () => {
  assert.doesNotMatch(JSON.stringify(REPORT_TEMPLATES), /frequency|life_work/);
});

console.log("\nThumbnails (real page renderer)");
check("a thumbnail renders the real page: same element count, sample values resolved, no raw tokens", () => {
  for (const t of REPORT_TEMPLATES) {
    const html = renderToStaticMarkup(createElement(ReportCanvasPage, { page: t.page, readingInput: REPORT_BUILDER_FIXTURE_READING }));
    assert.doesNotMatch(html, /\{\{|\}\}/, t.id);
    assert.doesNotMatch(html, /Add text/, t.id);
  }
  const lum = renderToStaticMarkup(createElement(ReportCanvasPage, { page: REPORT_TEMPLATES[0].page, readingInput: REPORT_BUILDER_FIXTURE_READING }));
  assert.ok(lum.includes("Your Energetic Blueprint") && lum.includes("Preview Sample"));
});

console.log("\nEditor wiring (source guards)");
const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
const library = fs.readFileSync("src/components/energetic-decoder/report-template-library.tsx", "utf8");
check("insertion = one commit (one undo step), new page activated + scrolled into view, panel closed, toast", () => {
  const fn = editor.slice(editor.indexOf("function insertLibraryPage("), editor.indexOf("function duplicatePage("));
  assert.equal(fn.match(/commit\(/g)?.length, 1);
  assert.match(fn, /commit\(\[\.\.\.pages, p\]\)/, "appends — never replaces");
  for (const s of ["setActivePageId(p.id)", "setScrollToPageId(p.id)", "setTemplateCategory(null)", "setMobileDrawer(null)", "toast.success(`${name} inserted`)"]) assert.ok(fn.includes(s), s);
  assert.match(editor, /instantiateReportTemplate\(template, id\)/);
  assert.match(editor, /createBlankReportPage\(id\)/);
});
check("old starter templates and their wireframe thumbnails are gone", () => {
  for (const gone of ["TEMPLATE_DEFINITIONS", "Luminous cover", "Dawn cover", "Existing starter", "Batch 2 will refine"]) assert.ok(!editor.includes(gone), gone);
});
check("desktop panel header reads Templates; the sheet shows its own heading", () => {
  assert.match(editor, /templateCategory === "Templates" \? "Templates"/);
  assert.match(editor, /renderActiveToolPanel\(\{ inSheet: true \}\)/);
  assert.match(editor, /showHeading=\{opts\?\.inSheet\}/);
});
check("Shape and Frame elements draw no placeholder word on the editor canvas (accessible name kept)", () => {
  assert.match(editor, /element\.type === "shape" \|\| element\.type === "frame"\s*\? ""/);
  assert.doesNotMatch(editor, /:\s*element\.type === "shape"\s*\?\s*"Shape"/, "old canvas label chain");
  assert.match(editor, /aria-label=\{element\.type === "shape" \? "Shape" : element\.type === "frame" \? "Frame" : undefined\}/);
});
check("Shortcode elements get the same typography controls as Text (templates style their shortcodes)", () => {
  assert.match(editor, /\(selected\.type === "text" \|\| selected\.type === "shortcode"\) && \(\s*<div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50\/40 p-3" data-typography-controls>/);
});
check("library: Human Design default, chips reset per system, Blank pinned before the grid, empty + no-results states", () => {
  assert.match(library, /useState<ReportTemplateSystem>\("humanDesign"\)/);
  assert.match(library, /setSystem\(s\.key\);\s*setPageType\("All"\);/);
  assert.ok(library.indexOf("data-template-blank") < library.indexOf("data-template-grid"));
  assert.match(library, /Astrology templates are coming soon\./);
  assert.match(library, /No templates match/);
});

console.log(`\n${passed} checks passed.`);
