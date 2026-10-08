/**
 * Content Sets (2026-10-07) — render checks on REAL components:
 *   - the report viewer's text block escapes reading data (the security
 *     fix): a public-decoder visitor's name / birth place can't inject HTML;
 *   - Content Sets status pill (Active / Draft only — never completeness);
 *   - source guards on the library/editor (owner-locked columns, no
 *     Coverage/Language/Focus, no system checkboxes, description limit,
 *     no-fallback banner, phone sheet for "Used in", sticky Save).
 * Browser-level responsive/flow QA (320–1440) runs in the local harness.
 *
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/test-content-sets-ui.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportDesignViewer } from "../src/components/energetic-decoder/report-design-viewer";
import { StatusPill } from "../src/components/energetic-decoder/content-sets-visuals";
import type { ReportDesign } from "../src/types/report-blocks";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const design = {
  id: "d1", subAccountId: "sa", agencyId: "ag", title: "T", createdAt: null, updatedAt: null,
  pages: [{ id: "p1", title: "Page 1", visibleIf: null, blocks: [{ id: "b1", type: "text", html: "Hello {{full_name}} from {{birth_place}}\nSecond line", align: "left", widthPct: 100 }] }],
} as unknown as ReportDesign;
const evil = { name: `<img src=x onerror="alert(1)">Eve`, birthPlace: `<script>alert(2)</script>Austin` };

console.log("\nSecurity: report text blocks");
check("visitor-typed name / birth place render as text, never as HTML", () => {
  const html = renderToStaticMarkup(createElement(ReportDesignViewer, { design, readingInput: evil as never, ruleInput: {} }));
  assert.ok(!html.includes("<img src=x"), "no injected <img>");
  assert.ok(!html.includes("<script>alert"), "no injected <script>");
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Eve"), "shown escaped");
  assert.ok(html.includes("&lt;script&gt;alert(2)&lt;/script&gt;Austin"));
});
check("line breaks preserved (whitespace-pre-wrap), same as the PDF's plain-text rendering", () => {
  const html = renderToStaticMarkup(createElement(ReportDesignViewer, { design, readingInput: { name: "Ana Ruiz", birthPlace: "Lima" } as never, ruleInput: {} }));
  assert.ok(html.includes("whitespace-pre-wrap"));
  assert.ok(html.includes("Hello Ana Ruiz from Lima\nSecond line"));
});

console.log("\nContent Sets UI");
check("status is Active or Draft only", () => {
  assert.ok(renderToStaticMarkup(createElement(StatusPill, { status: "active" })).includes(">Active<"));
  assert.ok(renderToStaticMarkup(createElement(StatusPill, { status: "draft" })).includes(">Draft<"));
});
const lib = readFileSync("src/components/energetic-decoder/content-sets-library.tsx", "utf8");
const ed = readFileSync("src/components/energetic-decoder/content-set-editor.tsx", "utf8");
const entryRoute = readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/content-sets/[setId]/entries/[entryId]/route.ts", "utf8");
check("library columns are Name · Status · Updated · Actions — no Coverage / Language / Focus / Systems", () => {
  assert.match(lib, /label="Name"[\s\S]*label="Status"[\s\S]*label="Updated"[\s\S]*>Actions</);
  for (const gone of ["Coverage", "Language", "Focus", "Systems"]) assert.ok(!lib.includes(`>${gone}<`), gone);
});
check("create dialog: name, optional description (≤100, counter), Start from Default/Blank/Existing — no system checkboxes", () => {
  assert.ok(lib.includes("CONTENT_SET_DESCRIPTION_MAX"));
  for (const o of ['title: "Default"', 'title: "Blank"', 'title: "Existing Content Set"']) assert.ok(lib.includes(o), o);
  assert.ok(!/type="checkbox"/.test(lib));
});
check("'Used in' is a popover on desktop and a bottom sheet on phones, listing real report designs", () => {
  assert.ok(lib.includes('side="bottom"') && lib.includes("<PopoverContent") && lib.includes("/usage"));
});
check("Default can't be deleted, renamed or drafted from the menu", () => {
  assert.match(lib, /!set\.isDefault && \(\s*<>\s*<DropdownMenuSeparator \/>/);
});
check("editor: optional blank content, lightweight helper, custom term only on custom sets, sticky Save", () => {
  assert.match(ed, /!detail\.isDefault && entrySchema\.allowCustomLabel !== false/);
  assert.ok(ed.includes("data-default-reference") && !/data-default-reference[^>]*onClick/.test(ed));
  assert.ok(ed.includes("Content added here can be used to interpret chart results and populate generated reading reports wherever this property appears."));
  assert.ok(!ed.includes("Every field is required") && !ed.includes("Required in the Default set."));
  assert.ok(/data-save-bar/.test(ed) && ed.includes("sticky bottom-0"));
});
check("editor has no reset control or reset action and desktop panes scroll independently", () => {
  assert.ok(!ed.includes("Reset section") && !ed.includes("confirmReset") && !ed.includes("resetContentEntry"));
  assert.ok(!entryRoute.includes("export async function DELETE") && !entryRoute.includes("resetContentEntry"));
  assert.ok(ed.includes("lg:h-full lg:overflow-y-auto"));
  assert.ok(ed.includes("lg:h-[clamp(32rem,calc(100dvh-18rem),52rem)]"));
});
check("large categories preserve canonical identity and provide placement filters", () => {
  assert.ok(ed.includes('id === "astro:planetSign"'));
  assert.ok(ed.includes('id === "astro:planetHouse"'));
  assert.ok(ed.includes('aria-label="Filter by body or point"'));
  assert.ok(ed.includes('aria-label={isPlanetSign ? "Filter by zodiac sign" : "Filter by house"}'));
  assert.ok(ed.includes("canonicalLabel"));
});
check("Updated shows only the date — no byline (no email, name or initials)", () => {
  assert.ok(!/updatedByEmail\s*&&|\bby \{set\./.test(lib), "no byline rendered");
  assert.ok(lib.includes("data-updated-date"));
});
check("no per-set icon field: Default = sparkles, custom sets = the generic content-set icon", () => {
  const vis = readFileSync("src/components/energetic-decoder/content-sets-visuals.tsx", "utf8");
  assert.match(vis, /if \(set\.isDefault\) return \{ icon: Sparkles/);
  assert.match(vis, /return \{ icon: Layers,/);
  const model = readFileSync("src/lib/energetic-decoder/content-sets.ts", "utf8") + readFileSync("src/lib/server/content-set-service.ts", "utf8");
  assert.ok(!/\bicon\b/i.test(model), "no icon in the data model or service");
});
check("visual tokens: Content Sets use their own white-card scope, never the page's lavender momentum cards", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.indexOf(".content-sets-scope {") > css.indexOf(".momentum-scope {"), "scope comes after momentum-scope");
  assert.match(css, /\.content-sets-scope \{[\s\S]*?--card: #ffffff;/);
  for (const src of [lib, ed]) assert.ok(src.includes("CS_SCOPE"));
});
check("no AI controls ship in the Content editor (AI stays optional / gate-able later)", () => {
  assert.ok(!/\bAI\b|Gemini|OpenRouter/.test(ed + lib));
});

console.log(`\n${passed} checks passed.`);
