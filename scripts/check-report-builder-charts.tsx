/**
 * Report Builder — Charts tool + PDF word wrapping (2026-10-12).
 *
 * Proves: the Charts tool's sections map to the right chart parts (and the
 * unavailable ones insert nothing); inserting makes a normal chart element
 * with a fresh id that stores the part + the saved design reference only;
 * rendering surfaces attach the saved set's records and draw the part with
 * them (Full Chart vs bodygraph-only vs Mandala); Human Design parts have
 * no outer background panel while Mandala keeps its own; legacy pieces keep
 * working; the Report Builder PDF never auto-hyphenates (whole words wrap,
 * manual hyphens stay); chart elements print fitted to their box.
 * Saved-design lookup against Firestore (tenant isolation) is covered by
 * check-chart-design-sets.ts (emulators).
 *
 * Run: NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-report-builder-charts.tsx
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CHART_PIECE_DEFAULT_SIZE,
  REPORT_CHART_SECTIONS,
  attachChartDesignsFromSets,
  chartDesignSetIdsOf,
  chartPieceDesignSystem,
  elementChartDesigns,
  newChartElement,
  normalizeCanvasChartPiece,
} from "../src/lib/energetics/report-charts";
import { REPORT_TEMPLATES } from "../src/lib/energetics/report-templates";
import { ReportCanvasPage } from "../src/components/energetic-decoder/report-design-viewer";
import { ReportChartPreview, designsOfSet } from "../src/components/energetic-decoder/report-chart-preview";
import { REPORT_BUILDER_FIXTURE_READING } from "../src/lib/energetics/report-builder-fixture";
import { renderReportDesignPdfStream } from "../src/lib/energetics/report-design-pdf-render";
import { noAutoHyphenation } from "../src/lib/energetics/report-design-pdf-document";
import type { ChartDesign } from "../src/types/chart-design";
import type { ChartDesignSetWithMembers } from "../src/types/chart-design-set";
import type { ReportCanvasElement, ReportPage } from "../src/types/report-blocks";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// A saved Chart Design with colors no default uses, so their presence proves the design was applied.
const design = (system: string, extra: Partial<ChartDesign>) => ({ id: `d-${system}`, subAccountId: "sa", name: "QA", system, ...extra }) as unknown as ChartDesign;
const SET: ChartDesignSetWithMembers = {
  id: "set-qa",
  subAccountId: "sa",
  name: "QA Violet",
  designs: {
    humanDesign: design("humanDesign", { chartDefinedColor: "#a1b2c3", backgroundColor: "#0f0e0d", personalityActivationColor: "#123abc", designActivationColor: "#bc3a12" }),
    mandala: design("mandala", { chartDefinedColor: "#c3b2a1", backgroundColor: "#0e0d0c" }),
    astrology: design("astrology", {}),
  },
} as unknown as ChartDesignSetWithMembers;
const SETS = new Map([[SET.id, SET]]);

const pageWith = (elements: ReportCanvasElement[]): ReportPage => ({ id: "p", title: "P", visibleIf: null, blocks: [], elements });
const render = (page: ReportPage) => renderToStaticMarkup(createElement(ReportCanvasPage, { page, readingInput: REPORT_BUILDER_FIXTURE_READING }));
const chart = (piece: string, setId: string | null = SET.id, id = "c1") => newChartElement({ id, piece: piece as never, chartDesignSetId: setId, zIndex: 1 });
const attached = (piece: string, setId: string | null = SET.id) => attachChartDesignsFromSets([pageWith([chart(piece, setId)])], SETS)[0];

async function pdfText(pages: ReportPage[]): Promise<{ text: string; pages: number }> {
  const stream = await renderReportDesignPdfStream({ title: "QA", readerName: "Preview Sample", businessName: "Magnetix", pages, humanDesign: REPORT_BUILDER_FIXTURE_READING.humanDesign, astrology: REPORT_BUILDER_FIXTURE_READING.astrology, pageSize: "letter" });
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const file = path.join(os.tmpdir(), `rb-charts-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, Buffer.concat(chunks));
  try {
    const text = execFileSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" });
    const n = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [file], { encoding: "utf8" }))![1]);
    return { text, pages: n };
  } finally {
    fs.unlinkSync(file);
  }
}

async function main() {
  console.log("\nChart sections (BodyGraph Chart Parts structure)");
  await check("Human Design: My Full Charts · Charts · Mandala Charts · Gates · Arrows · Backgrounds; Astrology: Charts", () => {
    assert.deepEqual(REPORT_CHART_SECTIONS.map((s) => [s.system, s.label, s.piece]), [
      ["humanDesign", "My Full Charts", "human-design-full-chart"],
      ["humanDesign", "Charts", "human-design-bodygraph"],
      ["humanDesign", "Mandala Charts", "human-design-mandala"],
      ["humanDesign", "Gates", null],
      ["humanDesign", "Arrows", null],
      ["humanDesign", "Backgrounds", null],
      ["astrology", "Charts", "astrology-wheel"],
    ]);
  });
  await check("unavailable parts (Gates, Arrows, Backgrounds) say so instead of inserting a stand-in", () => {
    for (const s of REPORT_CHART_SECTIONS.filter((x) => !x.piece)) assert.match(s.unavailableNote ?? "", /^Not available yet/, s.key);
    const lib = fs.readFileSync("src/components/energetic-decoder/report-chart-library.tsx", "utf8");
    assert.match(lib, /!section\.piece \? \(\s*<p[^>]*data-chart-unavailable/);
  });
  await check("each part draws with the matching record of the saved design", () => {
    assert.equal(chartPieceDesignSystem("human-design-full-chart"), "humanDesign");
    assert.equal(chartPieceDesignSystem("human-design-bodygraph"), "humanDesign");
    assert.equal(chartPieceDesignSystem("human-design-mandala"), "mandala");
    assert.equal(chartPieceDesignSystem("astrology-wheel"), "astrology");
  });
  await check("no design names are hard-coded — cards come from the workspace's saved sets", () => {
    const lib = fs.readFileSync("src/components/energetic-decoder/report-chart-library.tsx", "utf8");
    for (const name of ["Default", "Magnetix Violet", "Midnight", "Monochrome", "Warm Sunset"]) assert.ok(!lib.includes(`"${name}"`), name);
    const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
    assert.match(editor, /energetic-decoder\/chart-design-sets/, "loads the existing Chart Designs endpoint");
  });

  console.log("\nInsertion");
  await check("a normal chart element: fresh id, centered on the page, part + design reference only (no copied colors)", () => {
    for (const piece of ["human-design-full-chart", "human-design-bodygraph", "human-design-mandala", "astrology-wheel"] as const) {
      const e = newChartElement({ id: `fresh-${piece}`, piece, chartDesignSetId: "set-qa", zIndex: 4 });
      assert.equal(e.id, `fresh-${piece}`);
      assert.equal(e.type, "chart");
      assert.deepEqual(e.payload, { piece, chartDesignSetId: "set-qa" });
      const size = CHART_PIECE_DEFAULT_SIZE[piece]!;
      assert.deepEqual(e.geometry, { x: (816 - size.width) / 2, y: Math.round((1056 - size.height) / 2), width: size.width, height: size.height, rotation: 0 });
      assert.ok(e.geometry.x >= 0 && e.geometry.y >= 0 && e.geometry.x + e.geometry.width <= 816 && e.geometry.y + e.geometry.height <= 1056);
      assert.deepEqual(e.style, { borderWidth: 0, borderStyle: "none", opacity: 1 });
    }
  });
  await check("editor insertion: one commit (one undo step), new id each time, selected, on the active page", () => {
    const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
    const fn = editor.slice(editor.indexOf("function addChartElement("));
    const body = fn.slice(0, fn.indexOf("\n  }\n") + 4);
    assert.equal(body.match(/updatePage\(/g)?.length, 1);
    assert.match(body, /newChartElement\(\{ id: [^,]+,/);
    assert.match(body, /setSelectedId\(/);
    assert.doesNotMatch(body, /chartDesigns/, "never stores design records on the element");
  });

  console.log("\nRendering with the saved design");
  await check("attach: references resolve to that set's records; ids are collected once", () => {
    const pages = [pageWith([chart("human-design-bodygraph", SET.id, "a"), chart("human-design-mandala", SET.id, "b"), chart("astrology-wheel", null, "c")])];
    assert.deepEqual(chartDesignSetIdsOf(pages), [SET.id]);
    const [a, b, c] = attachChartDesignsFromSets(pages, SETS)[0].elements!;
    assert.equal(elementChartDesigns(a)?.humanDesign?.chartDefinedColor, "#a1b2c3");
    assert.equal(elementChartDesigns(b)?.mandala?.chartDefinedColor, "#c3b2a1");
    assert.equal(elementChartDesigns(c), null, "no reference = the reading's own design");
    assert.equal(elementChartDesigns(attached("human-design-bodygraph", "deleted-set").elements![0]), null, "deleted design falls back");
  });
  const full = render(attached("human-design-full-chart"));
  const body = render(attached("human-design-bodygraph"));
  await check("Full Chart draws the bodygraph WITH the planet columns + arrows; Bodygraph draws the bodygraph only", () => {
    assert.match(full, /data-hd-variables|data-hd-rail/);
    assert.doesNotMatch(body, /data-hd-variables|data-hd-rail/);
    assert.match(body, /<svg/);
  });
  await check("both Human Design parts use the saved design's colors", () => {
    for (const html of [full, body]) assert.match(html, /#a1b2c3/i);
  });
  await check("Human Design parts have no outer background panel (design background not painted around the chart)", () => {
    for (const html of [full, body]) {
      assert.doesNotMatch(html, /#0f0e0d/i, "outer design background");
      assert.doesNotMatch(html, /bg-white[^"]*"[^>]*data-chart/i);
    }
    assert.match(body, /background:transparent/);
  });
  await check("Mandala keeps its saved design + its background (the wheel's ink is designed against it), drawn as a disc — no outer rectangle", () => {
    const html = render(attached("human-design-mandala"));
    assert.match(html, /#c3b2a1/i);
    assert.match(html, /background:#0e0d0c;border-radius:50%/i);
    const thumb = renderToStaticMarkup(createElement(ReportChartPreview, { piece: "human-design-mandala", designs: designsOfSet(SET) }));
    assert.match(thumb, /border-radius:50%/);
    assert.match(fs.readFileSync("src/lib/energetics/report-design-pdf-document.tsx", "utf8"), /discPanel=\{!!box\}/, "PDF canvas element");
    assert.match(fs.readFileSync("src/lib/energetics/reading-pdf-document.tsx", "utf8"), /borderRadius: discPanel \? \(MANDALA_SIZE \* 1\.08\) \/ 2 : 12/);
  });
  await check("a saved design missing one system's record falls back to the reading's design for that system only", () => {
    const partial = { ...SET, id: "partial", designs: { ...SET.designs, mandala: null } } as unknown as ChartDesignSetWithMembers;
    const page = attachChartDesignsFromSets([pageWith([chart("human-design-mandala", "partial")])], new Map([["partial", partial]]))[0];
    const readingMandala = design("mandala", { chartDefinedColor: "#d4e5f6", backgroundColor: "#fefefe" });
    const html = renderToStaticMarkup(createElement(ReportCanvasPage, { page, readingInput: REPORT_BUILDER_FIXTURE_READING, mandalaDesign: readingMandala }));
    assert.match(html, /#d4e5f6/i, "reading's Mandala design used");
    for (const f of ["src/lib/energetics/report-design-pdf-document.tsx", "src/components/energetic-decoder/report-design-viewer.tsx"]) {
      const src = fs.readFileSync(f, "utf8");
      for (const sys of [["hdDesign", "humanDesign"], ["mandalaDesign", "mandala"], ["astroDesign", "astrology"]]) assert.ok(src.includes(`${sys[0]}={own?.${sys[1]} ?? ${sys[0]}}`), `${f} ${sys[0]}`);
    }
  });
  await check("legacy canvas id human-design-full still draws the bodygraph (what it always showed on canvas + web)", () => {
    assert.equal(normalizeCanvasChartPiece("human-design-full"), "human-design-bodygraph");
    const legacy = render(pageWith([{ ...chart("human-design-full", null), payload: { piece: "human-design-full" } }]));
    assert.doesNotMatch(legacy, /data-hd-variables|data-hd-rail/);
    assert.match(legacy, /<svg/);
  });
  await check("editor canvas + thumbnails draw the same part with the same design (sample data)", () => {
    const thumbBody = renderToStaticMarkup(createElement(ReportChartPreview, { piece: "human-design-bodygraph", designs: designsOfSet(SET) }));
    const thumbFull = renderToStaticMarkup(createElement(ReportChartPreview, { piece: "human-design-full-chart", designs: designsOfSet(SET) }));
    assert.match(thumbBody, /#a1b2c3/i);
    assert.doesNotMatch(thumbBody, /data-hd-variables|data-hd-rail|#0f0e0d/i);
    assert.match(thumbFull, /data-hd-variables|data-hd-rail/);
    assert.doesNotMatch(thumbFull, /#0f0e0d/i);
  });
  await check("templates: Luminous Arc + Bodygraph Spotlight render bodygraph-only; Mandala Circle renders Mandala", () => {
    const byId = (id: string) => REPORT_TEMPLATES.find((t) => t.id === id)!;
    for (const id of ["cover-luminous", "chart-spotlight"]) {
      assert.equal(byId(id).page.elements!.find((e) => e.type === "chart")!.payload.piece, "human-design-bodygraph", id);
      assert.doesNotMatch(render(byId(id).page), /data-hd-variables|data-hd-rail/, id);
    }
    assert.equal(byId("chart-mandala").page.elements!.find((e) => e.type === "chart")!.payload.piece, "human-design-mandala");
  });
  await check("every surface attaches designs: preview PDF, public web report, generated snapshot (frozen)", () => {
    assert.match(fs.readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/report-designs/[designId]/preview-pdf/route.ts", "utf8"), /attachReportChartDesigns\(subAccountId,/);
    assert.match(fs.readFileSync("src/app/decoder/[saId]/report/[readingId]/design/[reportId]/page.tsx", "utf8"), /attachReportChartDesigns\(saId, design\.pages\)/);
    assert.match(fs.readFileSync("src/lib/server/generated-report-service.ts", "utf8"), /resolveSnapshotPages\(await attachReportChartDesigns\(opts\.subAccountId, design\.pages\)/);
  });

  console.log("\nPDF");
  await check("Report Builder PDF text never auto-hyphenates: every <Text> in the document uses the whole-word callback", () => {
    assert.deepEqual(noAutoHyphenation("Blueprint"), ["Blueprint"]);
    assert.deepEqual(noAutoHyphenation("Supercalifragilistic"), ["Supercalifragilistic"]);
    const src = fs.readFileSync("src/lib/energetics/report-design-pdf-document.tsx", "utf8");
    const texts = src.match(/<Text(?![A-Za-z])[^>]*/g) ?? [];
    assert.ok(texts.length > 10);
    for (const t of texts) assert.match(t, /hyphenationCallback=\{noAutoHyphenation\}/, t);
    assert.doesNotMatch(src, /Font\.registerHyphenationCallback/, "scoped to this document, not global");
  });
  const text = (id: string, s: string, x: number, y: number, width: number, height: number, fontSize: number): ReportCanvasElement => ({
    id, type: "text", zIndex: 1, geometry: { x, y, width, height, rotation: 0 },
    style: { fontFamily: "Helvetica", fontSize, fontWeight: 700, color: "#222222", align: "left", lineHeight: 1.2, opacity: 1, borderWidth: 0 },
    payload: { text: s },
  } as unknown as ReportCanvasElement);
  await check("whole words move to the next line (narrow + wide boxes, headings, paragraphs); manual hyphens kept", async () => {
    const para = "Responding to life with steady energy makes everything flow; self-trust and well-being grow when Strategy and Authority lead the way.";
    const { text: out, pages } = await pdfText([pageWith([
      text("h1", "Your Energetic Blueprint", 60, 60, 300, 200, 40), // forces "Blueprint" onto its own line
      text("h2", "Your Energetic Blueprint", 60, 300, 700, 80, 40), // wide: one line
      text("narrow", "Extraordinarily Transformational Characteristics", 60, 400, 150, 300, 22),
      text("para", para, 400, 400, 300, 300, 14),
    ])]);
    assert.equal(pages, 1);
    const words = out.split(/\s+/).filter(Boolean);
    for (const w of ["Blueprint", "Extraordinarily", "Transformational", "Characteristics", "Responding", "everything", "Strategy", "Authority"]) assert.ok(words.includes(w) || words.includes(`${w},`) || words.includes(`${w}.`), `"${w}" split or missing`);
    assert.doesNotMatch(out, /Blue-|Ener-|Extra-|Trans-|Charac-|Respond-|every-|Strat-|Author-/, "no automatic hyphen");
    assert.match(out, /self-trust/);
    assert.match(out, /well-being/);
  });
  await check("chart elements print fitted inside their box with the saved design (one page, no errors)", async () => {
    const pages = attachChartDesignsFromSets([pageWith([
      { ...chart("human-design-full-chart", SET.id, "f"), geometry: { x: 40, y: 40, width: 360, height: 320, rotation: 0 } },
      { ...chart("human-design-bodygraph", SET.id, "b"), geometry: { x: 420, y: 40, width: 200, height: 320, rotation: 0 } },
      { ...chart("human-design-mandala", SET.id, "m"), geometry: { x: 40, y: 420, width: 300, height: 300, rotation: 0 } },
      { ...chart("astrology-wheel", SET.id, "a"), geometry: { x: 420, y: 420, width: 300, height: 300, rotation: 0 } },
    ])], SETS);
    const { pages: n } = await pdfText(pages);
    assert.equal(n, 1, "fitted parts never spill onto another page");
    const pdf = fs.readFileSync("src/lib/energetics/report-design-pdf-document.tsx", "utf8");
    assert.match(pdf, /elementChartDesigns\(element\)/);
    assert.match(pdf, /normalizeCanvasChartPiece\(/);
    assert.match(pdf, /backgroundColor: "transparent"/);
  });

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
