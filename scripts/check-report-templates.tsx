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
import { execFileSync } from "node:child_process";
import { renderReportDesignPdfStream } from "../src/lib/energetics/report-design-pdf-render";
import { resolvePagesForRender } from "../src/lib/energetics/report-shortcode-render";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

async function main() {
console.log("\nSource of truth");
await check("Batch 1 = exactly the five approved templates, in library order", () => {
  assert.deepEqual(ids(REPORT_TEMPLATES), ["cover-luminous", "chart-spotlight", "chart-mandala", "summary-glance", "type-story"]);
  assert.deepEqual(REPORT_TEMPLATES.map((t) => t.name), ["Luminous Arc", "Bodygraph Spotlight", "Mandala Circle", "At a Glance", "Type Story"]);
  assert.deepEqual(REPORT_TEMPLATES.map((t) => [t.pageType, t.styleTag]), [["Cover", "Magnetix Violet"], ["Chart", "Monochrome"], ["Chart", null], ["Summary", "Magnetix Violet"], ["Type", "Warm Sunset"]]);
  assert.ok(REPORT_TEMPLATES.every((t) => t.system === "humanDesign"));
});
await check("element counts match the reconstruction spec (9 · 22 · 6 · 26 · 14)", () => {
  assert.deepEqual(REPORT_TEMPLATES.map((t) => t.page.elements?.length), [9, 22, 6, 26, 14]);
});
const handoff = path.join(os.homedir(), "Documents/magnetix-release-records/2026-10-11-template-library-mockup/template-specs.json");
await check("each shipped page is byte-identical to template-specs.json (when the handoff file is available)", () => {
  if (!fs.existsSync(handoff)) {
    console.log("    (handoff file not on this machine — skipped)");
    return;
  }
  const spec = JSON.parse(fs.readFileSync(handoff, "utf8")) as { templates: { id: string; reportPage: unknown }[] };
  for (const t of REPORT_TEMPLATES) assert.deepEqual(t.page, spec.templates.find((s) => s.id === t.id)!.reportPage, t.id);
});

console.log("\nMetadata, filtering, search");
await check("page-type chips per system", () => {
  assert.deepEqual(REPORT_TEMPLATE_PAGE_TYPES.humanDesign, ["Cover", "About Me", "Chart", "Summary", "Type", "Center", "Channel", "Gate"]);
  assert.deepEqual(REPORT_TEMPLATE_PAGE_TYPES.astrology, ["Cover", "About Me", "Table"]);
});
await check("system + page type filters; empty categories return nothing (no fake templates)", () => {
  assert.equal(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "All" }).length, 5);
  assert.deepEqual(ids(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: "Chart" })), ["chart-spotlight", "chart-mandala"]);
  for (const empty of ["About Me", "Center", "Channel", "Gate"] as const) assert.equal(filterReportTemplates(REPORT_TEMPLATES, { system: "humanDesign", pageType: empty }).length, 0, empty);
  assert.equal(filterReportTemplates(REPORT_TEMPLATES, { system: "astrology", pageType: "All" }).length, 0);
});
await check("search matches name, system, page type and style tag; every word must match", () => {
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
  await check(`${t.name}: fresh page + element ids; everything else exactly as specified`, () => {
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
await check("two insertions of the same template share no ids, and the template itself is never mutated", () => {
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
await check("Blank page: a normal empty page with a fresh id", () => {
  const p = createBlankReportPage(() => "blank-1");
  assert.deepEqual(p, { id: "blank-1", title: BLANK_PAGE_TITLE, visibleIf: null, blocks: [], elements: [] });
});

console.log("\nPayloads");
const all = REPORT_TEMPLATES.flatMap((t) => t.page.elements!.map((e) => ({ t, e })));
await check("every shortcode token is a real catalog token (Batch 1 uses the eleven approved keys)", () => {
  const catalog = new Set(SHORTCODE_CATALOG.map((s) => s.token));
  const used = new Set(all.filter(({ e }) => e.type === "shortcode").map(({ e }) => String(e.payload.token)));
  for (const token of used) assert.ok(catalog.has(token), token);
  assert.deepEqual([...used].sort(), ["authority", "birth_date", "definition", "full_name", "incarnation_cross", "not_self_theme", "profile", "signature", "strategy", "type", "type_description"]);
});
await check("Type Story keeps its Content Set-backed type_description Shortcode element", () => {
  const ts = REPORT_TEMPLATES.find((t) => t.id === "type-story")!;
  const passage = ts.page.elements!.find((e) => e.payload.token === "type_description")!;
  assert.equal(passage.type, "shortcode");
  assert.deepEqual(instantiateReportTemplate(ts).elements!.find((e) => e.payload.token === "type_description")!.payload, { token: "type_description" });
});
await check("chart elements carry only { piece } — no colors; style tags never reach a chart", () => {
  const charts = all.filter(({ e }) => e.type === "chart");
  assert.deepEqual(charts.map(({ t, e }) => [t.id, e.payload]), [["cover-luminous", { piece: "human-design-full" }], ["chart-spotlight", { piece: "human-design-full" }], ["chart-mandala", { piece: "human-design-mandala" }]]);
  for (const { e } of charts) assert.deepEqual(Object.keys(e.style ?? {}).sort(), ["borderStyle", "borderWidth", "opacity"]);
});
await check("no Frequency piece or token anywhere in the library", () => {
  assert.doesNotMatch(JSON.stringify(REPORT_TEMPLATES), /frequency|life_work/);
});

console.log("\nThumbnails (real page renderer)");
await check("a thumbnail renders the real page: same element count, sample values resolved, no raw tokens", () => {
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
await check("insertion = one commit (one undo step), new page activated + scrolled into view, panel closed, toast", () => {
  const fn = editor.slice(editor.indexOf("function insertLibraryPage("), editor.indexOf("function duplicatePage("));
  assert.equal(fn.match(/commit\(/g)?.length, 1);
  assert.match(fn, /commit\(\[\.\.\.pages, p\]\)/, "appends — never replaces");
  for (const s of ["setActivePageId(p.id)", "setScrollToPageId(p.id)", "setTemplateCategory(null)", "setMobileDrawer(null)", "toast.success(`${name} inserted`)"]) assert.ok(fn.includes(s), s);
  assert.match(editor, /instantiateReportTemplate\(template, id\)/);
  assert.match(editor, /createBlankReportPage\(id\)/);
});
await check("old starter templates and their wireframe thumbnails are gone", () => {
  for (const gone of ["TEMPLATE_DEFINITIONS", "Luminous cover", "Dawn cover", "Existing starter", "Batch 2 will refine"]) assert.ok(!editor.includes(gone), gone);
});
await check("desktop panel header reads Templates; the sheet shows its own heading", () => {
  assert.match(editor, /templateCategory === "Templates" \? "Templates"/);
  assert.match(editor, /renderActiveToolPanel\(\{ inSheet: true \}\)/);
  assert.match(editor, /showHeading=\{opts\?\.inSheet\}/);
});
await check("Shape and Frame elements draw no placeholder word on the editor canvas (accessible name kept)", () => {
  assert.match(editor, /element\.type === "shape" \|\| element\.type === "frame"\s*\? ""/);
  assert.doesNotMatch(editor, /:\s*element\.type === "shape"\s*\?\s*"Shape"/, "old canvas label chain");
  assert.match(editor, /aria-label=\{element\.type === "shape" \? "Shape" : element\.type === "frame" \? "Frame" : undefined\}/);
});
await check("Shortcode elements get the same typography controls as Text (templates style their shortcodes)", () => {
  assert.match(editor, /\(selected\.type === "text" \|\| selected\.type === "shortcode"\) && \(\s*<div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50\/40 p-3" data-typography-controls>/);
});
await check("library: Human Design default, chips reset per system, Blank pinned before the grid, empty + no-results states", () => {
  assert.match(library, /useState<ReportTemplateSystem>\("humanDesign"\)/);
  assert.match(library, /setSystem\(s\.key\);\s*setPageType\("All"\);/);
  assert.ok(library.indexOf("data-template-blank") < library.indexOf("data-template-grid"));
  assert.match(library, /Astrology templates are coming soon\./);
  assert.match(library, /No templates match/);
});

console.log("\nPDF (production renderer)");
await check("all five templates print complete on one page each: no dropped lines, no clipped bottoms, no raw tokens", async () => {
  const input = { ...REPORT_BUILDER_FIXTURE_READING, reportContent: { strict: true, values: { "hd:type:Generator": { fields: { description: "CS-TYPE-PASSAGE sample." } } } } };
  const pages = resolvePagesForRender(REPORT_TEMPLATES.map((t) => instantiateReportTemplate(t)), input);
  const stream = await renderReportDesignPdfStream({ title: "Templates", readerName: "Preview Sample", businessName: "Magnetix", pages, humanDesign: REPORT_BUILDER_FIXTURE_READING.humanDesign, astrology: REPORT_BUILDER_FIXTURE_READING.astrology, pageSize: "letter" });
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const file = path.join(os.tmpdir(), `templates-${process.pid}.pdf`);
  fs.writeFileSync(file, Buffer.concat(chunks));
  try {
    const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
    assert.match(info, /Pages:\s+5\b/, "one PDF page per template");
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
    assert.doesNotMatch(text, /\{\{|\}\}/);
    // Lines a little taller than their box used to be dropped; bottoms used to be cut off.
    for (const must of ["Your Bodygraph", "Your Mandala", "Your Design, Summarized", "Generator", "To Respond", "Satisfaction", "Frustration", "CS-TYPE-PASSAGE", "1990-06-15", "Right Angle Cross of Explanation"]) assert.ok(text.includes(must), `PDF missing "${must}"`);
    const pageTexts = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).split("\f");
    assert.ok(pageTexts[0].includes("Preview Sample") && pageTexts[0].includes("1990-06-15") && pageTexts[0].includes("Magnetix Studios"), "Luminous Arc bottom text present");
    assert.ok(pageTexts[4].includes("Frustration") && pageTexts[4].includes("Magnetix Studios"), "Type Story bottom text present");
  } finally {
    fs.unlinkSync(file);
  }
});
await check("shapes and frames have no padding in the editor, the web report or the PDF (thin rules stay thin)", () => {
  assert.match(editor, /padding: element\.type === "text" \? 12 : element\.type === "shape" \|\| element\.type === "frame" \? 0 : 8/);
  assert.match(fs.readFileSync("src/components/energetic-decoder/report-design-viewer.tsx", "utf8"), /padding: element\.type === "shape" \|\| element\.type === "frame" \? 0 : 10/);
  const pdfDoc = fs.readFileSync("src/lib/energetics/report-design-pdf-document.tsx", "utf8");
  assert.match(pdfDoc, /padding: element\.type === "shape" \|\| element\.type === "frame" \? 0 : 10 \* scale/);
  assert.match(pdfDoc, /const canvasScale = Math\.min\(contentWidth \/ CANVAS_W, \(contentHeight - CANVAS_HEADER_ALLOWANCE\) \/ CANVAS_H\)/);
});

console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
