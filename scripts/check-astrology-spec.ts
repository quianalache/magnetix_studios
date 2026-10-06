/**
 * Astrology specification checks (2026-10 Chart Designs → Astrology) —
 * pure, no emulator. Protects the one Astrology model the browser wheel,
 * the PDF wheel and the aspect grid all draw from: geometry, planet layout
 * (true vs display positions), aspect styling, the 18 design colors with
 * their fallbacks and ready-made palettes (contrast-checked), first-save
 * pinning, and the bug fixes that rode along.
 *
 * Run: pnpm exec tsx scripts/check-astrology-spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AstrologyChart, AstrologyBodyName } from "../src/lib/energetics/astrology";
import { SIGNS } from "../src/lib/energetics/gate-data";
import {
  ASPECT_META,
  ASPECT_TYPES,
  ASTRO_DEFAULT_MARGIN,
  ASTRO_EDITOR_MARGIN,
  ASTRO_RINGS,
  ASTRO_TYPE,
  ASTRO_VIEW,
  ASTROLOGY_COLOR_FIELDS,
  ASTROLOGY_OPTIONAL_COLOR_FIELDS,
  ASTROLOGY_PALETTES,
  HOUSE_SYSTEM_LABEL,
  PLANET_GLYPH,
  PLANET_GLYPH_PATHS,
  PLANET_MIN_SEPARATION,
  ZODIAC_GLYPH,
  astroPolar,
  astroScreenAngle,
  astroViewBox,
  buildAstrologyModel,
  builtInAstrologyKey,
  glyphText,
  resolveAstrologyColors,
  resolvedAstrologyFieldValue,
  spreadPlanetAngles,
  type BuiltInAstrologyKey,
} from "../src/lib/energetics/astrology-spec";
import { ZODIAC_ELEMENT } from "../src/lib/energetics/mandala-spec";
import { CHART_DESIGN_PRESETS } from "../src/lib/energetics/chart-design-presets";
import { CHART_DESIGN_STARTERS, starterMemberId, starterSetId } from "../src/lib/energetics/chart-design-starters";
import { CHART_DESIGN_SYSTEM_FIELDS } from "../src/lib/energetics/chart-design-fields";
import { CHART_DESIGN_SECTIONS } from "../src/components/energetic-decoder/chart-design-controls";
import { buildEditorSavePayload, initChartDesignEditorState, isEditorDirty, setEditorField } from "../src/lib/energetics/chart-design-editor-state";
import type { ChartDesign } from "../src/types/chart-design";
import type { ChartDesignSetWithMembers } from "../src/types/chart-design-set";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// ── helpers ──
function lum(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const norm = (a: number) => ((a % 360) + 360) % 360;
const angDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

function chartWith(asc: number, mc: number, bodies: [AstrologyBodyName, number][], aspects: AstrologyChart["aspects"] = []): AstrologyChart {
  const angle = (lon: number) => ({ longitude: norm(lon), sign: SIGNS[Math.floor(norm(lon) / 30)], degInSign: norm(lon) % 30 });
  return {
    angles: { ascendant: angle(asc), descendant: angle(asc + 180), mc: angle(mc), ic: angle(mc + 180) },
    houses: { system: "equal", requestedSystem: "equal", fallbackReason: null, cusps: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, ...angle(asc + i * 30) })) },
    placements: bodies.map(([body, lon]) => ({ body, ...angle(lon), house: 1, retrograde: false })),
    aspects,
  } as AstrologyChart;
}

const SA = "saX";
const STARTER_PLANETS: Record<string, string> = Object.fromEntries(CHART_DESIGN_PRESETS.astrology.map((p) => [p.name, p.values.wheelAccentColor as string]));
const STARTER_BACKGROUNDS: Record<string, string> = Object.fromEntries(CHART_DESIGN_PRESETS.astrology.map((p) => [p.name, p.values.backgroundColor as string]));

console.log("\nGeometry");
check("Ascendant at 9 o'clock, longitude counterclockwise; aspect circle = half the wheel", () => {
  const p = astroPolar(astroScreenAngle(100, 100), 50);
  assert.ok(p.x < 100 && Math.abs(p.y - 100) < 1e-9);
  const q = astroPolar(astroScreenAngle(190, 100), 50); // 90° later: 6 o'clock
  assert.ok(Math.abs(q.x - 100) < 1e-9 && q.y > 100);
  assert.equal(ASTRO_RINGS.aspect, ASTRO_RINGS.outer / 2);
});
check("12 element-colored signs, 348 degree ticks (sign boundaries are dividers), 12 cusps, 4 axes at the calculated angles", () => {
  const colors = resolveAstrologyColors({ isDefault: true });
  const m = buildAstrologyModel(chartWith(123.4, 33.3, [["sun", 10]]), colors);
  assert.equal(m.signs.length, 12);
  for (const s of m.signs) assert.equal(s.fill, colors.elements[ZODIAC_ELEMENT[s.sign]]);
  assert.equal((m.tickPath.match(/M/g) ?? []).length, 348);
  assert.equal(m.cusps.length, 12);
  assert.deepEqual(m.axes.map((a) => a.key), ["AC", "DC", "MC", "IC"]);
  const mc = m.axes.find((a) => a.key === "MC")!;
  const want = astroPolar(astroScreenAngle(33.3, 123.4), ASTRO_RINGS.axisOuter);
  assert.ok(Math.abs(mc.x2 - want.x) < 1e-6 && Math.abs(mc.y2 - want.y) < 1e-6);
});
check("angle labels always stay inside the view, even with no margin (editor), for every orientation", () => {
  for (let asc = 0; asc < 360; asc += 5) {
    for (const mcOff of [60, 90, 120]) {
      const m = buildAstrologyModel(chartWith(asc, asc - 180 + mcOff, []), resolveAstrologyColors(null));
      for (const a of m.axes) {
        const hw = ASTRO_TYPE.angleLabel * 0.72, hh = ASTRO_TYPE.angleLabel * 0.42;
        assert.ok(a.label.x - hw >= 0 && a.label.x + hw <= ASTRO_VIEW && a.label.y - hh >= 0 && a.label.y + hh <= ASTRO_VIEW, `asc ${asc} ${a.key}`);
      }
    }
  }
});
check("preview fill: no margin in the editor → the wheel spans 92% of the canvas; other surfaces keep a small margin", () => {
  assert.equal(ASTRO_EDITOR_MARGIN, 0);
  assert.equal((2 * ASTRO_RINGS.outer) / (ASTRO_VIEW + 2 * ASTRO_EDITOR_MARGIN), 0.92);
  assert.ok((2 * ASTRO_RINGS.outer) / (ASTRO_VIEW + 2 * ASTRO_DEFAULT_MARGIN) > 0.88);
  assert.equal(astroViewBox(0), "0 0 200 200");
  const controls = readFileSync("src/components/energetic-decoder/chart-design-controls.tsx", "utf8");
  assert.ok(controls.includes('margin={size === "large" ? ASTRO_EDITOR_MARGIN : undefined}'));
  // the wrapper no longer has percentage padding (it resolved against the PARENT's width, shrinking the chart in wide cards)
  const wheel = readFileSync("src/components/energetic-decoder/astrology-wheel-chart.tsx", "utf8");
  assert.ok(!/padding:\s*"\d+%"/.test(wheel));
  // the Reading page's own 520px wrapper is unchanged in this pass
  assert.ok(readFileSync("src/components/energetic-decoder/reading-summary.tsx", "utf8").includes('className="mx-auto w-full max-w-[520px]"'));
});

console.log("\nPlanets: true vs display positions");
check("a stellium spreads both ways around its own center (no forward cascade), keeping the minimum gap", () => {
  const trueA = [100, 101, 102, 103, 104];
  const d = spreadPlanetAngles(trueA);
  const sorted = [...d].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= PLANET_MIN_SEPARATION - 1e-6);
  const meanT = trueA.reduce((a, b) => a + b) / 5, meanD = d.reduce((a, b) => a + b) / 5;
  assert.ok(Math.abs(meanT - meanD) < 1e-6, "centered on the cluster");
  assert.ok(sorted[0] < 100 && sorted[4] > 104, "spread both directions");
  assert.ok(Math.max(...d.map((x, i) => Math.abs(x - trueA[i]))) <= 2 * PLANET_MIN_SEPARATION + 1e-6);
});
check("isolated planets don't move; a cluster across the 0°/360° seam spreads correctly", () => {
  assert.deepEqual(spreadPlanetAngles([10, 80, 200]), [10, 80, 200]);
  const d = spreadPlanetAngles([358, 1, 3]);
  for (const [i, t] of [358, 1, 3].entries()) assert.ok(angDiff(d[i], t) < 2 * PLANET_MIN_SEPARATION);
  const s = d.map(norm).sort((a, b) => a - b);
  const gaps = [s[1] - s[0], s[2] - s[1], s[0] + 360 - s[2]];
  assert.ok(gaps.every((g) => g >= PLANET_MIN_SEPARATION - 1e-6));
});
check("the true-degree tick sits at the TRUE degree; aspect lines start at TRUE degrees, not the moved glyphs", () => {
  const chart = chartWith(0, 270, [["sun", 100], ["moon", 101], ["mercury", 102], ["pluto", 222]], [{ bodyA: "sun", bodyB: "pluto", type: "Trine", orb: 2 }]);
  const m = buildAstrologyModel(chart, resolveAstrologyColors(null));
  for (const p of m.planets) {
    const lon = chart.placements.find((x) => x.body === p.body)!.longitude;
    const t = astroPolar(astroScreenAngle(lon, 0), ASTRO_RINGS.trueTickOuter);
    assert.ok(Math.abs(p.tick.x1 - t.x) < 1e-6 && Math.abs(p.tick.y1 - t.y) < 1e-6, p.body);
  }
  assert.ok(m.planets.find((p) => p.body === "sun")!.connector, "a moved glyph gets a connector back to its true degree");
  const asp = m.aspects[0];
  const a = astroPolar(astroScreenAngle(100, 0), ASTRO_RINGS.aspect);
  assert.ok(Math.abs(asp.x1 - a.x) < 1e-6 && Math.abs(asp.y1 - a.y) < 1e-6);
});

console.log("\nAspects");
check("aspect meta matches the calculation's angles and orbs (astrology.ts ASPECT_DEFS — unchanged)", () => {
  const src = readFileSync("src/lib/energetics/astrology.ts", "utf8");
  for (const t of ASPECT_TYPES) {
    const m = src.match(new RegExp(`\\{ type: "${t}", angle: (\\d+), orb: (\\d+) \\}`));
    assert.ok(m, t);
    assert.equal(ASPECT_META[t].angle, Number(m![1]));
    assert.equal(ASPECT_META[t].orb, Number(m![2]));
  }
});
check("tighter aspects draw bolder; per-aspect design colors; conjunctions aren't drawn; opposition dashed", () => {
  const colors = resolveAstrologyColors({ astroTrineColor: "#123456", astroOppositionColor: "#654321" });
  const chart = chartWith(0, 270, [["sun", 0], ["moon", 121], ["mars", 182], ["venus", 2], ["northNode", 50], ["southNode", 230]], [
    { bodyA: "sun", bodyB: "moon", type: "Trine", orb: 1 },
    { bodyA: "sun", bodyB: "mars", type: "Opposition", orb: 2 },
    { bodyA: "sun", bodyB: "venus", type: "Conjunction", orb: 2 },
    { bodyA: "northNode", bodyB: "southNode", type: "Opposition", orb: 0 },
  ]);
  const m = buildAstrologyModel(chart, colors);
  assert.deepEqual(m.aspects.map((a) => a.type), ["Trine", "Opposition", "Opposition"]);
  assert.equal(m.aspects[0].color, "#123456");
  assert.equal(m.aspects[1].color, "#654321");
  assert.ok(m.aspects[1].dash);
  const tight = buildAstrologyModel(chartWith(0, 270, [["sun", 0], ["moon", 120]], [{ bodyA: "sun", bodyB: "moon", type: "Trine", orb: 0.2 }]), colors).aspects[0];
  const wide = buildAstrologyModel(chartWith(0, 270, [["sun", 0], ["moon", 127]], [{ bodyA: "sun", bodyB: "moon", type: "Trine", orb: 7.5 }]), colors).aspects[0];
  assert.ok(tight.width > wide.width && tight.opacity > wide.opacity);
});
check("the North Node ↔ South Node opposition is drawn: true-degree ends, Opposition color + dash, standard (not boldest) weight", () => {
  const colors = resolveAstrologyColors({ astroOppositionColor: "#654321" });
  const chart = chartWith(0, 270, [["northNode", 50], ["southNode", 230]], [{ bodyA: "northNode", bodyB: "southNode", type: "Opposition", orb: 0 }]);
  const m = buildAstrologyModel(chart, colors);
  assert.equal(m.aspects.length, 1);
  const node = m.aspects[0];
  assert.equal(node.type, "Opposition");
  assert.equal(node.color, "#654321");
  assert.equal(node.dash, ASPECT_META.Opposition.dash);
  const a = astroPolar(astroScreenAngle(50, 0), ASTRO_RINGS.aspect), b = astroPolar(astroScreenAngle(230, 0), ASTRO_RINGS.aspect);
  assert.ok(Math.abs(node.x1 - a.x) < 1e-6 && Math.abs(node.y1 - a.y) < 1e-6 && Math.abs(node.x2 - b.x) < 1e-6 && Math.abs(node.y2 - b.y) < 1e-6);
  // exact by definition, so it takes the middle of the opposition weights — an exact real opposition still draws bolder
  const exact = buildAstrologyModel(chartWith(0, 270, [["sun", 10], ["moon", 190]], [{ bodyA: "sun", bodyB: "moon", type: "Opposition", orb: 0 }]), colors).aspects[0];
  assert.ok(node.width < exact.width && node.opacity < exact.opacity);
  // browser and PDF both draw every model aspect (no per-renderer filtering)
  for (const f of ["src/components/energetic-decoder/astrology-wheel-chart.tsx", "src/lib/energetics/reading-pdf-document.tsx"]) {
    assert.ok(readFileSync(f, "utf8").includes("m.aspects.map((a, i) =>"), f);
  }
});
check("aspect grid parity: the grid takes its glyphs + colors from the spec (no local color table)", () => {
  const grid = readFileSync("src/components/energetic-decoder/aspect-grid.tsx", "utf8");
  assert.ok(grid.includes("c.aspects[asp.type]"));
  assert.ok(grid.includes("ASPECT_META[asp.type].glyph"));
  assert.ok(!/const ASPECT_COLOR\b/.test(grid) && !/#14795a|#b3241f/.test(grid));
  assert.ok(readFileSync("src/components/energetic-decoder/reading-summary.tsx", "utf8").includes("<AspectGrid placements={chart.placements} aspects={chart.aspects} colors={resolveAstrologyColors(astroDesign)} />"));
});

console.log("\nDesign colors: fields, fallbacks, ready-made palettes");
check("18 controls in 4 sections, each field once, matching the allow-list; no calculation setting", () => {
  const fields = CHART_DESIGN_SECTIONS.astrology.flatMap((s) => s.fields);
  assert.equal(fields.length, 18);
  assert.equal(new Set(fields).size, 18);
  assert.deepEqual([...fields].sort(), [...CHART_DESIGN_SYSTEM_FIELDS.astrology].sort());
  assert.deepEqual([...ASTROLOGY_OPTIONAL_COLOR_FIELDS, "wheelAccentColor", "backgroundColor"].sort(), [...fields].sort());
  assert.ok(!fields.includes("houseSystem"));
});
check("ready-made identity is stable ids / the default flag — never the name or colors", () => {
  for (const { key, name } of CHART_DESIGN_STARTERS) {
    const setId = starterSetId(SA, key);
    assert.equal(builtInAstrologyKey({ subAccountId: SA, ownerSetId: setId }), key);
    assert.equal(builtInAstrologyKey({ subAccountId: SA, id: starterMemberId(setId, "astrology") }), key);
    // a custom design that merely copies the name + colors stays custom
    assert.equal(builtInAstrologyKey({ subAccountId: SA, ownerSetId: "cds_custom", id: "x", ...{ name }, wheelAccentColor: STARTER_PLANETS[name] } as object as never), null);
  }
  assert.equal(builtInAstrologyKey({ isDefault: true }), "default");
  assert.equal(builtInAstrologyKey({ subAccountId: SA, ownerSetId: "cds_600JRBXdFnEqhrnW1Qyd", isDefault: false }), null);
});
check("every one of the 16 fields: saved value → ready-made palette → legacy look", () => {
  const legacy = resolveAstrologyColors({ wheelAccentColor: "#5E2574", backgroundColor: "#ffffff" });
  const midnight = resolveAstrologyColors({ subAccountId: SA, ownerSetId: starterSetId(SA, "midnight"), wheelAccentColor: "#818cf8", backgroundColor: "#0f1115" });
  for (const field of ASTROLOGY_OPTIONAL_COLOR_FIELDS) {
    const saved = resolveAstrologyColors({ subAccountId: SA, ownerSetId: starterSetId(SA, "midnight"), [field]: "#010203" });
    assert.equal(resolvedAstrologyFieldValue(saved, field), "#010203", `${field}: saved wins`);
    assert.ok(resolvedAstrologyFieldValue(midnight, field), `${field}: palette`);
    assert.ok(resolvedAstrologyFieldValue(legacy, field), `${field}: legacy`);
  }
  assert.equal(midnight.housesBackground, ASTROLOGY_PALETTES.midnight.housesBackground);
});
check("a custom design (e.g. Test) keeps today's look: the old constants, angles in its planet color, aspect circle on its background", () => {
  const test = resolveAstrologyColors({ subAccountId: SA, ownerSetId: "cds_600JRBXdFnEqhrnW1Qyd", isDefault: false, wheelAccentColor: "#5E2574", backgroundColor: "#ffffff" });
  assert.equal(test.housesBackground, "#faf9f7"); // the old HOUSE_RING_FILL
  assert.equal(test.wheelLines, "#a1a1aa"); // the old WHEEL_LINE
  assert.equal(test.houseNumbers, "#3f3f46"); // the old WHEEL_TEXT
  assert.equal(test.angles, "#5E2574");
  assert.equal(test.aspectsBackground, "#ffffff");
  assert.deepEqual(test.aspects, { Conjunction: "#3f3f46", Sextile: "#0d9488", Square: "#dc2626", Trine: "#2563eb", Opposition: "#dc2626" }); // the old wheel colors
  // a dark custom design gets dark counterparts, not the light house ring
  const dark = resolveAstrologyColors({ backgroundColor: "#111111", wheelAccentColor: "#ffffff" });
  assert.equal(dark.housesBackground, "#111111");
});
check("design-less charts use one planet color everywhere (browser and both PDFs used to differ)", () => {
  assert.equal(resolveAstrologyColors(null).planets, "#3f3f46");
  for (const f of ["src/lib/energetics/reading-pdf-document.tsx", "src/lib/energetics/report-design-pdf-document.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(src.includes("<AstrologyWheelPdf chart={astrology} colors={resolveAstrologyColors(astroDesign)} />"), f);
    assert.ok(!src.includes("wheelAccentColor={astroDesign?.wheelAccentColor"), f);
  }
});
check("ready-made palettes are contrast-checked (symbols on every band, ink on its ground, distinct aspects)", () => {
  const names: Record<BuiltInAstrologyKey, string> = { default: "Default", "magnetix-violet": "Magnetix Violet", monochrome: "Monochrome", "warm-sunset": "Warm Sunset", midnight: "Midnight" };
  for (const [key, p] of Object.entries(ASTROLOGY_PALETTES) as [BuiltInAstrologyKey, (typeof ASTROLOGY_PALETTES)["default"]][]) {
    const bg = key === "default" ? "#ffffff" : STARTER_BACKGROUNDS[names[key]];
    const planets = key === "default" ? "#5E2574" : STARTER_PLANETS[names[key]];
    for (const e of ["fire", "earth", "air", "water"] as const) assert.ok(contrast(p.zodiacSymbols, p.elements[e]) >= 3, `${key}: symbols on ${e} ${contrast(p.zodiacSymbols, p.elements[e]).toFixed(2)}`);
    assert.ok(contrast(p.houseNumbers, p.housesBackground) >= 4.5, `${key}: house numbers`);
    assert.ok(contrast(planets, p.housesBackground) >= 4.5, `${key}: planets`);
    assert.ok(contrast(p.angles, bg) >= 4.5, `${key}: angles`);
    assert.ok(contrast(p.wheelLines, p.housesBackground) >= 2, `${key}: wheel lines visible`);
    assert.ok(contrast(p.houseLines, p.housesBackground) >= 1.25, `${key}: house lines visible`);
    for (const t of ASPECT_TYPES) assert.ok(contrast(p.aspects[t], p.aspectsBackground) >= 3, `${key}: ${t}`);
    const drawn = (["Sextile", "Square", "Trine"] as const).map((t) => p.aspects[t]);
    assert.equal(new Set(drawn).size, 3, `${key}: sextile/square/trine distinguishable`);
  }
  // Midnight is dark throughout — no near-white fills
  const m = ASTROLOGY_PALETTES.midnight;
  for (const c of [m.housesBackground, m.aspectsBackground]) assert.ok(lum(c) < 0.05, "Midnight fills are dark");
  assert.ok(lum(m.houseNumbers) > 0.5 && lum(m.angles) > 0.5, "Midnight ink is light");
});
check("presets and new-design defaults carry exactly the palette values (no drift between the three copies)", () => {
  const names: Record<string, Exclude<BuiltInAstrologyKey, "default">> = { "Magnetix Violet": "magnetix-violet", Monochrome: "monochrome", "Warm Sunset": "warm-sunset", Midnight: "midnight" };
  for (const preset of CHART_DESIGN_PRESETS.astrology) {
    const r = resolveAstrologyColors(preset.values);
    const p = resolveAstrologyColors({ subAccountId: SA, ownerSetId: starterSetId(SA, names[preset.name]) });
    for (const f of ASTROLOGY_OPTIONAL_COLOR_FIELDS) assert.equal(resolvedAstrologyFieldValue(r, f), resolvedAstrologyFieldValue(p, f), `${preset.name}/${f}`);
  }
  const records = readFileSync("src/lib/server/chart-design-records.ts", "utf8");
  const def = resolveAstrologyColors({ isDefault: true });
  for (const f of ASTROLOGY_OPTIONAL_COLOR_FIELDS) assert.ok(records.includes(`${f}: "${resolvedAstrologyFieldValue(def, f)}"`), f);
});

console.log("\nEditor: no write-on-read, first save pins");
function astroSet(astro: Partial<ChartDesign>): ChartDesignSetWithMembers {
  const rec = (system: string, extra: object) => ({ id: `r-${system}`, subAccountId: SA, ownerSetId: "cds_custom", system, name: "D", backgroundColor: "#ffffff", ...extra }) as unknown as ChartDesign;
  return {
    id: "cds_custom", subAccountId: SA, agencyId: "ag", name: "Custom", isDefault: false,
    members: { humanDesign: "r-humanDesign", mandala: "r-mandala", astrology: "r-astrology", frequency: null }, createdAt: null, updatedAt: null,
    designs: { humanDesign: rec("humanDesign", {}), mandala: rec("mandala", {}), astrology: rec("astrology", { wheelAccentColor: "#5E2574", ...astro }) },
  } as unknown as ChartDesignSetWithMembers;
}
check("a design without the fields shows its fallback colors, loads clean, and never saves on load", () => {
  const s = initChartDesignEditorState(astroSet({}));
  assert.equal(s.values.astrology.astroHousesBackgroundColor, "#faf9f7");
  assert.equal(s.values.astrology.astroAngleColor, "#5E2574");
  assert.equal(isEditorDirty(s), false);
  assert.equal(buildEditorSavePayload(s), null);
});
check("the first Astrology save pins every displayed Astrology color; saved fields aren't re-sent", () => {
  let s = initChartDesignEditorState(astroSet({ astroTrineColor: "#111111" }));
  s = setEditorField(s, "astrology", "astroFireColor", "#ff0000");
  const p = buildEditorSavePayload(s)!.astrology!;
  assert.equal(p.astroFireColor, "#ff0000");
  for (const f of ASTROLOGY_OPTIONAL_COLOR_FIELDS) if (f !== "astroTrineColor") assert.ok(f in p, f);
  assert.equal("astroTrineColor" in p, false);
  assert.equal("houseSystem" in p, false);
});

console.log("\nGlyphs, labels, renderers");
check("no color-emoji path: every browser glyph is text-presentation; the PDF uses vector glyphs only", () => {
  assert.equal(glyphText(ZODIAC_GLYPH.Aries), "♈︎");
  assert.equal(Object.keys(PLANET_GLYPH_PATHS).length, Object.keys(PLANET_GLYPH).length);
  const wheel = readFileSync("src/components/energetic-decoder/astrology-wheel-chart.tsx", "utf8");
  assert.ok(wheel.includes("{glyphText(s.glyph)}") && wheel.includes("{glyphText(p.glyph)}"));
  assert.ok(!/[☉-♓⚷⚸]/.test(wheel), "no raw glyph characters in the browser wheel");
  const pdf = readFileSync("src/lib/energetics/reading-pdf-document.tsx", "utf8");
  const fn = pdf.slice(pdf.indexOf("export function AstrologyWheelPdf("), pdf.indexOf("// ── Frequency / Gene Keys"));
  assert.ok(fn.includes("ASTRO_ZODIAC_GLYPH_PATHS[s.sign]") && fn.includes("PLANET_GLYPH_PATHS[p.body]"));
  assert.ok(!/[☉-♓⚷⚸℞]/.test(fn), "no Unicode glyph text reaches the Helvetica PDF");
  for (const d of Object.values(PLANET_GLYPH_PATHS)) for (const n of (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)) assert.ok(n >= 0 && n <= 10);
});
check("browser and PDF draw the same model, and the PDF honors the design's background", () => {
  const wheel = readFileSync("src/components/energetic-decoder/astrology-wheel-chart.tsx", "utf8");
  const pdf = readFileSync("src/lib/energetics/reading-pdf-document.tsx", "utf8");
  const fn = pdf.slice(pdf.indexOf("export function AstrologyWheelPdf("), pdf.indexOf("// ── Frequency / Gene Keys"));
  assert.ok(wheel.includes("buildAstrologyModel(chart, c)") && fn.includes("buildAstrologyModel(chart, c)"));
  assert.ok(fn.includes("fill={c.background}"));
  assert.ok(!fn.includes('fill="#ffffff"') && !fn.includes('fill="#fff"'));
});
check("Equal houses are labeled Equal (not Whole Sign)", () => {
  assert.deepEqual(HOUSE_SYSTEM_LABEL, { placidus: "Placidus", whole: "Whole Sign", equal: "Equal" });
  const summary = readFileSync("src/components/energetic-decoder/reading-summary.tsx", "utf8");
  assert.ok(summary.includes("HOUSE_SYSTEM_LABEL[chart.houses.system]"));
  assert.ok(!summary.includes('=== "placidus" ? "Placidus" : "Whole Sign"'));
});
check("Human Design and Mandala renderers are untouched by this pass", () => {
  // The Mandala spec pins its own protected surfaces; here: nothing Astrology leaks into them.
  for (const f of ["src/components/energetic-decoder/mandala-chart.tsx", "src/components/energetic-decoder/human-design-chart.tsx"]) {
    assert.ok(!readFileSync(f, "utf8").includes("astrology-spec"), f);
  }
  assert.equal(ASTROLOGY_COLOR_FIELDS.elements.fire, "astroFireColor");
});

console.log(`\n${passed} checks passed.`);
