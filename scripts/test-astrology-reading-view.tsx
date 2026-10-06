/**
 * Regression test for the practitioner Reading → Astrology page (2026-10
 * redesign). Renders the REAL AstrologyReadingView with real calculated
 * charts and checks the page structure the owner approved:
 *   Key Placements → Natal Chart → Houses → Planetary Placements →
 *   Aspect Grid → Aspects (grid and list stacked full-width, never side by
 *   side; the list shows every aspect and never scrolls inside its card).
 * Also: nothing is lost from the old layout (all houses / placements /
 * aspects, Descendant + IC), the selected Chart Design still reaches the
 * wheel and the grid, the large wheel replaces the old 520px cap on this
 * page only, and the public pages keep their own layout.
 *
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/test-astrology-reading-view.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateAstrologyChart } from "../src/lib/energetics/astrology";
import { AstrologyReadingView } from "../src/components/energetic-decoder/astrology-reading-view";
import { ASTROLOGY_PALETTES } from "../src/lib/energetics/astrology-spec";
import { starterSetId } from "../src/lib/energetics/chart-design-starters";
import type { ChartDesign } from "../src/types/chart-design";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const birth = { date: "1990-06-15", time: "14:30", timeZone: "America/New_York", lat: 40.7128, lng: -74.006 };
const chart = calculateAstrologyChart(birth);
const content = {
  signs: Object.fromEntries(["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"].map((s) => [s, `${s} interpretation`])),
  houses: {},
  aspectTypes: { Conjunction: "fuse", Sextile: "ease", Square: "tension", Trine: "flow", Opposition: "pull" },
};
const render = (c: object, design: ChartDesign | null = null) => renderToStaticMarkup(createElement(AstrologyReadingView, { chart: c as never, astroDesign: design }));
const html = render({ ...chart, content });
const count = (re: RegExp, s = html) => (s.match(re) ?? []).length;

console.log("\nReading → Astrology page structure");
check("sections in the approved order: Key Placements, Natal Chart, Houses, Planetary Placements, Aspect Grid, Aspects", () => {
  const order = [...html.matchAll(/data-astro-section="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["key-placements", "natal-chart", "houses", "placements", "aspect-grid", "aspects"]);
});
check("Key Placements: Sun, Moon, Rising, Midheaven with sign, degree and house from the reading", () => {
  assert.deepEqual([...html.matchAll(/data-key-placement="([^"]+)"/g)].map((m) => m[1]), ["sun", "moon", "rising", "midheaven"]);
  const sun = chart.placements.find((p) => p.body === "sun")!;
  const block = html.slice(html.indexOf('data-key-placement="sun"'), html.indexOf('data-key-placement="moon"'));
  assert.ok(block.includes(`${sun.sign} ${sun.degInSign.toFixed(1)}°`) && block.includes(`House ${sun.house}`));
  const rising = html.slice(html.indexOf('data-key-placement="rising"'), html.indexOf('data-key-placement="midheaven"'));
  assert.ok(rising.includes(`${chart.angles.ascendant.sign} ${chart.angles.ascendant.degInSign.toFixed(1)}°`) && rising.includes("House 1"));
  const mc = html.slice(html.indexOf('data-key-placement="midheaven"'), html.indexOf('data-astro-section="natal-chart"'));
  assert.ok(mc.includes(`${chart.angles.mc.sign} ${chart.angles.mc.degInSign.toFixed(1)}°`) && mc.includes("House 10"), "Placidus: MC on the 10th cusp");
  // Whole Sign: the MC's house is read off the cusps (it is often not the 10th)
  const whole = calculateAstrologyChart({ ...birth, houseSystem: "whole" });
  const wh = render(whole);
  const cusp = whole.houses.cusps.findIndex((c, i) => { const s = c.longitude, e = whole.houses.cusps[(i + 1) % 12].longitude, l = whole.angles.mc.longitude; return s <= e ? l >= s && l < e : l >= s || l < e; });
  const wmc = wh.slice(wh.indexOf('data-key-placement="midheaven"'), wh.indexOf('data-astro-section="natal-chart"'));
  assert.ok(wmc.includes(`House ${whole.houses.cusps[cusp].house}<`), "Whole Sign MC house");
});
check("Descendant and IC stay on the page (Chart Details → Angles), with the house system", () => {
  const angles = html.slice(html.indexOf('data-chart-detail="angles"'), html.indexOf('data-chart-detail="design"'));
  for (const [abbr, a] of [["AC", chart.angles.ascendant], ["DC", chart.angles.descendant], ["MC", chart.angles.mc], ["IC", chart.angles.ic]] as const) {
    assert.ok(angles.includes(`data-angle="${abbr}"`) && angles.includes(`${a.sign} ${a.degInSign.toFixed(1)}°`), abbr);
  }
  assert.ok(html.includes("Western · Tropical · Placidus Houses"));
});
check("all 12 houses, every placement (incl. nodes, Lilith, retrograde marks), every aspect — nothing truncated", () => {
  assert.equal(count(/data-house="/g), 12);
  assert.equal(count(/data-placement="/g), chart.placements.length);
  for (const body of ["North Node", "South Node", "Lilith"]) assert.ok(html.includes(body), body);
  assert.equal(count(/title="Retrograde"/g), chart.placements.filter((p) => p.retrograde).length);
  assert.equal(count(/data-aspect-row="/g), chart.aspects.length);
  assert.ok(html.includes(`Aspects (${chart.aspects.length})`));
  assert.ok(!/more aspects/.test(html), "no '+N more' truncation");
  assert.ok(html.includes("Aries interpretation") || html.includes("interpretation"), "sign interpretations kept");
});
check("Aspect Grid and Aspects are separate full-width cards, grid first; the list grows naturally (no fixed height, no inner scroll)", () => {
  const grid = html.indexOf('data-astro-section="aspect-grid"'), list = html.indexOf('data-astro-section="aspects"');
  assert.ok(grid > 0 && list > grid);
  const listCard = html.slice(list - 400, html.indexOf("</section>", list));
  assert.ok(!/max-h-|overflow-y-(auto|scroll)|overflow-auto|h-\[\d/.test(listCard), "no height cap or internal scroll on the Aspects card");
  // the two cards are siblings in the single-column page stack — no side-by-side grid wraps them
  const view = readFileSync("src/components/energetic-decoder/astrology-reading-view.tsx", "utf8");
  const between = view.slice(view.indexOf("{/* 5. Aspect Grid"), view.indexOf("{/* 6. Aspects"));
  assert.ok(!/grid-cols|flex-row|lg:flex/.test(between));
  assert.ok(html.includes('data-aspect-grid-size="large"'));
});
check("large natal chart on this page (840px wrapper, no 520px cap); the public pages keep AstrologySummary", () => {
  assert.ok(/data-astro-wheel-wrap="[^"]*" class="mx-auto w-full max-w-\[840px\]"/.test(html), "840px wheel wrapper");
  assert.ok(!html.includes("max-w-[520px]"));
  const workspace = readFileSync("src/components/energetic-decoder/human-design-reading-workspace.tsx", "utf8");
  assert.ok(workspace.includes("<AstrologyReadingView chart={reading.astrology} astroDesign={astroDesign} />") && !workspace.includes("<AstrologySummary"));
  for (const f of ["src/app/decoder/[saId]/report/[readingId]/page.tsx", "src/app/decoder/[saId]/public-decoder-form.tsx"]) assert.ok(readFileSync(f, "utf8").includes("<AstrologySummary"), f);
  assert.ok(readFileSync("src/components/energetic-decoder/reading-summary.tsx", "utf8").includes('className="mx-auto w-full max-w-[520px]"'), "public layout unchanged");
});
check("the selected Chart Design reaches the wheel, the grid and the aspect list (Midnight)", () => {
  const midnight = { id: "x", subAccountId: "sa", ownerSetId: starterSetId("sa", "midnight"), name: "Midnight", backgroundColor: "#0f1115", wheelAccentColor: "#818cf8" } as unknown as ChartDesign;
  const m = render({ ...chart, content }, midnight);
  assert.ok(m.includes("background:#0f1115"), "wheel background");
  assert.ok(m.includes(`fill="${ASTROLOGY_PALETTES.midnight.housesBackground}"`), "house ring");
  assert.ok(m.includes(`color:${ASTROLOGY_PALETTES.midnight.aspects.Trine}`) || m.includes(`color:${ASTROLOGY_PALETTES.midnight.aspects.Square}`), "aspect colors in grid/list");
  assert.ok(m.includes(">Midnight<"), "Chart Design detail");
});
check("Equal-house readings say Equal; the house-system fallback note is shown when present", () => {
  const eq = render(calculateAstrologyChart({ ...birth, houseSystem: "equal" }));
  assert.ok(eq.includes("Western · Tropical · Equal Houses") && !eq.includes("Whole Sign"));
  const polar = render(calculateAstrologyChart({ ...birth, lat: 78.2, lng: 15.6 }));
  assert.ok(polar.includes("Placidus is undefined"), "fallback reason shown");
});

console.log(`\n${passed} checks passed.`);
