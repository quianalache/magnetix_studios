/**
 * Regression test for the practitioner Reading → Astrology page (2026-10
 * redesign). Renders the REAL AstrologyReadingView with real calculated
 * charts and checks the page structure the owner approved:
 *   [Natal Chart | Key Placements rail] → Houses → Planetary Placements →
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
import { execSync } from "node:child_process";
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
check("sections in the approved order: [Natal Chart | Key Placements], Houses, Planetary Placements, Aspect Grid, Aspects", () => {
  const order = [...html.matchAll(/data-astro-section="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["natal-chart", "key-placements", "houses", "placements", "aspect-grid", "aspects"]);
});
check("top section: chart and Key Placements side by side on wide content (container query), stacked chart-first when narrow", () => {
  const top = html.slice(html.indexOf("data-astro-top"), html.indexOf('data-astro-section="houses"'));
  assert.ok(top.includes("@container/astrotop"));
  assert.ok(top.includes("grid grid-cols-1 items-start gap-6 @min-[880px]/astrotop:grid-cols-[minmax(0,1fr)_clamp(300px,31%,360px)]"), "two columns from 880px of content, one column below");
  assert.ok(top.indexOf('data-astro-section="natal-chart"') < top.indexOf('data-astro-section="key-placements"'), "chart first (left / top when stacked)");
  assert.ok(!top.includes("overflow-y-auto") && !top.includes("max-h-"), "no inner scrolling in the rail");
});
check("Key Placements: Sun, Moon, Rising, Midheaven, North Node, South Node, Chiron with sign, degree and house from the reading", () => {
  const withChiron = render({ ...chart, placements: [...chart.placements, { body: "chiron", longitude: 95.5, sign: "Cancer", degInSign: 5.5, house: 9, retrograde: false }] });
  assert.deepEqual([...withChiron.matchAll(/data-key-placement="([^"]+)"/g)].map((m) => m[1]), ["sun", "moon", "rising", "midheaven", "northNode", "southNode", "chiron"]);
  const ch = withChiron.slice(withChiron.indexOf('data-key-placement="chiron"'));
  assert.ok(ch.includes("Cancer 5.5°") && ch.includes("House 9"));
  const nn = chart.placements.find((p) => p.body === "northNode")!, sn = chart.placements.find((p) => p.body === "southNode")!;
  const nb = html.slice(html.indexOf('data-key-placement="northNode"'), html.indexOf('data-key-placement="southNode"'));
  assert.ok(nb.includes(`${nn.sign} ${nn.degInSign.toFixed(1)}°`) && nb.includes(`House ${nn.house}`));
  const sb = html.slice(html.indexOf('data-key-placement="southNode"'));
  assert.ok(sb.includes(`${sn.sign} ${sn.degInSign.toFixed(1)}°`) && sb.includes(`House ${sn.house}`));
  // without a Chiron placement the rail simply has six rows
  assert.deepEqual([...html.matchAll(/data-key-placement="([^"]+)"/g)].map((m) => m[1]), ["sun", "moon", "rising", "midheaven", "northNode", "southNode"]);
  assert.ok(!html.slice(html.indexOf('data-astro-section="key-placements"'), html.indexOf('data-astro-section="houses"')).includes("interpretation"), "no interpretation text in the rail");
  const sun = chart.placements.find((p) => p.body === "sun")!;
  const block = html.slice(html.indexOf('data-key-placement="sun"'), html.indexOf('data-key-placement="moon"'));
  assert.ok(block.includes(`${sun.sign} ${sun.degInSign.toFixed(1)}°`) && block.includes(`House ${sun.house}`));
  const rising = html.slice(html.indexOf('data-key-placement="rising"'), html.indexOf('data-key-placement="midheaven"'));
  assert.ok(rising.includes(`${chart.angles.ascendant.sign} ${chart.angles.ascendant.degInSign.toFixed(1)}°`) && rising.includes("House 1"));
  const mc = html.slice(html.indexOf('data-key-placement="midheaven"'), html.indexOf('data-key-placement="northNode"'));
  assert.ok(mc.includes(`${chart.angles.mc.sign} ${chart.angles.mc.degInSign.toFixed(1)}°`) && mc.includes("House 10"), "Placidus: MC on the 10th cusp");
  // Whole Sign: the MC's house is read off the cusps (it is often not the 10th)
  const whole = calculateAstrologyChart({ ...birth, houseSystem: "whole" });
  const wh = render(whole);
  const cusp = whole.houses.cusps.findIndex((c, i) => { const s = c.longitude, e = whole.houses.cusps[(i + 1) % 12].longitude, l = whole.angles.mc.longitude; return s <= e ? l >= s && l < e : l >= s || l < e; });
  const wmc = wh.slice(wh.indexOf('data-key-placement="midheaven"'), wh.indexOf('data-key-placement="northNode"'));
  assert.ok(wmc.includes(`House ${whole.houses.cusps[cusp].house}<`), "Whole Sign MC house");
});
check("no Chart Details or Angles boxes under the chart (removed 2026-10); AC/DC/MC/IC stay as the chart's own axes and labels; Rising + MC stay in Key Placements", () => {
  const card = html.slice(html.indexOf('data-astro-section="natal-chart"'), html.indexOf('data-astro-section="key-placements"'));
  assert.ok(!/data-chart-detail|Chart Details|>Angles</.test(html), "boxes removed");
  assert.ok(!html.includes("Western · Tropical"), "no house-system line on this page");
  for (const key of ["AC", "DC", "MC", "IC"]) assert.ok(card.includes(`data-astro-angle-label="${key}"`), `${key} label in the wheel`);
  assert.ok(card.includes('aria-label="Astrology natal chart wheel"'), "natal chart present");
  assert.ok(html.includes('data-key-placement="rising"') && html.includes('data-key-placement="midheaven"'));
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
check("larger chart: fills its card, capped by screen height (100dvh − 158px ≥ 420px), drawn with no outer margin; still below the old 840px; the public pages keep AstrologySummary", () => {
  assert.ok(/data-astro-wheel-wrap="[^"]*" class="mx-auto w-full max-w-\[max\(420px,calc\(100dvh_-_158px\)\)\]"/.test(html), "wrapper: card width, height-capped");
  assert.ok(!html.includes("min(640px"), "no 640px cap any more");
  const card = html.slice(html.indexOf('data-astro-section="natal-chart"'), html.indexOf('data-astro-section="key-placements"'));
  assert.ok(card.includes('viewBox="0 0 200 200"'), "no outer margin: the wheel spans 92% of its box");
  // (the actual fit — the whole card under the app header at 1280×800 / 1440×900 / 1536×864 — is measured in the browser QA; see the release record)
  assert.ok(!html.includes("max-w-[840px]"));
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
});
check("Houses heading shows the reading's actual house system: (Placidus), (Equal), (Whole Sign), and the polar fallback's effective system", () => {
  const heading = (h: string) => h.slice(h.indexOf('id="astro-houses"'), h.indexOf("</h2>", h.indexOf('id="astro-houses"'))).replace(/<[^>]+>/g, "").replace(/^[^>]*>/, "").trim();
  assert.equal(heading(html), "Houses (Placidus)");
  assert.equal(heading(render(calculateAstrologyChart({ ...birth, houseSystem: "equal" }))), "Houses (Equal)");
  assert.equal(heading(render(calculateAstrologyChart({ ...birth, houseSystem: "whole" }))), "Houses (Whole Sign)");
  // Placidus is undefined near the poles; the calculation falls back to Whole Sign, and the heading shows what was actually used
  const polar = calculateAstrologyChart({ ...birth, lat: 78.2, lng: 15.6 });
  assert.equal(polar.houses.requestedSystem, "placidus");
  assert.equal(polar.houses.system, "whole");
  assert.equal(heading(render(polar)), "Houses (Whole Sign)");
  // not hard-coded: the label comes from the reading through the shared HOUSE_SYSTEM_LABEL
  const view = readFileSync("src/components/energetic-decoder/astrology-reading-view.tsx", "utf8");
  assert.ok(view.includes("HOUSE_SYSTEM_LABEL[chart.houses.system]") && !/Houses \(Placidus\)/.test(view));
});
check("everything below the top section is exactly as released (bc36ff6 = 2488aa7) apart from the house system in the Houses heading: Houses cards, Planetary Placements, Aspect Grid, Aspects", () => {
  const lower = (src: string) => src.slice(src.indexOf("{/* 3. Houses */}"));
  const now = readFileSync("src/components/energetic-decoder/astrology-reading-view.tsx", "utf8");
  const released = execSync("git show bc36ff6:src/components/energetic-decoder/astrology-reading-view.tsx", { encoding: "utf8" });
  // the one approved change below the top: the house system beside the Houses heading
  const housesTitle = 'title={<>Houses <span className="font-normal text-muted-foreground">({houseSystem})</span></>}';
  assert.ok(lower(now).includes(housesTitle));
  // and (2026-10-07) Planetary Placements switches to its four columns on the table's own width (container
  // query at 600px) instead of the viewport's md, fixing a page overflow on tablets beside the sidebar.
  // Undo exactly that mapping and the rest must still be byte-identical to the release.
  const placementsNote = "        {/* The four-column table switches on at 600px of the TABLE's own width (container query), not the viewport's md — beside the sidebar on a tablet the card is only ~450px wide, and the four columns' minimums overflowed the page. */}\n";
  assert.ok(lower(now).includes(placementsNote));
  const undone = lower(now)
    .replace(placementsNote, "")
    .replace('className="@container/placements text-sm"', 'className="text-sm"')
    .replaceAll("@min-[600px]/placements:", "md:");
  assert.equal(undone.replace(housesTitle, 'title="Houses"'), lower(released));
});
check("Planetary Placements: four columns from 600px of the table's own width; every column still rendered", () => {
  const html = render({ ...chart, content });
  assert.ok(html.includes("@container/placements") && html.includes("@min-[600px]/placements:grid-cols-[minmax(130px,170px)_minmax(150px,190px)_72px_minmax(0,1fr)]"));
  assert.ok(!/placements[\s\S]{0,400}\bmd:grid\b/.test(html.slice(html.indexOf('aria-label="Planetary placements"'), html.indexOf('aria-label="Planetary placements"') + 600)));
  for (const p of chart.placements) assert.ok(html.includes(`data-placement="${p.body}"`), p.body);
  assert.ok(html.includes("Sagittarius interpretation") || html.includes("interpretation"), "interpretations still render");
});

console.log(`\n${passed} checks passed.`);
