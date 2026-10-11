/**
 * Shortcode parity (2026-10-11) — one resolver for every report surface.
 * Renders REAL PDFs through the production PDF document (pdftotext reads
 * them back) and the web viewer to static markup, then compares.
 *
 * Proves: generated PDF has no raw {{token}} syntax; chart-value,
 * personalized and Content Set shortcodes resolve; web report and PDF
 * agree; missing Content Set text stays blank (no fallback to the
 * reading's own text); old saved Shortcode elements (no resolvedText) and
 * snapshots still render; inline Text tokens resolve everywhere.
 *
 * Needs poppler's pdftotext. Run:
 *   NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-shortcode-parity.tsx
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { REPORT_BUILDER_FIXTURE_READING } from "../src/lib/energetics/report-builder-fixture";
import { renderReportDesignPdfStream } from "../src/lib/energetics/report-design-pdf-render";
import { resolvePagesForRender, shortcodeElementValue } from "../src/lib/energetics/report-shortcode-render";
import { generatedReportShortcodeInput, resolveSnapshotPages } from "../src/lib/server/generated-report-service";
import { ReportDesignViewer } from "../src/components/energetic-decoder/report-design-viewer";
import type { ShortcodeReadingInput } from "../src/lib/energetics/shortcodes";
import type { ReportCanvasElement, ReportDesign, ReportPage } from "../src/types/report-blocks";
import type { GeneratedReport } from "../src/types/generated-report";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// ── Fixture: a reading that ALSO carries legacy interpretation text, so a
// fallback to it would be detectable.
const reading = {
  ...REPORT_BUILDER_FIXTURE_READING,
  name: "Jordan Rivera",
  birthDate: "1990-03-14",
  humanDesign: {
    ...REPORT_BUILDER_FIXTURE_READING.humanDesign,
    content: {
      typeDescription: "LEGACY-READING-TYPE-TEXT",
      authorityDescription: "LEGACY-READING-AUTHORITY-TEXT",
      centers: { sacral: { definedText: "LEGACY-SACRAL-DEFINED", undefinedText: "LEGACY-SACRAL-OPEN" } },
    },
  },
} as unknown as ShortcodeReadingInput & { name: string };

// The report's Content Set: Type + Sacral written, Authority deliberately missing.
const contentSet = {
  id: "cs1",
  name: "Business",
  values: {
    "hd:type:Generator": { fields: { description: "CS-GENERATOR-TEXT" } },
    "hd:center:sacral": { fields: { definedText: "CS-SACRAL-DEFINED", undefinedText: "CS-SACRAL-OPEN" } },
  },
} as GeneratedReport["snapshot"]["contentSet"];

const TOKENS: Record<string, string> = {
  full_name: "Jordan Rivera",
  birth_date: "1990-03-14",
  type: "Generator",
  strategy: "To Respond",
  authority: "Sacral",
  profile: "3/5",
  definition: "Single Definition",
  signature: "Satisfaction",
  not_self_theme: "Frustration",
  incarnation_cross: "Right Angle Cross of Explanation (49/4 | 43/23)",
  type_description: "CS-GENERATOR-TEXT",
  sacral_center_text: "CS-SACRAL-DEFINED",
};

let z = 0;
const el = (type: ReportCanvasElement["type"], payload: Record<string, unknown>, y: number): ReportCanvasElement => ({
  id: `e${z}`, type, zIndex: z++, geometry: { x: 40, y, width: 700, height: 40 }, style: { fontFamily: "Helvetica", fontSize: 10, borderWidth: 0 }, payload,
});
const designPages: ReportPage[] = [
  {
    id: "p1", title: "Tokens", visibleIf: null, blocks: [],
    elements: [
      ...Object.keys(TOKENS).map((token, i) => el("shortcode", { token }, 20 + i * 44)),
      el("shortcode", { token: "authority_description" }, 560),
      el("text", { text: "Profile {{profile}} · {{type}}" }, 610),
      el("text", { text: "A plain sentence with no tokens." }, 660),
    ],
  },
];

async function pdfText(pages: ReportPage[]): Promise<string> {
  const stream = await renderReportDesignPdfStream({ title: "Parity", readerName: reading.name, businessName: "Magnetix", pages, humanDesign: reading.humanDesign, astrology: reading.astrology });
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const file = path.join(os.tmpdir(), `parity-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, Buffer.concat(chunks));
  try {
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } finally {
    fs.unlinkSync(file);
  }
}

function webText(pages: ReportPage[], input: ShortcodeReadingInput): string {
  const design = { id: "d", subAccountId: "sa", agencyId: "ag", title: "Parity", layoutVersion: 2, pages, createdAt: null, updatedAt: null } as unknown as ReportDesign;
  const html = renderToStaticMarkup(createElement(ReportDesignViewer, { design, readingInput: input, ruleInput: { humanDesign: reading.humanDesign, astrology: reading.astrology } }));
  return html.replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
}

async function main() {
  // Generation exactly as createGeneratedReport does it.
  const genInput: ShortcodeReadingInput = { ...reading, reportContent: { values: contentSet!.values, strict: true } };
  const snapshotPages = resolveSnapshotPages(designPages, { humanDesign: reading.humanDesign, astrology: reading.astrology }, genInput);
  const report = { snapshot: { pages: snapshotPages, contentSet, layoutVersion: 2 } } as unknown as GeneratedReport;
  const surfaceInput = generatedReportShortcodeInput(report, reading as never);
  const generatedPdf = await pdfText(resolvePagesForRender(snapshotPages, surfaceInput));
  const generatedWeb = webText(snapshotPages, surfaceInput);

  console.log("\nGenerated PDF");
  await check("contains no raw {{token}} syntax", () => {
    assert.doesNotMatch(generatedPdf, /\{\{|\}\}/);
  });
  await check("every required shortcode resolves (personalized, chart values, Content Set, one center)", () => {
    for (const [token, value] of Object.entries(TOKENS)) assert.ok(generatedPdf.includes(value), `${token} → "${value}" missing from PDF`);
  });
  await check("inline Text tokens resolve; plain text is unchanged", () => {
    assert.ok(generatedPdf.includes("Profile 3/5 · Generator"));
    assert.ok(generatedPdf.includes("A plain sentence with no tokens."));
  });
  await check("missing Content Set text stays blank — no fallback to the reading's own text", () => {
    assert.ok(!generatedPdf.includes("LEGACY-READING"), "fell back to legacy reading text");
    assert.ok(!generatedPdf.includes("LEGACY-SACRAL"));
  });

  console.log("\nWeb report vs PDF");
  await check("the generated web preview shows the same resolved value for every token", () => {
    for (const [token, value] of Object.entries(TOKENS)) assert.ok(generatedWeb.includes(value), `${token} → "${value}" missing from web`);
    assert.ok(generatedWeb.includes("Profile 3/5 · Generator"));
    assert.doesNotMatch(generatedWeb, /\{\{|\}\}/);
    assert.ok(!generatedWeb.includes("LEGACY-"));
  });
  await check("a live public report (design pages + the design's Content Set) matches the generated PDF", () => {
    const live = webText(designPages, genInput);
    for (const value of Object.values(TOKENS)) assert.ok(live.includes(value), `"${value}" missing from live web`);
    assert.ok(live.includes("Profile 3/5 · Generator"));
    assert.doesNotMatch(live, /\{\{|\}\}/);
  });
  await check("Preview PDF path (design pages resolved live) matches too", async () => {
    const preview = await pdfText(resolvePagesForRender(designPages, genInput));
    for (const value of Object.values(TOKENS)) assert.ok(preview.includes(value), `"${value}" missing from Preview PDF`);
    assert.doesNotMatch(preview, /\{\{|\}\}/);
  });

  console.log("\nFrozen values + compatibility");
  await check("a generated report keeps its frozen values even if the reading or Content Set changes later", async () => {
    const changed: ShortcodeReadingInput = { ...surfaceInput, name: "Someone Else", reportContent: { values: {}, strict: true } };
    const pdf = await pdfText(resolvePagesForRender(snapshotPages, changed));
    assert.ok(pdf.includes("Jordan Rivera") && pdf.includes("CS-GENERATOR-TEXT"));
    assert.ok(!pdf.includes("Someone Else"));
    assert.ok(webText(snapshotPages, changed).includes("CS-GENERATOR-TEXT"));
  });
  await check("an older snapshot Shortcode without resolvedText resolves from the reading + snapshot Content Set", async () => {
    const old = snapshotPages.map((p) => ({ ...p, elements: p.elements?.map((e) => (e.type === "shortcode" ? { ...e, payload: { token: e.payload.token } } : e)) }));
    const pdf = await pdfText(resolvePagesForRender(old, surfaceInput));
    for (const value of Object.values(TOKENS)) assert.ok(pdf.includes(value), `"${value}" missing (old snapshot)`);
  });
  await check("existing saved Shortcode elements (token only) stay compatible; an unknown token renders blank, not raw", () => {
    assert.equal(shortcodeElementValue({ payload: { token: "type" } }, genInput), "Generator");
    assert.equal(shortcodeElementValue({ payload: {} }, genInput), "Jordan Rivera", "missing token defaults to full_name, as before");
    assert.equal(shortcodeElementValue({ payload: { token: "not_a_token" } }, genInput), "");
    assert.equal(shortcodeElementValue({ payload: { token: "type", resolvedText: "Frozen" } }, genInput), "Frozen");
  });
  await check("a value that resolves blank stays blank on the web report — never the editor's \"Add text\" placeholder", () => {
    const pages: ReportPage[] = [{ id: "m", title: "Missing", visibleIf: null, blocks: [], elements: [el("shortcode", { token: "incarnation_cross_description" }, 20), el("text", { text: "{{not_a_real_token}}" }, 80)] }];
    const web = webText(pages, genInput);
    assert.ok(!web.includes("Add text"), "placeholder leaked to readers");
    assert.doesNotMatch(web, /\{\{|\}\}/);
  });
  await check("the PDF renderer never prints a Shortcode element's raw syntax even when handed unresolved pages (safety net)", async () => {
    const raw = await pdfText(designPages);
    for (const token of ["full_name", "birth_date", "strategy", "incarnation_cross", "type_description"]) assert.ok(!raw.includes(`{{${token}}}`), token);
  });

  console.log("\nSource guards");
  const read = (p: string) => fs.readFileSync(p, "utf8");
  await check("every surface uses the shared resolver", () => {
    assert.match(read("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/generated-reports/[generatedReportId]/pdf/route.ts"), /resolvePagesForRender\(generatedReport\.snapshot\.pages, generatedReportShortcodeInput\(generatedReport, reading\)\)/);
    assert.match(read("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/generated-reports/[generatedReportId]/preview-data/route.ts"), /generatedReportShortcodeInput\(generatedReport, real\)/);
    assert.match(read("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/report-designs/[designId]/preview-pdf/route.ts"), /resolvePagesForRender\(visible, readingInput\)/);
    assert.match(read("src/components/energetic-decoder/report-design-viewer.tsx"), /shortcodeElementValue\(element, readingInput\)/);
    assert.doesNotMatch(read("src/lib/energetics/report-design-pdf-document.tsx"), /`\{\{\$\{String\(element\.payload\.token/);
  });
  await check("the public report resolves against the design's Content Set, blank when the set is gone", () => {
    const src = read("src/app/decoder/[saId]/report/[readingId]/design/[reportId]/page.tsx");
    assert.match(src, /getContentSet\(saId, design\.contentSetId \|\| DEFAULT_CONTENT_SET_ID\)/);
    assert.match(src, /reportContent: \{ values: contentValues, strict: true \}/);
    assert.match(src, /if \(!\(err instanceof ContentSetError\)\) throw err;/);
  });

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
