#!/usr/bin/env node
/**
 * New Builder chrome — Visual Direction 2 contract (2026-10-24). Static
 * source checks; no server, no Firebase.
 *
 * Run: node scripts/check-builder-chrome.mjs
 */
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
const src = (f) => readFileSync(f, "utf8");
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\s*\}/g, "");
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

const shell = src("src/components/pages-funnels/puck/editor-shell.tsx");
const theme = src("src/components/pages-funnels/puck/magnetix-theme.css");
const blocks = src("src/components/pages-funnels/puck/blocks-panel.tsx");
const settings = src("src/components/pages-funnels/puck/settings-panel.tsx");
const style = code("src/components/pages-funnels/puck/style-field.tsx");

check("header: no migration-era 'New Builder' badge", !/New Builder/.test(code("src/components/pages-funnels/puck/editor-shell.tsx")));
check("header: page type label + shared status pill (Published/Draft/Unpublished changes)", shell.includes("pageTypeLabel") && shell.includes("<StatusPill tone=\"success\"") && shell.includes("tone=\"warning\""));
check("header: Puck's inner header border/divider removed inside the Magnetix row", /\[class\*="_PuckHeader_"\] \{\s*border-bottom: 0;/.test(theme) && theme.includes("border-left: 0;"));
check("tablets open with the Blocks sidebar collapsed; laptops keep both panels", shell.includes("leftSideBarVisible: false") && shell.includes("window.innerWidth < 1000") && shell.includes("ui={initialUi}"));
check("canvas: quiet selection + slot tints (≤ 5% plum)", /--puck-color-selection-bg: color-mix\(\s*in srgb,\s*var\(--primary\) 5%/.test(theme) && /--puck-slot-color-bg: color-mix\(in srgb, var\(--primary\) 3%/.test(theme));
check("canvas: empty page shows a start hint", theme.includes('content: "Drag a block from the left to start building"'));
check("fields: Puck labels/inputs on the Magnetix type scale", theme.includes("--puck-field-label-font-size: 0.8125rem") && theme.includes("--puck-field-font-size: 0.875rem"));
check("library: compact tiles, fluid grid, token type", blocks.includes("min-h-10") && blocks.includes("minmax(6.75rem,1fr)") && !/text-\[\d+px\]/.test(blocks));
check("settings: component label (not internal key) in the panel header", settings.includes("config.components[type]?.label"));
check("settings: no spec references in staff copy", !/master spec/.test(code("src/components/pages-funnels/puck/settings-panel.tsx")));
check("settings: page root explains where page settings live (dead title field hidden)", settings.includes("Select a block on the canvas to edit it") && src("src/components/pages-funnels/puck/config.tsx").includes("root: { fields: {} }"));
check("style + form fields use the system Select (no native <select>)", !/<select\b/.test(style) && !/<select\b/.test(code("src/components/pages-funnels/puck/form-field.tsx")) && style.includes("<OptionSelect"));
check("style rows wrap instead of clipping", style.includes("flex flex-wrap items-center justify-between"));
check("load states use the shared EmptyState", src("src/components/pages-funnels/page-load-state.tsx").includes("<EmptyState") && src("src/app/(builder)/sa/[subAccountId]/pages-funnels/[pageId]/new-builder/preview/page.tsx").includes("<EmptyState"));

console.log(`\nBuilder chrome contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
