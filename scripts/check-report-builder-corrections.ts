import assert from "node:assert/strict";
import fs from "node:fs";
import { contentRequirementLabel } from "@/lib/energetic-decoder/content-sets";
import * as zoom from "../src/components/energetic-decoder/report-zoom-control";

const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
const previewRoute = fs.readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/report-designs/[designId]/preview-pdf/route.ts", "utf8");

assert.equal(contentRequirementLabel("hd:channel:12-22", "description"), "Channel 12–22 — Interpretation");
assert.match(contentRequirementLabel("hd:incarnationCross:rightAngle-12-11-36-6", "description"), /^Right Angle Cross of /);
assert.equal(contentRequirementLabel("astro:planetHouse:sun:10", "description"), "Sun in 10th House — Interpretation");
assert.equal(contentRequirementLabel("freq:gate:1", "giftText"), "Frequency Gate 1 — How the gift shows up");

for (const required of ["rightPanel", "inspectorOpen", "toggleInspector", "TEMPLATE_DEFINITIONS", "Backspace", "Delete", "report-canvas-scale-box", "scaledStageWidth", "scaledStageHeight", "Report Builder", "Energetic Decoder", "pageOverviewOpen", "Page thumbnails", "Template Library", "renderToolRail", "renderActiveToolPanel", "openTool", "Tools", "lg:grid-cols-[92px_minmax(0,1fr)]"]) {
  assert.match(editor, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `editor regression guard: ${required}`);
}
assert.match(editor, /const PAGE_CONTEXT_HEIGHT = 44/);
assert.match(editor, /rightPanel: RightPanel =|type RightPanel = "layers" \| "element" \| "page"/);
assert.match(editor, /rightPanel === "layers" \? renderLayerPanel\(\) : renderElementPanel/);
assert.match(editor, /setInspectorOpen\(true\)/);
assert.match(editor, /Page \{Math\.max\(1, pages\.findIndex/);
assert.match(editor, /Use template/);
assert.match(editor, /FileText/);
assert.match(editor, /Add Page/);
assert.match(editor, /CelestialDecoration/);
assert.doesNotMatch(editor, /hidden sm:block.*Zoom/);
assert.doesNotMatch(editor, /relative flex min-h-\[76px\]/, "legacy permanent tool-card grid must stay removed");
assert.doesNotMatch(editor, /<Plus className=/, "tool rail must not show plus affordances");
assert.doesNotMatch(editor, /setTab\("page"\)/, "inspector must not retain a nested Element/Page selector");
assert.doesNotMatch(editor, /remain Coming soon/);
assert.match(editor, /width: scaledStageWidth, height: scaledStageHeight/);
assert.match(editor, /pageDimensions\.width \* scale/);
assert.match(editor, /pages\.length \* \(pageDimensions\.height \+ PAGE_CONTEXT_HEIGHT\)/);
assert.match(editor, /Math\.max\(0, pages\.length - 1\) \* pageGap/);
assert.match(editor, /height \/ \(pageDimensions\.height \+ PAGE_CONTEXT_HEIGHT\)/);
assert.doesNotMatch(editor, /transform: scale\(\.42\)/, "mobile must not retain a stale hard-coded transform");
assert.match(editor, /transform-origin: top left !important/);
assert.match(previewRoute, /renderReportDesignPdfStream/);

// ── Final visual/interaction correction (2026-10-10) ─────────────────
const zoomSrc = fs.readFileSync("src/components/energetic-decoder/report-zoom-control.tsx", "utf8");
// Breadcrumb: Energetic Decoder is a real link, routed through the unsaved-changes guard.
assert.match(editor, /<a href=\{`\/sa\/\$\{subAccountId\}\/energetic-decoder`\} onClick=\{\(e\) => leaveEditor\(e,/);
assert.match(editor, /data-breadcrumb="energetic-decoder"/);
assert.match(editor, /if \(dirty && !window\.confirm\(/);
// The redundant toolbar Back button is gone.
assert.doesNotMatch(editor, /<ArrowLeft className="h-4 w-4" \/> Back/);
assert.doesNotMatch(editor, /ArrowLeft/);
// The permanent sample-data toolbar pill is gone; the disclosure is contextual (chart tool + chart inspector).
assert.doesNotMatch(editor, /Design preview uses sample chart data/);
assert.equal((editor.match(/data-sample-chart-note/g) ?? []).length, 2);
// ONE zoom system, in the toolbar: Fit Page, Fit Width, %, −, slider, +.
assert.match(editor, /<ZoomControl mode=\{zoom\} percent=\{zoomPercent\} onChange=\{setZoom\} \/>/);
assert.equal((editor.match(/<ZoomControl /g) ?? []).length, 1, "exactly one zoom control");
assert.doesNotMatch(editor, /type="range"/, "no second (native) zoom slider");
for (const piece of ['"Fit Page"', '"Fit Width"', 'role="slider"', 'aria-label="Zoom out"', 'aria-label="Zoom in"', "data-zoom-knob", "data-zoom-percent", "setPointerCapture"]) {
  assert.ok(zoomSrc.includes(piece), `zoom control: ${piece}`);
}
// The percentage is the true scale.
assert.match(editor, /const scale = typeof zoom === "number" \? clampZoom\(zoom\) \/ 100 : fitScale;/);
assert.match(editor, /const zoomPercent = Math\.round\(scale \* 100\);/);
assert.doesNotMatch(editor, /zoom \/ 60|scale \* 60/);
// Page navigator is a sibling of the scroll viewport, never inside it.
const columnStart = editor.indexOf("data-canvas-column");
const viewportStart = editor.indexOf("data-canvas-viewport");
const viewportEnd = editor.indexOf("</main>", viewportStart);
const navStart = editor.indexOf("data-page-navigator");
assert.ok(columnStart > 0 && columnStart < viewportStart, "viewport lives in the canvas column");
assert.ok(navStart > viewportEnd, "navigator comes AFTER the viewport closes — outside the scroller");
assert.doesNotMatch(editor, /absolute inset-x-4 bottom-3/, "navigator is not absolutely positioned inside the canvas");
assert.match(editor, /overflow-auto[^"]*lg:flex-1" data-canvas-viewport/);
// Inspector behavior preserved: Element / Page / Layers, Page settings toggle, collapse.
assert.match(editor, /onClick=\{\(\) => toggleInspector\("page"\)\} aria-pressed=/);
assert.match(editor, /Collapse inspector/);
for (const tab of ['toggleInspector("element")', 'toggleInspector("layers")']) assert.ok(editor.includes(tab), tab);

// Pure zoom maths.
assert.equal(zoom.stepZoom(47, 1), 50);
assert.equal(zoom.stepZoom(47, -1), 40);
assert.equal(zoom.stepZoom(50, 1), 60);
assert.equal(zoom.stepZoom(10, -1), zoom.ZOOM_MIN);
assert.equal(zoom.stepZoom(200, 1), zoom.ZOOM_MAX);
assert.equal(zoom.clampZoom(3), 10);
assert.equal(zoom.clampZoom(999), 200);

console.log("✓ Report Builder correction checks passed");
