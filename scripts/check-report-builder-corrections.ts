import assert from "node:assert/strict";
import fs from "node:fs";
import { contentRequirementLabel } from "@/lib/energetic-decoder/content-sets";

const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
const previewRoute = fs.readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/report-designs/[designId]/preview-pdf/route.ts", "utf8");

assert.equal(contentRequirementLabel("hd:channel:12-22", "description"), "Channel 12–22 — Interpretation");
assert.match(contentRequirementLabel("hd:incarnationCross:rightAngle-12-11-36-6", "description"), /^Right Angle Cross of /);
assert.equal(contentRequirementLabel("astro:planetHouse:sun:10", "description"), "Sun in 10th House — Interpretation");
assert.equal(contentRequirementLabel("freq:gate:1", "giftText"), "Frequency Gate 1 — How the gift shows up");

for (const required of ["rightPanel", "inspectorOpen", "toggleInspector", "Fit Page", "Fit Width", "type=\"range\"", "TEMPLATE_DEFINITIONS", "Backspace", "Delete", "report-canvas-scale-box", "scaledStageWidth", "scaledStageHeight", "Report Builder", "Energetic Decoder", "pageOverviewOpen", "Page thumbnails", "Template Library", "renderToolRail", "renderActiveToolPanel", "openTool", "Tools", "lg:grid-cols-[92px_minmax(0,1fr)]"]) {
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
assert.match(editor, /absolute inset-x-4 bottom-4/);
assert.doesNotMatch(editor, /hidden sm:block.*Zoom/);
assert.doesNotMatch(editor, /relative flex min-h-\[76px\]/, "legacy permanent tool-card grid must stay removed");
assert.doesNotMatch(editor, /<Plus className=/, "tool rail must not show plus affordances");
assert.doesNotMatch(editor, /remain Coming soon/);
assert.match(editor, /width: scaledStageWidth, height: scaledStageHeight/);
assert.match(editor, /pageDimensions\.width \* scale/);
assert.match(editor, /pages\.length \* \(pageDimensions\.height \+ PAGE_CONTEXT_HEIGHT\)/);
assert.match(editor, /Math\.max\(0, pages\.length - 1\) \* pageGap/);
assert.match(editor, /height \/ \(pageDimensions\.height \+ PAGE_CONTEXT_HEIGHT\)/);
assert.doesNotMatch(editor, /transform: scale\(\.42\)/, "mobile must not retain a stale hard-coded transform");
assert.match(editor, /transform-origin: top left !important/);
assert.match(previewRoute, /renderReportDesignPdfStream/);

console.log("✓ Report Builder correction checks passed");
