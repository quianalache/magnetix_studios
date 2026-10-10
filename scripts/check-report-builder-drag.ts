/**
 * Report Builder element drag/resize lifecycle (2026-10-10) — regression
 * checks for the live "element keeps following the pointer after release"
 * bug and the active-page behavior. Pure gesture rules + source guards;
 * real-pointer browser QA runs separately (local harness + live).
 *
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-report-builder-drag.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DRAG_THRESHOLD,
  clampMoveToPage,
  clampResizeToPage,
  finishGesture,
  moveGesture,
  startGesture,
  type PointerSample,
} from "../src/components/energetic-decoder/report-drag-gesture";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const down = (x: number, y: number, extra: Partial<PointerSample> = {}): PointerSample => ({ pointerId: 1, clientX: x, clientY: y, button: 0, buttons: 1, isPrimary: true, ...extra });
const PAGE = { width: 816, height: 1056 };
const box = { x: 60, y: 80, width: 540, height: 92 };

console.log("\nGesture rules");
check("only a primary-button press of the primary pointer starts a gesture", () => {
  assert.ok(startGesture(down(10, 10)));
  assert.equal(startGesture(down(10, 10, { button: 2, buttons: 2 })), null, "right-click / two-finger click");
  assert.equal(startGesture(down(10, 10, { isPrimary: false })), null, "second finger");
});
check("a click (no movement past the threshold) never moves anything", () => {
  const g = startGesture(down(100, 100))!;
  const r = moveGesture(g, down(100 + DRAG_THRESHOLD - 1, 100), 1);
  assert.equal(r.kind, "move");
  assert.equal(r.kind === "move" && r.gesture.active, false);
  assert.equal(finishGesture(r.kind === "move" ? r.gesture : g), null);
});
check("pointermove without the primary button pressed does NOT move — it reports a missed release", () => {
  const g = startGesture(down(100, 100))!;
  const moved = moveGesture(g, down(160, 140), 1);
  assert.equal(moved.kind, "move");
  const stray = moveGesture(moved.kind === "move" ? moved.gesture : g, down(400, 400, { buttons: 0 }), 1);
  assert.equal(stray.kind, "released", "a hover after release ends the gesture instead of following");
});
check("moves from another pointer are ignored", () => {
  const g = startGesture(down(0, 0))!;
  assert.equal(moveGesture(g, down(50, 50, { pointerId: 2 }), 1).kind, "ignore");
});
check("deltas are converted from screen px to page units (÷ zoom), so the element tracks the cursor", () => {
  const g = startGesture(down(0, 0))!;
  const r = moveGesture(g, down(42, 21), 0.42);
  assert.ok(r.kind === "move" && Math.abs(r.gesture.dx - 100) < 1e-9 && Math.abs(r.gesture.dy - 50) < 1e-9);
});
check("pointerup commits the final offset once; nothing to commit for a plain click", () => {
  const g = startGesture(down(0, 0))!;
  const r = moveGesture(g, down(30, 40), 1);
  assert.deepEqual(finishGesture(r.kind === "move" ? r.gesture : null), { dx: 30, dy: 40 });
  assert.equal(finishGesture(null), null);
});
check("dragging toward another page stops at this page's edge (no cross-page transfer)", () => {
  const clamp = clampMoveToPage(box, PAGE);
  const g = startGesture(down(0, 0))!;
  const r = moveGesture(g, down(0, 5000), 1, clamp);
  assert.ok(r.kind === "move");
  if (r.kind === "move") {
    assert.equal(box.y + r.gesture.dy, PAGE.height - box.height, "bottom edge of its own page");
    assert.equal(box.x + r.gesture.dx, box.x);
  }
  const left = clamp(-1000, -1000);
  assert.deepEqual({ x: box.x + left.dx, y: box.y + left.dy }, { x: 0, y: 0 });
});
check("resize keeps the minimum size and stays inside the page", () => {
  const c = clampResizeToPage(box, PAGE);
  assert.deepEqual(c(-9999, -9999), { dx: 80 - box.width, dy: 50 - box.height });
  assert.equal(box.x + box.width + c(9999, 0).dx, PAGE.width);
});

console.log("\nEditor wiring (source guards)");
const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");
check("gesture move/up/cancel/blur are window listeners added at pointerdown and removed at the end", () => {
  for (const ev of ["pointermove", "pointerup", "pointercancel", "blur"]) {
    assert.ok(editor.includes(`window.addEventListener("${ev}"`), `adds ${ev}`);
    assert.ok(editor.includes(`window.removeEventListener("${ev}"`), `removes ${ev}`);
  }
  assert.match(editor, /useEffect\(\(\) => \(\) => cleanupRef\.current\?\.\(\), \[\]\)/, "unmount cleanup");
  assert.match(editor, /const onCancel = [\s\S]*?end\(false\)/, "pointercancel reverts (no commit)");
});
check("the old stuck-drag pattern is gone (no React-state drag moving on any pointermove)", () => {
  assert.doesNotMatch(editor, /onPointerMove=\{\(e\) => \{\s*if \(!drag\) return;/);
  assert.doesNotMatch(editor, /setDrag\(/);
});
check("elements block native drag and touch panning (the usual pointercancel sources)", () => {
  assert.match(editor, /onDragStart=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(editor, /touchAction: "none"/);
  assert.match(editor, /draggable=\{false\}/);
});
check("a new element is selected, not dragged (addElement starts no gesture)", () => {
  const add = editor.slice(editor.indexOf("function addElement("), editor.indexOf("function addPage("));
  assert.match(add, /setSelectedId\(e\.id\)/);
  assert.doesNotMatch(add, /begin\(|startGesture|setPointerCapture/);
  assert.match(add, /updatePage\(/, "inserted on the active page");
});
check("drops are written to the element's own page, one history step", () => {
  assert.match(editor, /onMove=\{\(elementId, dx, dy\) =>\s*updateElementOnPage\(p\.id, elementId/);
  assert.match(editor, /function updateElementOnPage\([\s\S]*?commit\(pages\.map/);
});
check("clicking a page activates it; activation is not report-content history", () => {
  assert.match(editor, /onPointerDownCapture=\{\(e\) => \{ if \(e\.button === 0 && !active\) onActivate\(\); \}\}/);
  assert.match(editor, /onActivate=\{\(\) => setActivePageId\(p\.id\)\}/);
  assert.match(editor, /active=\{p\.id === activePage\?\.id\}/);
  const activate = editor.match(/onActivate=\{\(\) => ([^}]*)\}/)![1];
  assert.doesNotMatch(activate, /commit/);
});
check("pointerdown only selects; panels open on click (no canvas rescale mid-drag)", () => {
  assert.match(editor, /onSelect\(\);\s*if \(!element\.locked\) drag\.begin\(e\);/);
  assert.match(editor, /if \(!opts\?\.openInspector\) return;/);
});

console.log(`\n${passed} checks passed.`);
