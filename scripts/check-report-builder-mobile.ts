/**
 * Report Builder phone stack (2026-10-10) — the CRM bottom tab bar owns the
 * very bottom; the Report Builder contextual toolbar sits directly above it;
 * sheets open above both. Source/CSS guards; real geometry is verified by
 * browser QA (local + live) at 320/360/390/430 and 820.
 *
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-report-builder-mobile.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const css = fs.readFileSync("src/app/globals.css", "utf8");
const tabBar = fs.readFileSync("src/components/pwa/bottom-tab-bar.tsx", "utf8");
const editor = fs.readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8");

check("CRM tab bar height is one shared variable (used by the bar itself)", () => {
  assert.match(css, /--crm-mobile-tab-bar-h: 3\.5rem;/);
  assert.match(tabBar, /h-\[var\(--crm-mobile-tab-bar-h\)\]/);
  assert.match(tabBar, /fixed inset-x-0 bottom-0 z-40 border-t[^"]*pb-\[env\(safe-area-inset-bottom\)\][^"]*md:hidden/, "CRM bar unchanged: bottom, border, safe area, phones only");
});
check("toolbar offset = CRM bar height + its 1px border + safe-area inset + gap", () => {
  assert.match(css, /--rb-toolbar-bottom: calc\(var\(--crm-mobile-tab-bar-h\) \+ 1px \+ env\(safe-area-inset-bottom, 0px\) \+ 0\.5rem\);/);
  assert.match(editor, /data-rb-mobile-toolbar className="fixed inset-x-3 bottom-\[var\(--rb-toolbar-bottom\)\] z-40 grid h-\[var\(--rb-toolbar-h\)\]/);
  assert.doesNotMatch(editor, /aria-label="Responsive builder tools" className="fixed inset-x-3 bottom-3/, "old collision position gone");
});
check("sheets start above the toolbar + CRM stack and never extend under it", () => {
  assert.match(css, /--rb-sheet-bottom: calc\(var\(--rb-toolbar-bottom\) \+ var\(--rb-toolbar-h\) \+ 0\.5rem\);/);
  assert.match(editor, /data-mobile-sheet=\{mobileDrawer\} className=\{`fixed inset-x-0 bottom-\[var\(--rb-sheet-bottom\)\] z-40 max-h-\[calc\(100dvh-var\(--rb-sheet-bottom\)-4\.5rem\)\]/);
  assert.doesNotMatch(editor, /fixed inset-x-3 bottom-20 z-40/, "old bottom-20 sheet gone");
});
check("all five sheets use that one sheet (Elements, Pages, Layers, Element, Page)", () => {
  for (const k of ['"elements"', '"pages"', '"layers"', '"element"', '"page"']) assert.ok(editor.includes(`{ key: ${k},`), `toolbar ${k}`);
  assert.match(editor, /mobileDrawer === "pages" && renderPagesPanel\(\)/);
  assert.doesNotMatch(editor, /setPageOverviewOpen\(true\); setMobileDrawer\(null\); \}\} className="rounded-xl px-1 py-2/, "phone Pages no longer opens the full-screen overview that covered the CRM bar");
});
check("workspace reserves room for the toolbar (the dashboard main already reserves the CRM bar)", () => {
  assert.match(editor, /report-builder-shell[^"]*max-md:pb-\[calc\(var\(--rb-toolbar-h\)\+1rem\)\]/);
  const layout = fs.readFileSync("src/app/(dashboard)/layout.tsx", "utf8");
  assert.match(layout, /hasTabBar && "pb-24 md:pb-6"/);
});
check("Elements sheet: the real tool set, same handlers as the desktop rail (no fabricated tools)", () => {
  assert.match(editor, /const renderToolGrid = \(\) =>[\s\S]*?\{ key: "Templates"[\s\S]*?\{ key: "Branding"[\s\S]*?\.\.\.tools\.map\(/);
  assert.match(editor, /onClick=\{\(\) => openTool\(key\)\}/);
  assert.match(editor, /mobileDrawer === "elements" && <>\{renderToolGrid\(\)\}/);
  assert.match(editor, /const renderToolRail = \(\) =>/, "desktop rail still rendered by its own renderer");
});
check("sheets have a clear close (X with an accessible name) and a title", () => {
  assert.match(editor, /aria-label="Close" onClick=\{\(\) => setMobileDrawer\(null\)\}/);
});
check("phone page strip is the existing navigator (thumbnails + Add Page); desktop unchanged", () => {
  assert.match(editor, /className="flex h-\[64px\][^"]*md:hidden lg:flex" data-page-navigator/);
  assert.match(editor, /className=\{`hidden shrink-0 rounded-lg px-2\.5 py-2 text-xs font-semibold lg:inline-flex/, "Page settings button stays desktop-only");
});
check("tablet (md–lg) drawers and desktop untouched", () => {
  assert.match(editor, /md:inset-y-3 md:bottom-3 md:top-3 md:max-h-none/);
  assert.match(editor, /lg:grid-cols-\[92px_minmax\(0,1fr\)\]/);
});
console.log(`\n${passed} checks passed.`);
