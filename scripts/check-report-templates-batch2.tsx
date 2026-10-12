/**
 * Report Builder Template Library — Batch 2 (2026-10-12): Midnight Horizon,
 * Practitioner Note, Center Focus.
 *
 * Proves: the shipped pages are the reconstruction spec (Midnight Horizon +
 * Practitioner Note unmodified; Center Focus differs only by the documented
 * all-Centers adaptations); insertion makes fresh, independent, editable
 * pages (a Center page needs its Center); the page-Center shortcodes
 * resolve for every Center with no Sacral leakage, identically on the web
 * page, the PDF pages and the frozen generated snapshot; Center pages work
 * with the existing visibility rules; image payloads survive and empty
 * images render nothing for readers; canvas pages print full-bleed (dark
 * and warm backgrounds reach every corner, no header strip) and scale as a
 * whole on the web; thumbnails render the real template pages.
 *
 * Run: NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-report-templates-batch2.tsx
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import batch2 from "../src/lib/energetics/report-templates.batch2.json";
import { REPORT_TEMPLATES, instantiateReportTemplate, type ReportTemplate } from "../src/lib/energetics/report-templates";
import { ReportCanvasPage, ReportDesignViewer } from "../src/components/energetic-decoder/report-design-viewer";
import { ReportTemplateThumbnail, THUMBNAIL_SAMPLE_CENTER } from "../src/components/energetic-decoder/report-template-library";
import { REPORT_BUILDER_FIXTURE_READING } from "../src/lib/energetics/report-builder-fixture";
import { CENTER_TITLES, SHORTCODE_CATALOG, resolveShortcodes, type ShortcodeReadingInput } from "../src/lib/energetics/shortcodes";
import { CENTERS, type CenterKey } from "../src/lib/energetics/human-design-data";
import { pageShortcodeInput, resolvePagesForRender } from "../src/lib/energetics/report-shortcode-render";
import { renderReportDesignPdfStream } from "../src/lib/energetics/report-design-pdf-render";
import { evaluateChartRule } from "../src/lib/energetics/chart-rules";
import type { ReportDesign, ReportPage } from "../src/types/report-blocks";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const T = (id: string) => REPORT_TEMPLATES.find((t) => t.id === id)!;
const midnight = T("cover-midnight");
const note = T("about-note");
const center = T("center-focus");
const BATCH2 = [midnight, note, center];
const R = REPORT_BUILDER_FIXTURE_READING;

// Content Set text for every Center, tagged so leakage between Centers is detectable.
const values: Record<string, { fields: Record<string, string> }> = {};
for (const c of CENTERS) values[`hd:center:${c}`] = { fields: { definedText: `DEF-${c} defined passage.`, undefinedText: `UND-${c} undefined passage.` } };
const INPUT: ShortcodeReadingInput = { ...R, reportContent: { strict: true, values } };

async function pdf(pages: ReportPage[]): Promise<string> {
  const stream = await renderReportDesignPdfStream({ title: "Batch2 Header", readerName: "Preview Sample", businessName: "Magnetix", pages, humanDesign: R.humanDesign, astrology: R.astrology, pageSize: "letter" });
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const file = path.join(os.tmpdir(), `b2-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, Buffer.concat(chunks));
  return file;
}
/** RGB of a pixel in a rasterised PDF page (pdftoppm PPM at low resolution). */
function pixel(file: string, pageNo: number, fx: number, fy: number): [number, number, number] {
  const out = path.join(os.tmpdir(), `b2px-${process.pid}-${pageNo}`);
  execFileSync("pdftoppm", ["-r", "20", "-f", String(pageNo), "-l", String(pageNo), "-singlefile", file, out]);
  const buf = fs.readFileSync(`${out}.ppm`);
  fs.unlinkSync(`${out}.ppm`);
  const header = buf.toString("latin1", 0, 40).split(/\s+/);
  const w = Number(header[1]), h = Number(header[2]);
  const start = buf.indexOf(Buffer.from(header[3] + "\n"), 2) + header[3].length + 1;
  const x = Math.min(w - 1, Math.round(fx * (w - 1))), y = Math.min(h - 1, Math.round(fy * (h - 1)));
  const i = start + (y * w + x) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
}
const near = (a: number[], hex: string, tol = 6) => {
  const b = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  return a.every((v, i) => Math.abs(v - b[i]) <= tol);
};

