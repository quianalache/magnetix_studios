/**
 * Mandala specification checks (2026-10 redesign) — pure, no emulator.
 * Protects the one Mandala definition both the browser MandalaChart and
 * the PDF MandalaPdf draw from: the verified King Wen hexagrams, the
 * standard-astrology orientation, all 64 gate placements, the canonical
 * Human Design Quarters, the zodiac elements, the element-color fallback,
 * the activation model and the center BodyGraph geometry.
 *
 * Run: pnpm exec tsx scripts/check-mandala-spec.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { GATE_WHEEL_ORDER, WHEEL_START_LONGITUDE_DEG, SIGNS } from "../src/lib/energetics/gate-data";
import { GATE_CENTER } from "../src/lib/energetics/human-design-data";
import {
  GATE_ARC_DEG,
  KING_WEN_HEXAGRAMS,
  MANDALA_BODYGRAPH,
  MANDALA_ELEMENT_FIELDS,
  MANDALA_ELEMENT_PALETTES,
  MANDALA_QUARTERS,
  MANDALA_RINGS,
  MANDALA_SIGNS,
  ZODIAC_ELEMENT,
  buildMandalaModel,
  fieldInk,
  inkOn,
  quarterFills,
  resolveMandalaColors,
  MANDALA_COLOR_FIELDS,
  MANDALA_OPTIONAL_COLOR_FIELDS,
  MANDALA_QUARTER_KEYS,
  MANDALA_CENTER_KEYS,
  MANDALA_CENTER_PALETTES,
  gateIndex,
  gateSpan,
  gateStartLongitude,
  glowColor,
  hexagramSegments,
  mandalaBodygraphBox,
  planetSymbolPositions,
  quarterGates,
  resolveMandalaElementColors,
  svgAngleForLongitude,
  tangentialTextRotation,
} from "../src/lib/energetics/mandala-spec";
import { CHART_DESIGN_PRESETS } from "../src/lib/energetics/chart-design-presets";
import { CHART_DESIGN_SYSTEM_FIELDS } from "../src/lib/energetics/chart-design-fields";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const norm = (a: number) => ((a % 360) + 360) % 360;
const angDiff = (a: number, b: number) => {
  const d = norm(a - b);
  return d > 180 ? d - 360 : d;
};

console.log("\nI Ching hexagrams (King Wen)");
check("the table is the verified one (pinned) — 64 distinct six-line patterns", () => {
  const rows = Array.from({ length: 64 }, (_, i) => `${i + 1}:${KING_WEN_HEXAGRAMS[i + 1]}`).join(",");
  // Pinned 2026-10-06 after the three-way verification described in mandala-spec.ts. Never edit without re-verifying all 64.
  assert.equal(createHash("sha256").update(rows).digest("hex").slice(0, 16), "0bc3ed1c19d97658");
  for (let n = 1; n <= 64; n++) assert.match(KING_WEN_HEXAGRAMS[n], /^[01]{6}$/, `hexagram ${n}`);
  assert.equal(new Set(Object.values(KING_WEN_HEXAGRAMS)).size, 64);
});
check("King Wen pairs: 28 are each other upside down, the 4 symmetric pairs are complements", () => {
  let inverse = 0, complement = 0;
  for (let k = 1; k < 64; k += 2) {
    const a = KING_WEN_HEXAGRAMS[k], b = KING_WEN_HEXAGRAMS[k + 1];
    const rev = [...a].reverse().join("");
    const comp = [...a].map((c) => (c === "1" ? "0" : "1")).join("");
    if (a !== rev && b === rev) inverse++;
    else if (a === rev && b === comp) complement++;
    else assert.fail(`pair ${k}/${k + 1} breaks the King Wen pairing`);
  }
  assert.deepEqual([inverse, complement], [28, 4]);
});
check("known hexagrams by their trigrams (bottom → top)", () => {
  const H: Record<string, string> = { heaven: "111", lake: "110", fire: "101", thunder: "100", wind: "011", water: "010", mountain: "001", earth: "000" };
  const hex = (lower: string, upper: string) => H[lower] + H[upper];
  assert.equal(KING_WEN_HEXAGRAMS[1], hex("heaven", "heaven"));
  assert.equal(KING_WEN_HEXAGRAMS[2], hex("earth", "earth"));
  assert.equal(KING_WEN_HEXAGRAMS[3], hex("thunder", "water")); // 水雷屯
  assert.equal(KING_WEN_HEXAGRAMS[11], hex("heaven", "earth")); // 地天泰
  assert.equal(KING_WEN_HEXAGRAMS[12], hex("earth", "heaven")); // 天地否
  assert.equal(KING_WEN_HEXAGRAMS[29], hex("water", "water"));
  assert.equal(KING_WEN_HEXAGRAMS[30], hex("fire", "fire"));
  assert.equal(KING_WEN_HEXAGRAMS[51], hex("thunder", "thunder"));
  assert.equal(KING_WEN_HEXAGRAMS[57], hex("wind", "wind"));
  assert.equal(KING_WEN_HEXAGRAMS[58], hex("lake", "lake"));
  assert.equal(KING_WEN_HEXAGRAMS[52], hex("mountain", "mountain"));
  assert.equal(KING_WEN_HEXAGRAMS[63], hex("fire", "water")); // 水火既濟
  assert.equal(KING_WEN_HEXAGRAMS[64], hex("water", "fire")); // 火水未濟
});
check("every gate draws its own hexagram: yang = 1 segment, yin = 2, line 1 nearest the center", () => {
  for (const gate of GATE_WHEEL_ORDER) {
    const segs = hexagramSegments(gateIndex(gate), gate);
    const lines = KING_WEN_HEXAGRAMS[gate];
    for (let k = 1; k <= 6; k++) assert.equal(segs.filter((s) => s.line === k).length, lines[k - 1] === "1" ? 1 : 2, `gate ${gate} line ${k}`);
    const r = (s: (typeof segs)[number]) => Math.hypot((s.x1 + s.x2) / 2 - 100, (s.y1 + s.y2) / 2 - 100);
    const r1 = r(segs.find((s) => s.line === 1)!), r6 = r(segs.find((s) => s.line === 6)!);
    assert.ok(r1 < r6, `gate ${gate}: line 1 must be innermost`);
    assert.ok(r1 > MANDALA_RINGS.gateNumber && r6 < MANDALA_RINGS.field, `gate ${gate}: hexagram sits between the number and the field edge`);
  }
});

console.log("\nOrientation (presentation only)");
check("the calculation constants are untouched (gate order + wheel anchor)", () => {
  assert.equal(WHEEL_START_LONGITUDE_DEG, 302);
  assert.equal(createHash("sha256").update(GATE_WHEEL_ORDER.join(",")).digest("hex").slice(0, 16), createHash("sha256").update("41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60").digest("hex").slice(0, 16));
});
check("0° Aries at 9 o'clock, 90° (Cancer) at 6, 180° (Libra) at 3, 270° (Capricorn) at 12 — counterclockwise", () => {
  assert.equal(svgAngleForLongitude(0), 180);
  assert.equal(svgAngleForLongitude(90), 90);
  assert.equal(svgAngleForLongitude(180), 0);
  assert.equal(svgAngleForLongitude(270), -90);
  // counterclockwise on screen = SVG angle decreases as longitude increases
  assert.ok(angDiff(svgAngleForLongitude(10), svgAngleForLongitude(0)) < 0);
});
check("all 64 gates: contiguous 5.625° spans, in wheel order counterclockwise, each at its calculated longitude", () => {
  let covered = 0;
  for (let i = 0; i < 64; i++) {
    const s = gateSpan(i);
    assert.ok(Math.abs(s.end - s.start - GATE_ARC_DEG) < 1e-9, `gate ${GATE_WHEEL_ORDER[i]} width`);
    covered += s.end - s.start;
    // the next gate (higher longitude) starts where this one ends, counterclockwise
    const next = gateSpan((i + 1) % 64);
    assert.ok(Math.abs(angDiff(next.end, s.start)) < 1e-9, `gate ${GATE_WHEEL_ORDER[i]} → ${GATE_WHEEL_ORDER[(i + 1) % 64]} adjacency`);
    // its middle is the screen angle of its calculated middle longitude
    assert.ok(Math.abs(angDiff(s.mid, svgAngleForLongitude(gateStartLongitude(i) + GATE_ARC_DEG / 2))) < 1e-9);
  }
  assert.ok(Math.abs(covered - 360) < 1e-6);
  assert.equal(gateStartLongitude(gateIndex(41)), 302);
});
check("landmarks match the reference: 25 at 9 o'clock, 10 | 11 straddle 12 o'clock, 46 at 3 o'clock", () => {
  assert.ok(Math.abs(angDiff(gateSpan(gateIndex(25)).mid, 180)) < GATE_ARC_DEG);
  const g10 = gateSpan(gateIndex(10)), g11 = gateSpan(gateIndex(11));
  assert.ok(g10.start < -90 + 1e-9 ? true : norm(-90 - g10.start) < GATE_ARC_DEG, "12 o'clock falls in gate 10");
  assert.ok(Math.abs(angDiff(g10.end, g11.start)) < 1e-9 && angDiff(g11.mid, g10.mid) > 0, "11 lies clockwise of 10");
  assert.ok(Math.abs(angDiff(gateSpan(gateIndex(46)).mid, 0)) < 2 * GATE_ARC_DEG);
});
check("signs sit at their astrological positions and contain the right gates", () => {
  assert.deepEqual(MANDALA_SIGNS.map((s) => s.sign), [...SIGNS]);
  const signOf = (gate: number) => SIGNS[Math.floor(norm(gateStartLongitude(gateIndex(gate)) + 0.01) / 30)];
  assert.equal(signOf(41), "Aquarius"); // 2° Aquarius
  assert.equal(signOf(17), "Aries");
  assert.equal(signOf(1), "Scorpio");
  assert.equal(signOf(10), "Sagittarius"); // 28.25° Sagittarius → crosses 0° Capricorn at 12 o'clock
  assert.equal(signOf(58), "Capricorn");
  for (const { sign, span } of MANDALA_SIGNS) {
    const lon0 = SIGNS.indexOf(sign) * 30;
    assert.ok(Math.abs(angDiff(span.end, svgAngleForLongitude(lon0))) < 1e-9, `${sign} begins at ${lon0}°`);
    assert.ok(Math.abs(span.end - span.start - 30) < 1e-9);
  }
});
check("labels read upright: tops outward in the upper half, turned in the lower half", () => {
  assert.equal(tangentialTextRotation(-90), 0); // 12 o'clock: upright
  assert.equal(tangentialTextRotation(90), 0); // 6 o'clock: upright (turned)
  assert.equal(tangentialTextRotation(180), 270); // 9 o'clock: reads bottom → top
});

console.log("\nHuman Design Quarters");
check("canonical quarters: 1 Initiation from 13, 2 Civilization from 2, 3 Duality from 7, 4 Mutation from 1 — 16 gates each", () => {
  assert.deepEqual(MANDALA_QUARTERS.map((q) => q.label), ["1 – Initiation", "2 – Civilization", "3 – Duality", "4 – Mutation"]);
  const expected = {
    Initiation: [13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24],
    Civilization: [2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33],
    Duality: [7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44],
    Mutation: [1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19],
  };
  for (const q of MANDALA_QUARTERS) assert.deepEqual(quarterGates(q), expected[q.name], q.name);
  assert.equal(new Set(MANDALA_QUARTERS.flatMap(quarterGates)).size, 64);
  assert.ok(!MANDALA_QUARTERS.some((q) => q.label.includes("Spirit")));
});

console.log("\nZodiac elements + colors");
check("each sign has its astrological element", () => {
  const byElement = (e: string) => SIGNS.filter((s) => ZODIAC_ELEMENT[s] === e);
  assert.deepEqual(byElement("fire"), ["Aries", "Leo", "Sagittarius"]);
  assert.deepEqual(byElement("earth"), ["Taurus", "Virgo", "Capricorn"]);
  assert.deepEqual(byElement("air"), ["Gemini", "Libra", "Aquarius"]);
  assert.deepEqual(byElement("water"), ["Cancer", "Scorpio", "Pisces"]);
});
check("four independent Chart Design fields, saved through the normal allow-list; presets carry their own palettes", () => {
  for (const f of Object.values(MANDALA_ELEMENT_FIELDS)) assert.ok((CHART_DESIGN_SYSTEM_FIELDS.mandala as readonly string[]).includes(f), f);
  assert.ok((CHART_DESIGN_SYSTEM_FIELDS.mandala as readonly string[]).includes("mandalaZodiacColor"), "the legacy field is kept");
  const v = CHART_DESIGN_PRESETS.mandala.find((p) => p.name === "Midnight")!.values as Record<string, string>;
  assert.equal(v.mandalaWaterColor, MANDALA_ELEMENT_PALETTES.midnight.water);
});
check("fallback for designs saved before the element fields: read-time only, built-in palettes by their zodiac color, else derived", () => {
  assert.deepEqual(resolveMandalaElementColors({ mandalaZodiacColor: "#8b5cf6" }), MANDALA_ELEMENT_PALETTES.default);
  assert.deepEqual(resolveMandalaElementColors({ mandalaZodiacColor: "#a78bfa" }), MANDALA_ELEMENT_PALETTES.midnight);
  assert.deepEqual(resolveMandalaElementColors(null), MANDALA_ELEMENT_PALETTES.default);
  const custom = resolveMandalaElementColors({ mandalaZodiacColor: "#0e7490" });
  assert.equal(new Set(Object.values(custom)).size, 4, "four distinct derived colors");
  // explicit fields always win, independently
  const mixed = resolveMandalaElementColors({ mandalaZodiacColor: "#8b5cf6", mandalaFireColor: "#ff0000", mandalaWaterColor: "#0000ff" });
  assert.deepEqual(mixed, { ...MANDALA_ELEMENT_PALETTES.default, fire: "#ff0000", water: "#0000ff" });
  // the service never writes them on read (no silent production backfill)
  const svc = readFileSync("src/lib/server/chart-design-service.ts", "utf8");
  assert.ok(!/mandala(Fire|Earth|Air|Water)Color/.test(svc), "chart-design-service must not backfill the element fields");
});
check("built-in designs saved before the element fields resolve by identity (never by name or color)", () => {
  const SA = "xvnedVCmQpEvHrcPhEDI";
  // shaped like production's records (ids, ownerSetId, isDefault, legacy zodiac color, no element fields)
  const starter = (key: string, zodiac: string) => ({ id: `cd_cds_starter_${SA}_${key}_mandala`, subAccountId: SA, ownerSetId: `cds_starter_${SA}_${key}`, isDefault: false, mandalaZodiacColor: zodiac });
  // 1. the workspace Default
  assert.deepEqual(resolveMandalaElementColors({ id: "CqKUt6HdL06G0HYCpD3z", subAccountId: SA, ownerSetId: "cds_kBWb00bC7OSPWEG9lXY8", isDefault: true, mandalaZodiacColor: "#8b5cf6" }), MANDALA_ELEMENT_PALETTES.default);
  // 2. Magnetix Violet, even though its legacy zodiac color is Default's
  assert.deepEqual(resolveMandalaElementColors(starter("magnetix-violet", "#8b5cf6")), MANDALA_ELEMENT_PALETTES.magnetixViolet);
  // 3. the other ready-made designs
  assert.deepEqual(resolveMandalaElementColors(starter("monochrome", "#52525b")), MANDALA_ELEMENT_PALETTES.monochrome);
  assert.deepEqual(resolveMandalaElementColors(starter("warm-sunset", "#ea580c")), MANDALA_ELEMENT_PALETTES.warmSunset);
  assert.deepEqual(resolveMandalaElementColors(starter("midnight", "#a78bfa")), MANDALA_ELEMENT_PALETTES.midnight);
  // identity, not color: a ready-made design whose legacy zodiac color was changed still gets its own palette
  assert.deepEqual(resolveMandalaElementColors(starter("midnight", "#123456")), MANDALA_ELEMENT_PALETTES.midnight);
  // the id alone also identifies it; another workspace's set id does not
  assert.deepEqual(resolveMandalaElementColors({ id: `cd_cds_starter_${SA}_monochrome_mandala`, subAccountId: SA, mandalaZodiacColor: "#52525b" }), MANDALA_ELEMENT_PALETTES.monochrome);
  assert.notDeepEqual(resolveMandalaElementColors({ subAccountId: "other", ownerSetId: `cds_starter_${SA}_magnetix-violet`, mandalaZodiacColor: "#0e7490" }), MANDALA_ELEMENT_PALETTES.magnetixViolet);
  // the name is never used
  assert.notDeepEqual(resolveMandalaElementColors({ subAccountId: SA, ownerSetId: "cds_custom", isDefault: false, mandalaZodiacColor: "#0e7490", name: "Magnetix Violet" } as never), MANDALA_ELEMENT_PALETTES.magnetixViolet);
  // 4. a custom design derives from its own zodiac color
  const custom = resolveMandalaElementColors({ id: "cd_cds_600JRBXdFnEqhrnW1Qyd_mandala", subAccountId: SA, ownerSetId: "cds_600JRBXdFnEqhrnW1Qyd", isDefault: false, mandalaZodiacColor: "#0e7490" });
  assert.equal(new Set(Object.values(custom)).size, 4);
  assert.notDeepEqual(custom, MANDALA_ELEMENT_PALETTES.default);
  const custom2 = resolveMandalaElementColors({ subAccountId: SA, ownerSetId: "cds_x", isDefault: false, mandalaZodiacColor: "#be123c" });
  assert.notDeepEqual(custom, custom2, "different zodiac colors → different derived palettes");
  // 7. explicitly saved element colors always win over any built-in fallback
  const pinned = { mandalaFireColor: "#010101", mandalaEarthColor: "#020202", mandalaAirColor: "#030303", mandalaWaterColor: "#040404" };
  assert.deepEqual(resolveMandalaElementColors({ ...starter("midnight", "#a78bfa"), ...pinned }), { fire: "#010101", earth: "#020202", air: "#030303", water: "#040404" });
  assert.deepEqual(resolveMandalaElementColors({ ...starter("magnetix-violet", "#8b5cf6"), mandalaAirColor: "#030303" }), { ...MANDALA_ELEMENT_PALETTES.magnetixViolet, air: "#030303" });
});
check("center glow follows the background (no white hole on dark designs)", () => {
  assert.equal(glowColor("#0f1115"), "#0f1115");
  assert.notEqual(glowColor("#fff7ed"), "#ffffff");
});

console.log("\nActivations + BodyGraph");
console.log("\nDesign controls (BodyGraph model)");
const SA = "xvnedVCmQpEvHrcPhEDI";
const legacyStarter = (key: string, extra: Record<string, unknown> = {}) => ({ id: `cd_cds_starter_${SA}_${key}_mandala`, subAccountId: SA, ownerSetId: `cds_starter_${SA}_${key}`, isDefault: false, ...extra });
check("29 optional Mandala color fields, all accepted by the Chart Design allow-list", () => {
  assert.equal(MANDALA_OPTIONAL_COLOR_FIELDS.length, 29);
  for (const f of MANDALA_OPTIONAL_COLOR_FIELDS) assert.ok((CHART_DESIGN_SYSTEM_FIELDS.mandala as readonly string[]).includes(f), f);
  const svc = readFileSync("src/lib/server/chart-design-service.ts", "utf8");
  for (const f of MANDALA_OPTIONAL_COLOR_FIELDS) assert.ok(!svc.includes(f), `${f} must not be backfilled on read`);
});
check("basic colors: hexagrams, gate text, background, glow — each its own value, applied uniformly (BodyGraph keeps the chosen color over wedges too)", () => {
  const c = resolveMandalaColors({ backgroundColor: "#fafafa", mandalaHexagramColor: "#110000", mandalaGateTextColor: "#001100", mandalaGlowColor: "#000011" });
  const m = buildMandalaModel({ personality: [{ gate: 13, line: 1, body: "sun" }], design: [] }, c);
  assert.equal(c.background, "#fafafa");
  assert.ok(m.gates.every((g) => g.hexagram.stroke === "#110000" && g.number.fill === "#001100"), "same color on activated and inactive gates");
  assert.equal(m.glow.color, "#000011");
  // legacy fallbacks reproduce today's rendering
  const legacy = resolveMandalaColors({ backgroundColor: "#0f1115" });
  assert.equal(legacy.gateText, fieldInk("#0f1115"));
  assert.equal(legacy.hexagram, legacy.gateText);
  assert.equal(legacy.glow, glowColor("#0f1115"));
});
check("quarters: four independent backgrounds and four independent text colors", () => {
  const fields = Object.fromEntries(MANDALA_QUARTER_KEYS.flatMap((q, i) => [[MANDALA_COLOR_FIELDS.quarterBackground[q], `#00000${i + 1}`], [MANDALA_COLOR_FIELDS.quarterText[q], `#10000${i + 1}`]]));
  const m = buildMandalaModel({ personality: [], design: [] }, resolveMandalaColors({ mandalaQuadrantColor: "#71717a", ...fields }));
  assert.deepEqual(m.quarters.map((q) => [q.quarter.name, q.fill, q.ink]), [["Initiation", "#000001", "#100001"], ["Civilization", "#000002", "#100002"], ["Duality", "#000003", "#100003"], ["Mutation", "#000004", "#100004"]]);
  // one changed, the others untouched (no derivation between them)
  const one = resolveMandalaColors({ mandalaQuadrantColor: "#71717a", mandalaDualityColor: "#ff0000" });
  const legacy = quarterFills("#71717a");
  assert.deepEqual(MANDALA_QUARTER_KEYS.map((q) => one.quarters[q].background), [legacy[0], legacy[1], "#ff0000", legacy[3]]);
  // legacy: today's generated shades + automatic label ink
  const old = resolveMandalaColors({ mandalaQuadrantColor: "#d6a373" });
  assert.deepEqual(MANDALA_QUARTER_KEYS.map((q) => old.quarters[q].background), quarterFills("#d6a373"));
  assert.deepEqual(MANDALA_QUARTER_KEYS.map((q) => old.quarters[q].text), quarterFills("#d6a373").map(inkOn));
});
check("zodiac: four element backgrounds + four element text colors + a stored symbol color", () => {
  const c = resolveMandalaColors({ mandalaFireColor: "#a00000", mandalaFireTextColor: "#0a0000", mandalaWaterTextColor: "#00000a", mandalaZodiacSymbolColor: "#123456" });
  const m = buildMandalaModel({ personality: [], design: [] }, c);
  const sign = (n: string) => m.signs.find((x) => x.sign === n)!;
  for (const n of ["Aries", "Leo", "Sagittarius"]) assert.deepEqual([sign(n).fill, sign(n).ink], ["#a00000", "#0a0000"]);
  for (const n of ["Cancer", "Scorpio", "Pisces"]) assert.equal(sign(n).ink, "#00000a");
  assert.equal(c.zodiacSymbol, "#123456");
  assert.equal(new Set(m.signs.map((x) => x.fill)).size, 4, "four element groups, not 12 sign colors");
  // legacy text = today's automatic ink
  const old = resolveMandalaColors({ mandalaZodiacColor: "#8b5cf6" });
  assert.equal(old.elementText.air, inkOn(old.elements.air));
});
check("center colors: nine fields, canonical gate → center mapping, activated wedges take their center's color", () => {
  const counts: Record<string, number> = {};
  for (const g of GATE_WHEEL_ORDER) counts[GATE_CENTER[g]] = (counts[GATE_CENTER[g]] ?? 0) + 1;
  assert.deepEqual(counts, { head: 3, ajna: 6, throat: 11, g: 8, heart: 4, spleen: 7, sacral: 9, solarplexus: 7, root: 9 });
  assert.deepEqual([...MANDALA_CENTER_KEYS].sort(), Object.keys(counts).sort());
  const centers = Object.fromEntries(MANDALA_CENTER_KEYS.map((c, i) => [MANDALA_COLOR_FIELDS.centers[c], `#c0000${i}`]));
  const colors = resolveMandalaColors(centers);
  // activate every gate on the Personality side
  const m = buildMandalaModel({ personality: GATE_WHEEL_ORDER.map((gate) => ({ gate, line: 1, body: "sun" })), design: [] }, colors);
  for (const g of m.gates) {
    assert.equal(g.center, GATE_CENTER[g.gate]);
    assert.deepEqual(g.wedges.map((w) => w.fill), [colors.centers[GATE_CENTER[g.gate]]], `gate ${g.gate}`);
  }
  assert.equal(m.gates.find((g) => g.gate === 64)!.wedges[0].fill, "#c00000"); // head
  assert.equal(m.gates.find((g) => g.gate === 41)!.wedges[0].fill, "#c00008"); // root
});
check("activation sides: one center-colored wedge per gate; Personality/Design (and both) live in the planet symbols; data untouched", () => {
  const personality = [{ gate: 13, line: 4, body: "sun" }, { gate: 13, line: 2, body: "mercury" }, { gate: 7, line: 1, body: "moon" }];
  const design = [{ gate: 7, line: 6, body: "venus" }, { gate: 5, line: 3, body: "mars" }];
  const before = JSON.stringify({ personality, design });
  const colors = resolveMandalaColors({ personalityActivationColor: "#111111", designActivationColor: "#aa3300", mandalaGCenterColor: "#00aa00", mandalaSacralCenterColor: "#0000aa" });
  const m = buildMandalaModel({ personality, design }, colors);
  assert.equal(JSON.stringify({ personality, design }), before, "input not mutated");
  const g = (n: number) => m.gates.find((x) => x.gate === n)!;
  assert.deepEqual(g(13).wedges.map((w) => w.fill), ["#00aa00"], "G gate, Personality only");
  assert.deepEqual(g(7).wedges.map((w) => w.fill), ["#00aa00"], "G gate, both sides: one wedge, center color (no split, no third color)");
  assert.deepEqual(g(5).wedges.map((w) => w.fill), ["#0000aa"], "Sacral gate, Design only");
  assert.deepEqual(g(13).planets.map((p) => [p.body, p.side, p.fill]), [["sun", "personality", "#111111"], ["mercury", "personality", "#111111"]]);
  assert.deepEqual(g(7).planets.map((p) => [p.body, p.side, p.fill]), [["moon", "personality", "#111111"], ["venus", "design", "#aa3300"]], "both sides stay visible");
  assert.deepEqual(g(5).planets.map((p) => [p.side, p.fill]), [["design", "#aa3300"]]);
  assert.equal(g(1).wedges.length, 0);
  // layer toggles hide that side's symbols and (if nothing else activates it) its wedge
  const noP = buildMandalaModel({ personality, design }, colors, { showPersonality: false });
  assert.equal(noP.gates.find((x) => x.gate === 13)!.wedges.length, 0);
  assert.deepEqual(noP.gates.find((x) => x.gate === 7)!.planets.map((p) => p.side), ["design"]);
});
check("backward compatibility: old ready-made / Default / custom / partial records; explicit values win", () => {
  // old ready-made (identity) → that design's own center palette and symbol color
  assert.deepEqual(resolveMandalaColors(legacyStarter("midnight", { mandalaZodiacColor: "#a78bfa" })).centers, MANDALA_CENTER_PALETTES.midnight);
  assert.deepEqual(resolveMandalaColors(legacyStarter("magnetix-violet", { mandalaZodiacColor: "#8b5cf6" })).centers, MANDALA_CENTER_PALETTES["magnetix-violet"]);
  assert.deepEqual(resolveMandalaColors({ subAccountId: SA, ownerSetId: "cds_x", isDefault: true, mandalaZodiacColor: "#8b5cf6" }).centers, MANDALA_CENTER_PALETTES.default);
  // old custom with a non-built-in zodiac color → nine distinct derived colors
  const custom = resolveMandalaColors({ subAccountId: SA, ownerSetId: "cds_c", isDefault: false, mandalaZodiacColor: "#0e7490" });
  assert.equal(new Set(Object.values(custom.centers)).size, 9);
  // partial: some new fields saved, the rest resolve
  const partial = resolveMandalaColors({ ...legacyStarter("monochrome", { mandalaZodiacColor: "#52525b" }), mandalaRootCenterColor: "#abcdef", mandalaGlowColor: "#fefefe" });
  assert.equal(partial.centers.root, "#abcdef");
  assert.equal(partial.centers.head, MANDALA_CENTER_PALETTES.monochrome.head);
  assert.equal(partial.glow, "#fefefe");
  // presets: explicit values, the quarters equal today's generated shades (so nothing changes visually)
  const preset = (n: string) => CHART_DESIGN_PRESETS.mandala.find((p) => p.name === n)!.values as Record<string, string>;
  for (const [n, key] of [["Magnetix Violet", "magnetix-violet"], ["Monochrome", "monochrome"], ["Warm Sunset", "warm-sunset"], ["Midnight", "midnight"]] as const) {
    const v = preset(n);
    for (const f of MANDALA_OPTIONAL_COLOR_FIELDS) assert.match(v[f] ?? "", /^#[0-9a-f]{6}$/, `${n}.${f}`);
    assert.deepEqual(MANDALA_QUARTER_KEYS.map((q) => v[MANDALA_COLOR_FIELDS.quarterBackground[q]]), quarterFills(v.mandalaQuadrantColor), `${n} quarters = today's rendering`);
    assert.equal(v.mandalaGlowColor, glowColor(v.backgroundColor));
    assert.deepEqual(MANDALA_CENTER_KEYS.map((c) => v[MANDALA_COLOR_FIELDS.centers[c]]), MANDALA_CENTER_KEYS.map((c) => MANDALA_CENTER_PALETTES[key][c]));
    assert.ok(new Set(MANDALA_CENTER_KEYS.map((c) => v[MANDALA_COLOR_FIELDS.centers[c]])).size >= 8, `${n}: centers distinguishable`);
  }
});
check("center BodyGraph: drawing 55% of the wheel, centered, clear of the planet symbols", () => {
  const b = mandalaBodygraphBox();
  assert.equal(MANDALA_BODYGRAPH.drawnHeightOfWheel, 0.55);
  assert.ok(Math.abs(b.drawnH - 0.55 * 196) < 1e-9);
  const k = b.drawnH / MANDALA_BODYGRAPH.drawn.h;
  const top = b.y + (MANDALA_BODYGRAPH.drawn.y - MANDALA_BODYGRAPH.viewBox.y) * k;
  const left = b.x + (MANDALA_BODYGRAPH.drawn.x - MANDALA_BODYGRAPH.viewBox.x) * k;
  assert.ok(Math.abs(top + b.drawnH / 2 - 100) < 1e-9 && Math.abs(left + b.drawnW / 2 - 100) < 1e-9, "drawing centered");
  const innermostPlanet = Math.min(...MANDALA_RINGS.planetSlots) - 2; // symbol half-height
  assert.ok(b.drawnH / 2 < innermostPlanet, `BodyGraph reaches ${b.drawnH / 2}, planets start at ${innermostPlanet}`);
  // five symbols in one gate still stay clear of the BodyGraph's top/bottom
  for (const i of [gateIndex(10), gateIndex(15)]) for (const p of planetSymbolPositions(i, 5)) assert.ok(Math.hypot(p.x - 100, p.y - 100) - 2 > b.drawnH / 2);
});

console.log("\nOne Mandala everywhere");
check("browser and PDF both draw from mandala-spec (no private geometry left)", () => {
  const web = readFileSync("src/components/energetic-decoder/mandala-chart.tsx", "utf8");
  const pdf = readFileSync("src/lib/energetics/reading-pdf-document.tsx", "utf8");
  const pdfMandala = pdf.slice(pdf.indexOf("// ── Mandala (react-pdf Svg)"), pdf.indexOf("// ── Astrology wheel (react-pdf Svg)"));
  for (const src of [web, pdfMandala]) {
    assert.ok(src.includes("buildMandalaModel(") && src.includes("mandalaBodygraphBox()"));
    assert.ok(!/GATE_WHEEL_ORDER|WHEEL_START_LONGITUDE_DEG|QUADRANT_OUTER\s*=|const .*_R = \d/.test(src), "no local geometry constants");
  }
  for (const f of ["reading-summary.tsx", "mandala-reading-view.tsx", "report-design-viewer.tsx", "chart-design-controls.tsx", "chart-designs-tab.tsx"]) {
    assert.ok(readFileSync(`src/components/energetic-decoder/${f}`, "utf8").includes("mandalaColors={resolveMandalaColors("), f);
  }
  assert.equal((pdf.match(/mandalaColors=\{resolveMandalaColors\(mandalaDesign\)\}/g) ?? []).length, 1);
  assert.ok(readFileSync("src/lib/energetics/report-design-pdf-document.tsx", "utf8").includes("mandalaColors={resolveMandalaColors(mandalaDesign)}"));
});
check("protected Human Design surfaces are unchanged", () => {
  const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
  assert.equal(h(readFileSync("src/components/energetic-decoder/human-design-chart.tsx", "utf8")), "3567d53238cdca9f", "HumanDesignChart");
  assert.equal(h(readFileSync("src/components/energetic-decoder/human-design-full-chart.tsx", "utf8")), "f3e986bec535303d", "HumanDesignFullChart");
  const pdf = readFileSync("src/lib/energetics/reading-pdf-document.tsx", "utf8");
  const pa = pdf.indexOf("export function HumanDesignFullChartPdf(");
  assert.equal(h(pdf.slice(pa, pdf.indexOf("\n}\n", pa) + 3)), "bd0cb864288e521a", "HumanDesignFullChartPdf");
  // the PDF BodyGraph's new activation-color props default to the original constants, and only the Mandala passes them
  assert.ok(pdf.includes("personalityColor = PERSONALITY_FILL,\n  designColor = DESIGN_FILL,"));
  assert.equal((pdf.match(/personalityColor=\{colors\.personality\}/g) ?? []).length, 1, "only the Mandala passes activation colors to the PDF BodyGraph");
});

console.log(`\n${passed} checks passed.`);