async function main() {
  console.log("\nSource of truth");
  await check("Batch 2 = Midnight Horizon (Cover · Midnight), Practitioner Note (About Me · Warm Sunset), Center Focus (Center · Midnight); 13 · 13 · 11 elements", () => {
    assert.deepEqual(BATCH2.map((t) => [t.name, t.pageType, t.styleTag, t.page.elements!.length]), [["Midnight Horizon", "Cover", "Midnight", 13], ["Practitioner Note", "About Me", "Warm Sunset", 13], ["Center Focus", "Center", "Midnight", 11]]);
    assert.deepEqual(REPORT_TEMPLATES.slice(5).map((t) => t.id), ["cover-midnight", "about-note", "center-focus"], "appended after Batch 1");
    assert.ok(center.centerPage && !midnight.centerPage && !note.centerPage);
  });
  const handoff = path.join(os.homedir(), "Documents/magnetix-release-records/2026-10-11-template-library-mockup/template-specs.json");
  await check("Midnight Horizon + Practitioner Note are byte-identical to template-specs.json; Center Focus differs only by the documented adaptations (when the handoff file is available)", () => {
    if (!fs.existsSync(handoff)) return console.log("    (handoff file not on this machine — skipped)");
    const spec = JSON.parse(fs.readFileSync(handoff, "utf8")) as { templates: { id: string; reportPage: ReportPage }[] };
    const specPage = (id: string) => spec.templates.find((s) => s.id === id)!.reportPage;
    assert.deepEqual(midnight.page, specPage("cover-midnight"));
    assert.deepEqual(note.page, specPage("about-note"));
    const sp = specPage("center-focus");
    const changed = center.page.elements!.filter((e, i) => JSON.stringify(e) !== JSON.stringify(sp.elements![i])).map((e) => e.id);
    assert.deepEqual(changed, ["tpl-center-focus-03", "tpl-center-focus-04", "tpl-center-focus-05", "tpl-center-focus-07", "tpl-center-focus-09", "tpl-center-focus-10"]);
    const el = (id: string) => center.page.elements!.find((e) => e.id === id)!;
    const spe = (id: string) => sp.elements!.find((e) => e.id === id)!;
    assert.deepEqual({ ...el("tpl-center-focus-03"), type: "text", payload: spe("tpl-center-focus-03").payload, geometry: { ...el("tpl-center-focus-03").geometry, height: 90 } }, spe("tpl-center-focus-03"), "title: only type/token/height");
    assert.deepEqual(el("tpl-center-focus-03").payload, { token: "center_name" });
    assert.deepEqual([el("tpl-center-focus-04").style?.borderRadius, el("tpl-center-focus-05").style?.borderRadius], [82, 40], "neutral circles");
    assert.deepEqual({ ...el("tpl-center-focus-04"), style: { ...el("tpl-center-focus-04").style, borderRadius: 14 } }, spe("tpl-center-focus-04"));
    assert.deepEqual({ ...el("tpl-center-focus-05"), style: { ...el("tpl-center-focus-05").style, borderRadius: 8 } }, spe("tpl-center-focus-05"));
    assert.deepEqual({ ...el("tpl-center-focus-07"), payload: spe("tpl-center-focus-07").payload }, spe("tpl-center-focus-07"));
    assert.deepEqual(el("tpl-center-focus-07").payload, { token: "center_text" });
    assert.deepEqual(el("tpl-center-focus-09").payload, { text: "IN YOUR CHART" });
    assert.deepEqual({ ...el("tpl-center-focus-10"), type: "text", payload: spe("tpl-center-focus-10").payload }, spe("tpl-center-focus-10"));
    assert.deepEqual(el("tpl-center-focus-10").payload, { token: "center_state" });
    assert.equal(batch2.centerFocusAdaptations.length, 6, "each adaptation documented");
  });
  await check("no Sacral-only content anywhere in the Center template (no sacral token, title, square motif or Sacral keywords)", () => {
    const json = JSON.stringify(center.page);
    assert.doesNotMatch(json, /sacral|Sacral|Life force/);
    for (const e of center.page.elements!) if (e.type === "shortcode") assert.ok(["center_name", "center_text", "center_state"].includes(String(e.payload.token)), String(e.payload.token));
  });

  console.log("\nInsertion + editability");
  for (const t of BATCH2) {
    await check(`${t.name}: fresh page + element ids, normal editable elements, template untouched; two inserts share no ids`, () => {
      const before = JSON.stringify(t);
      const opts = t.centerPage ? { centerKey: "spleen" as CenterKey } : undefined;
      const a = instantiateReportTemplate(t, undefined, opts);
      const b = instantiateReportTemplate(t, undefined, opts);
      const all = [a.id, b.id, ...a.elements!.map((e) => e.id), ...b.elements!.map((e) => e.id)];
      assert.equal(new Set(all).size, all.length);
      assert.ok(all.every((x) => !x.startsWith("tpl-")));
      a.elements!.forEach((e, i) => assert.deepEqual({ ...e, id: t.page.elements![i].id }, t.page.elements![i]));
      assert.ok(a.elements!.every((e) => ["text", "shortcode", "shape", "frame", "image"].includes(e.type) && !e.locked && !e.hidden), "only normal element types");
      assert.equal(JSON.stringify(t), before);
    });
  }
  await check("Center Focus needs a Center; the page gets it (centerKey) and is titled after it", () => {
    assert.throws(() => instantiateReportTemplate(center), /needs a Center/);
    for (const c of CENTERS) {
      const p = instantiateReportTemplate(center, undefined, { centerKey: c });
      assert.equal(p.centerKey, c);
      assert.equal(p.title, CENTER_TITLES[c]);
      assert.equal(p.visibleIf, null, "visible for everyone by default");
    }
    assert.equal(instantiateReportTemplate(midnight).centerKey, undefined, "other templates carry no Center");
  });
  await check("Practitioner Note: the portrait is a real, empty Image element (circle crop by radius); a chosen image survives insert + save/reload", () => {
    const img = note.page.elements!.find((e) => e.type === "image")!;
    assert.deepEqual(img.payload, { url: "", alt: "Practitioner portrait", fit: "cover" });
    assert.deepEqual([img.geometry.width, img.geometry.height, img.style?.borderRadius], [200, 200, 100]);
    const p = instantiateReportTemplate(note);
    const picked: ReportPage = { ...p, elements: p.elements!.map((e) => (e.type === "image" ? { ...e, payload: { ...e.payload, assetId: "m1", url: "https://example.com/me.jpg", title: "Me" } } : e)) };
    const reloaded = JSON.parse(JSON.stringify(picked)) as ReportPage;
    assert.deepEqual(reloaded, picked);
    const html = renderToStaticMarkup(createElement(ReportCanvasPage, { page: reloaded, readingInput: INPUT }));
    assert.match(html, /<img src="https:\/\/example.com\/me.jpg"[^>]*border-radius:100px/);
    assert.doesNotMatch(html, /Choose an image|Practitioner Name|Hannah/);
  });
  await check("save/reload keeps the page Center (pages are stored as sent)", () => {
    const p = instantiateReportTemplate(center, undefined, { centerKey: "ajna" });
    assert.equal((JSON.parse(JSON.stringify([p])) as ReportPage[])[0].centerKey, "ajna");
    const route = fs.readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/report-designs/[designId]/route.ts", "utf8");
    assert.match(route, /if \(Array\.isArray\(body\.pages\)\) fields\.pages = body\.pages;/);
  });

  console.log("\nCenter binding");
  await check("page-Center shortcodes are catalog tokens; blank without a (valid) page Center", () => {
    const cat = new Set(SHORTCODE_CATALOG.map((s) => s.token));
    for (const t of ["center_name", "center_state", "center_text"]) assert.ok(cat.has(t), t);
    for (const pc of [undefined, null, "", "nope", "__proto__"]) assert.equal(resolveShortcodes("[{{center_name}}|{{center_state}}|{{center_text}}]", { ...INPUT, pageCenter: pc as CenterKey }), "[||]");
  });
  await check("all nine Centers: name, Defined/Undefined from the reading, and that Center's own Content Set text (no leakage)", () => {
    for (const c of CENTERS) {
      const defined = R.humanDesign.definedCenters!.includes(c);
      const out = resolveShortcodes("{{center_name}}|{{center_state}}|{{center_text}}", { ...INPUT, pageCenter: c });
      assert.equal(out, `${CENTER_TITLES[c]}|${defined ? "Defined" : "Undefined"}|${defined ? "DEF" : "UND"}-${c} ${defined ? "defined" : "undefined"} passage.`, c);
      for (const other of CENTERS) if (other !== c) assert.ok(!out.includes(`-${other} `), `${c} leaks ${other}`);
    }
  });
  await check("same answer as the per-Center tokens; legacy reading content (no Content Set) works too", () => {
    for (const c of CENTERS) assert.equal(resolveShortcodes("{{center_text}}", { ...INPUT, pageCenter: c }), resolveShortcodes(`{{${c}_center_text}}`, INPUT));
    const legacy = { ...R, humanDesign: { ...R.humanDesign, content: { centers: { heart: { definedText: "L-DEF", undefinedText: "L-UND" } } } } } as unknown as ShortcodeReadingInput;
    assert.equal(resolveShortcodes("{{center_text}}", { ...legacy, pageCenter: "heart" }), "L-UND");
  });
  const centerPages = (["sacral", "head", "heart", "solarplexus"] as CenterKey[]).map((c) => instantiateReportTemplate(center, undefined, { centerKey: c }));
  await check("parity: web page, PDF pages and the frozen generated snapshot resolve each page with its own Center", async () => {
    const forPdf = resolvePagesForRender(centerPages, INPUT);
    const { resolveSnapshotPages } = await import("../src/lib/server/generated-report-service");
    const snap = resolveSnapshotPages(centerPages, { humanDesign: R.humanDesign }, INPUT);
    centerPages.forEach((p, i) => {
      const c = p.centerKey!;
      const expected = resolveShortcodes("{{center_text}}", { ...INPUT, pageCenter: c });
      const pdfText = forPdf[i].elements!.find((e) => e.id === p.elements![6].id)!.payload.text;
      const frozen = snap[i].elements!.find((e) => e.id === p.elements![6].id)!.payload.resolvedText;
      const web = renderToStaticMarkup(createElement(ReportCanvasPage, { page: p, readingInput: INPUT }));
      assert.equal(pdfText, expected);
      assert.equal(frozen, expected);
      assert.ok(web.includes(expected) && web.includes(CENTER_TITLES[c]), c);
      assert.equal(forPdf[i].elements!.find((e) => e.id === p.elements![2].id)!.payload.text, CENTER_TITLES[c]);
    });
    assert.deepEqual(pageShortcodeInput(INPUT, { centerKey: "root" }).pageCenter, "root");
  });
  await check("visibility: a Center page can use the existing Defined / Open Center rules (one condition per page, no new engine)", async () => {
    const { resolveSnapshotPages } = await import("../src/lib/server/generated-report-service");
    const onlyDefined = { ...centerPages[2], visibleIf: { attribute: "definedCenters" as const, operator: "contains" as const, value: "heart" } };
    const onlyOpen = { ...centerPages[2], id: "x", visibleIf: { attribute: "openCenters" as const, operator: "contains" as const, value: "heart" } };
    const rule = { humanDesign: R.humanDesign };
    assert.equal(evaluateChartRule(onlyDefined.visibleIf, rule), false, "fixture's Heart is open");
    assert.equal(evaluateChartRule(onlyOpen.visibleIf, rule), true);
    assert.deepEqual(resolveSnapshotPages([onlyDefined, onlyOpen], rule, INPUT).map((p) => p.id), ["x"]);
  });

  console.log("\nRendering");
  await check("web report: canvas pages are the real 816×1056 page scaled as a whole (no title strip); block pages unchanged", () => {
    const design: ReportDesign = { id: "d", subAccountId: "s", agencyId: "a", title: "T", status: "draft", layoutVersion: 2, pageSize: "letter", pages: [instantiateReportTemplate(midnight)], createdAt: "", updatedAt: "" } as unknown as ReportDesign;
    const html = renderToStaticMarkup(createElement(ReportDesignViewer, { design, readingInput: INPUT, ruleInput: { humanDesign: R.humanDesign } }));
    assert.match(html, /data-report-canvas-page="[^"]+"[^>]*>|style="height:1056px"/);
    assert.match(html, /width:816px;height:1056px/);
    assert.doesNotMatch(html, /<h2[^>]*>Midnight Horizon<\/h2>/);
    const viewer = fs.readFileSync("src/components/energetic-decoder/report-design-viewer.tsx", "utf8");
    assert.doesNotMatch(viewer, /aspectRatio: "8\.5 \/ 11", minHeight: 760/, "old % layout with unscaled fonts is gone");
  });
  await check("empty Image: readers see nothing (web + PDF); thumbnails show a quiet placeholder; the editor still prompts", () => {
    const p = instantiateReportTemplate(note);
    const web = renderToStaticMarkup(createElement(ReportCanvasPage, { page: p, readingInput: INPUT }));
    assert.doesNotMatch(web, /Choose an image|data-empty-image/);
    assert.match(renderToStaticMarkup(createElement(ReportCanvasPage, { page: p, readingInput: INPUT, imagePlaceholders: true })), /data-empty-image/);
    assert.doesNotMatch(fs.readFileSync("src/lib/energetics/report-design-pdf-document.tsx", "utf8"), /Image asset unavailable/);
    assert.match(fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8"), /Choose an image asset/);
  });
  await check("PDF: full-bleed canvas pages — the dark/warm background reaches every corner, no header strip, no raw tokens, no auto-hyphens", async () => {
    const pages = resolvePagesForRender([instantiateReportTemplate(midnight), instantiateReportTemplate(note), ...centerPages], INPUT);
    const file = await pdf(pages);
    try {
      assert.match(execFileSync("pdfinfo", [file], { encoding: "utf8" }), /Pages:\s+6\b/);
      for (const [n, hex] of [[1, "#0f1115"], [2, "#fff7ed"], [3, "#0f1115"]] as const) for (const [fx, fy] of [[0.005, 0.005], [0.995, 0.005], [0.005, 0.995], [0.995, 0.995]]) assert.ok(near(pixel(file, n, fx, fy), hex), `page ${n} corner ${fx},${fy} = ${pixel(file, n, fx, fy)}`);
      const text = execFileSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" });
      assert.doesNotMatch(text, /\{\{|\}\}|Batch2 Header|For Preview Sample|Image asset unavailable/);
      assert.doesNotMatch(text, /[A-Za-z]-\n[a-z]/, "no word split across lines with an automatic hyphen");
      for (const must of ["Generator", "3/5", "Preview Sample", "Hello, I'm [Your Name]", "WORK WITH ME", "[yourwebsite.com]", "With warmth, [Your Name]", "Sacral Center", "DEF-sacral", "Head Center", "Heart Center", "UND-heart", "Solar Plexus Center", "Defined", "Undefined"]) assert.ok(text.replace(/\s+/g, "").includes(must.replace(/\s+/g, "")), `PDF missing "${must}"`); // letter-spaced labels extract as spaced letters
      const pageTexts = text.split("\f");
      assert.ok(pageTexts[4].includes("Heart Center") && !/sacral|Sacral/.test(pageTexts[4]), "Heart page has no Sacral text");
    } finally {
      fs.unlinkSync(file);
    }
  });

  await check("PDF: a chosen portrait prints as a true circle (inner radius on the padded image, like the web) — not a flat-sided disc", async () => {
    // A solid red 16×16 PNG as the "photo".
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.concat(Array.from({ length: 16 }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 16 }, () => [255, 0, 0]).flat())])));
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    const p = instantiateReportTemplate(note);
    p.elements = p.elements!.map((e) => (e.type === "image" ? { ...e, payload: { ...e.payload, url: `data:image/png;base64,${png.toString("base64")}` } } : e));
    const file = await pdf(resolvePagesForRender([p], INPUT));
    try {
      // Portrait box 72,96 200×200 → centre (172,196); visible circle radius 90 (100 − 10 padding).
      assert.ok(near(pixel(file, 1, 172 / 816, 196 / 1056), "#ff0000", 20), "centre is the photo");
      const d = 95 / Math.SQRT2;
      assert.ok(near(pixel(file, 1, (172 + d) / 816, (196 + d) / 1056), "#fff7ed", 20), `45° just outside the circle is the page, got ${pixel(file, 1, (172 + d) / 816, (196 + d) / 1056)}`);
    } finally {
      fs.unlinkSync(file);
    }
  });

  console.log("\nThumbnails + library");
  await check("thumbnails are the real template pages (Center Focus with a sample Center; empty portrait as a quiet placeholder; dark page legible)", () => {
    const mid = renderToStaticMarkup(createElement(ReportTemplateThumbnail, { template: midnight }));
    assert.match(mid, /#0f1115/);
    assert.ok(mid.includes("Generator") && mid.includes("Preview Sample"));
    const n = renderToStaticMarkup(createElement(ReportTemplateThumbnail, { template: note }));
    assert.match(n, /data-empty-image/);
    const c = renderToStaticMarkup(createElement(ReportTemplateThumbnail, { template: center as ReportTemplate }));
    assert.ok(c.includes(CENTER_TITLES[THUMBNAIL_SAMPLE_CENTER]) && c.includes("Defined"));
    assert.doesNotMatch(mid + n + c, /\{\{/);
  });
  const lib = fs.readFileSync("src/components/energetic-decoder/report-template-library.tsx", "utf8");
  const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
  await check("library: Center pages open the Center chooser (all nine) before inserting; others insert directly", () => {
    assert.match(lib, /onClick=\{\(\) => \(template\.centerPage \? setChoosingCenterFor\(template\) : onInsert\(template\)\)\}/);
    assert.match(lib, /CENTERS\.map\(\(c\) => \(/);
    assert.match(lib, /if \(t\) onInsert\(t, \{ centerKey: c \}\);/);
    assert.match(editor, /function insertTemplate\(template: ReportTemplate, opts\?: \{ centerKey: CenterKey \}\)/);
  });
  await check("editor: Page settings has a Page Center control (None + nine Centers) stored on the page", () => {
    assert.match(editor, /data-page-center/);
    assert.match(editor, /onChange=\{\(e\) => updatePage\(\(p\) => \(\{ \.\.\.p, centerKey: asCenterKey\(e\.target\.value\) \}\)\)\}/);
  });
  await check("editor: images are chosen through the public-copy flow (never a short-lived signed thumbnail URL)", () => {
    assert.match(editor, /<MediaLibraryPublicImagePicker/);
    assert.doesNotMatch(editor, /item\.thumbnailUrl/);
    const picker = fs.readFileSync("src/components/assets/media-library-image-button.tsx", "utf8");
    assert.match(picker, /if \(item\.publicUrl\) onPick\(item\.publicUrl, item\);\s*else setPending\(item\);/);
    assert.match(picker, /\/media-library\/\$\{item\.id\}\/public-image/);
  });
  await check("editor: element content is clipped by an inner layer, so resize/rotate handles work on circles and rounded cards; page top accent no longer shifts the canvas", () => {
    assert.match(editor, /className=\{`absolute text-left \$\{selected/);
    assert.match(editor, /className="absolute inset-0 block overflow-hidden"\s*style=\{\{\s*borderRadius: "inherit",/);
    assert.doesNotMatch(editor, /borderTop: `4px solid/);
    assert.match(editor, /<span className="whitespace-pre-wrap break-words">\{label\}<\/span>/);
  });

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
