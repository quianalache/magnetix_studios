/**
 * The Mandala specification (2026-10 redesign) — the ONE authoritative
 * definition of how a Human Design Mandala looks, consumed by both the
 * browser renderer (components/energetic-decoder/mandala-chart.tsx) and
 * the PDF renderer (MandalaPdf in reading-pdf-document.tsx). Pure and
 * client-safe: no React, no server imports. The two renderers differ only
 * in their drawing primitives (DOM SVG vs react-pdf), never in geometry,
 * orientation, labels or colors.
 *
 * Presentation only. Nothing here changes a calculation: gate positions
 * come from the same GATE_WHEEL_ORDER + WHEEL_START_LONGITUDE_DEG the gate
 * calculation uses, and activations are read straight from the profile.
 *
 * Layout, outside → in (viewBox 0 0 200 200, center 100,100, outer radius
 * 98), following the hierarchy studied in the BodyGraph reference (its
 * geometry, not its artwork):
 *   Human Design Quarter band → thin zodiac band (element colors) → field
 *   → I Ching hexagram → gate number → planet symbol(s) → activation
 *   wedges running inward → center glow → BodyGraph (~55% of the wheel).
 */

import { GATE_WHEEL_ORDER, WHEEL_START_LONGITUDE_DEG, SIGNS, type ZodiacSign } from "./gate-data";
import { CHART_DESIGN_STARTERS, starterMemberId, starterSetId, type ChartDesignStarterKey } from "./chart-design-starters";

// ── Frame ─────────────────────────────────────────────────────────────

export const MANDALA_VIEW = 200;
export const MANDALA_CX = 100;
export const MANDALA_CY = 100;
export const GATE_ARC_DEG = 360 / 64;

/** Ring radii in viewBox units (outer radius 98). Proportions from the reference: quarter band 0.927–1, zodiac 0.863–0.927, field below. */
export const MANDALA_RINGS = {
  quarterOuter: 98,
  quarterInner: 90.8,
  zodiacOuter: 90.8,
  zodiacInner: 84.6,
  /** The gate field (the disc the wedges, spokes, hexagrams, numbers and planets live in). */
  field: 84.6,
  /** Hexagram: 6 lines from hexagramInner (line 1, nearest the center) outward. */
  hexagramInner: 77.9,
  hexagramLineThickness: 0.5,
  hexagramLineGap: 0.28,
  /** Tangential width of a hexagram line, and the break in a yin line. */
  hexagramWidth: 4.2,
  hexagramYinGap: 0.95,
  /** Center of the gate-number text. */
  gateNumber: 74.3,
  /** Planet-symbol slots, outermost first (multiple activations in one gate stack inward). */
  planetSlots: [69.6, 65.4, 61.2] as const,
  /** Center glow: solid out to glowSolid, fading to nothing at glowOuter. */
  glowSolid: 30,
  glowOuter: 50,
} as const;

export const MANDALA_TYPE = {
  quarterLabel: 3.9,
  zodiacLabel: 3.1,
  gateNumber: 3.5,
  planet: 3.9,
  /** Planet symbols when more than planetSlots.length share one gate (two columns). */
  planetCompact: 3.1,
} as const;

/**
 * Center BodyGraph: its DRAWING (not its box) is this fraction of the
 * wheel's outer diameter, tall. Owner trial target 55% (2026-10). The
 * BodyGraph is HumanDesignChart's CHART_VIEWBOX "18 -4 200 320", drawn
 * with no inner padding; its drawing spans x 25.58–208.18 and
 * y 4.00–309.79 of that box (getBBox), so the box is sized and nudged so
 * the drawing itself is centered on the wheel.
 */
export const MANDALA_BODYGRAPH = {
  drawnHeightOfWheel: 0.55,
  viewBox: { x: 18, y: -4, w: 200, h: 320 },
  drawn: { x: 25.58, y: 4.0, w: 182.6, h: 305.79 },
} as const;

/** The BodyGraph box (CHART_VIEWBOX) in this Mandala's viewBox units: its drawing is centered on the wheel and drawnHeightOfWheel tall. */
export function mandalaBodygraphBox(): { x: number; y: number; w: number; h: number; drawnW: number; drawnH: number } {
  const { viewBox: vb, drawn, drawnHeightOfWheel } = MANDALA_BODYGRAPH;
  const drawnH = drawnHeightOfWheel * 2 * MANDALA_RINGS.quarterOuter;
  const k = drawnH / drawn.h; // Mandala units per BodyGraph viewBox unit
  const w = vb.w * k;
  const h = vb.h * k;
  const drawnW = drawn.w * k;
  // Place the box so the drawing's own center lands on the wheel's center.
  const drawnCx = (drawn.x - vb.x + drawn.w / 2) * k;
  const drawnCy = (drawn.y - vb.y + drawn.h / 2) * k;
  return { x: MANDALA_CX - drawnCx, y: MANDALA_CY - drawnCy, w, h, drawnW, drawnH };
}

// ── Orientation ──────────────────────────────────────────────────────
//
// Standard astrology orientation: 0° Aries at 9 o'clock, ecliptic
// longitude increasing COUNTERCLOCKWISE. SVG angles: 0° = 3 o'clock,
// increasing clockwise (y points down), so screen-counterclockwise means
// a decreasing SVG angle: svg = 180 − longitude.

/** Ecliptic longitude (degrees) → SVG angle (degrees, 0 = 3 o'clock, clockwise positive), normalized to (−180, 180]. */
export function svgAngleForLongitude(longitude: number): number {
  let a = 180 - longitude;
  a = ((a % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/** The longitude where the i-th gate of GATE_WHEEL_ORDER begins (the same anchor the gate calculation uses). */
export function gateStartLongitude(index: number): number {
  return (((WHEEL_START_LONGITUDE_DEG + index * GATE_ARC_DEG) % 360) + 360) % 360;
}

export interface AngularSpan {
  /** SVG angles; start < end (end may exceed 180 so the span never wraps backwards). */
  start: number;
  end: number;
  mid: number;
}

/** SVG angular span of a longitude range [lon0, lon1] (lon1 > lon0, ≤ 360° wide). */
export function spanForLongitudes(lon0: number, lon1: number): AngularSpan {
  // Counterclockwise on screen: the END longitude has the SMALLER SVG angle.
  const end = svgAngleForLongitude(lon0);
  let start = end - (lon1 - lon0);
  if (start > end) start -= 360;
  return { start, end, mid: (start + end) / 2 };
}

export function gateSpan(index: number): AngularSpan {
  const lon0 = gateStartLongitude(index);
  return spanForLongitudes(lon0, lon0 + GATE_ARC_DEG);
}

export function gateIndex(gate: number): number {
  return GATE_WHEEL_ORDER.indexOf(gate);
}

// ── Human Design Quarters ────────────────────────────────────────────

export interface MandalaQuarter {
  number: 1 | 2 | 3 | 4;
  name: "Initiation" | "Civilization" | "Duality" | "Mutation";
  /** First gate of the quarter (canonical). */
  startGate: number;
  label: string;
}

/** The four canonical Human Design Quarters, each 16 gates, starting at gates 13, 2, 7 and 1. */
export const MANDALA_QUARTERS: readonly MandalaQuarter[] = [
  { number: 1, name: "Initiation", startGate: 13, label: "1 – Initiation" },
  { number: 2, name: "Civilization", startGate: 2, label: "2 – Civilization" },
  { number: 3, name: "Duality", startGate: 7, label: "3 – Duality" },
  { number: 4, name: "Mutation", startGate: 1, label: "4 – Mutation" },
];

/** The 16 gates of a quarter, in wheel order. */
export function quarterGates(q: MandalaQuarter): number[] {
  const start = gateIndex(q.startGate);
  return Array.from({ length: 16 }, (_, k) => GATE_WHEEL_ORDER[(start + k) % 64]);
}

export function quarterSpan(q: MandalaQuarter): AngularSpan {
  const lon0 = gateStartLongitude(gateIndex(q.startGate));
  return spanForLongitudes(lon0, lon0 + 16 * GATE_ARC_DEG);
}

// ── Zodiac + elements ────────────────────────────────────────────────

export type ZodiacElement = "fire" | "earth" | "air" | "water";

export const ZODIAC_ELEMENT: Record<ZodiacSign, ZodiacElement> = {
  Aries: "fire",
  Taurus: "earth",
  Gemini: "air",
  Cancer: "water",
  Leo: "fire",
  Virgo: "earth",
  Libra: "air",
  Scorpio: "water",
  Sagittarius: "fire",
  Capricorn: "earth",
  Aquarius: "air",
  Pisces: "water",
};

export const MANDALA_SIGNS: readonly { sign: ZodiacSign; element: ZodiacElement; span: AngularSpan }[] = SIGNS.map((sign, i) => ({
  sign,
  element: ZODIAC_ELEMENT[sign],
  span: spanForLongitudes(i * 30, i * 30 + 30),
}));

// ── I Ching hexagrams (King Wen) ─────────────────────────────────────
//
// Human Design gate N is I Ching hexagram N (King Wen numbering). Lines
// are listed BOTTOM → TOP (line 1 first), "1" = yang (solid), "0" = yin
// (broken). Verified 2026-10-06 three ways, all 64 agreeing: (1) the
// lower/upper trigrams in English Wikipedia's "List of hexagrams of the
// I Ching", with each trigram's lines per the Bagua table and the
// classical mnemonic it cites (乾三連 坤六斷 震仰盂 艮覆碗 離中虛 坎中滿
// 兌上缺 巽下斷); (2) the explicit binary column of Chinese Wikipedia's
// 六十四卦 table; (3) the trigrams named in each hexagram's traditional
// Chinese name (e.g. 水雷屯 = water over thunder). All 64 are distinct and
// the King Wen pairs hold (28 inversions + 4 complements).
// scripts/check-mandala-spec.ts pins this table.

export const KING_WEN_HEXAGRAMS: Readonly<Record<number, string>> = {
  1: "111111", 2: "000000", 3: "100010", 4: "010001", 5: "111010", 6: "010111", 7: "010000", 8: "000010",
  9: "111011", 10: "110111", 11: "111000", 12: "000111", 13: "101111", 14: "111101", 15: "001000", 16: "000100",
  17: "100110", 18: "011001", 19: "110000", 20: "000011", 21: "100101", 22: "101001", 23: "000001", 24: "100000",
  25: "100111", 26: "111001", 27: "100001", 28: "011110", 29: "010010", 30: "101101", 31: "001110", 32: "011100",
  33: "001111", 34: "111100", 35: "000101", 36: "101000", 37: "101011", 38: "110101", 39: "001010", 40: "010100",
  41: "110001", 42: "100011", 43: "111110", 44: "011111", 45: "000110", 46: "011000", 47: "010110", 48: "011010",
  49: "101110", 50: "011101", 51: "100100", 52: "001001", 53: "001011", 54: "110100", 55: "101100", 56: "001101",
  57: "011011", 58: "110110", 59: "010011", 60: "110010", 61: "110011", 62: "001100", 63: "101010", 64: "010101",
};

/** One gate's hexagram as line segments (viewBox units): line 1 nearest the center, lines tangential to the wheel. */
export function hexagramSegments(index: number, gate: number): { x1: number; y1: number; x2: number; y2: number; line: number }[] {
  const lines = KING_WEN_HEXAGRAMS[gate];
  const { mid } = gateSpan(index);
  const rad = (mid * Math.PI) / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad); // radial
  const tx = -uy, ty = ux; // tangential
  const R = MANDALA_RINGS;
  const out: { x1: number; y1: number; x2: number; y2: number; line: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const r = R.hexagramInner + R.hexagramLineThickness / 2 + k * (R.hexagramLineThickness + R.hexagramLineGap);
    const cx = MANDALA_CX + r * ux, cy = MANDALA_CY + r * uy;
    const half = R.hexagramWidth / 2;
    const parts: [number, number][] = lines[k] === "1" ? [[-half, half]] : [[-half, -R.hexagramYinGap / 2], [R.hexagramYinGap / 2, half]];
    for (const [a, b] of parts) out.push({ x1: round3(cx + a * tx), y1: round3(cy + a * ty), x2: round3(cx + b * tx), y2: round3(cy + b * ty), line: k + 1 });
  }
  return out;
}

// ── Shared drawing math ──────────────────────────────────────────────

/** Rounded to 3 decimals: server and browser trig can differ in the last digit, which would make hydration see different SVG attributes. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: round3(MANDALA_CX + r * Math.cos(rad)), y: round3(MANDALA_CY + r * Math.sin(rad)) };
}

/** A filled ring segment between two SVG angles (a0 < a1); rInner 0 gives a pie wedge. */
export function bandPath(a0: number, a1: number, rOuter: number, rInner: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const o0 = polar(a0, rOuter), o1 = polar(a1, rOuter);
  const f = (n: number) => n.toFixed(3);
  if (rInner <= 0) {
    return `M ${f(MANDALA_CX)} ${f(MANDALA_CY)} L ${f(o0.x)} ${f(o0.y)} A ${rOuter} ${rOuter} 0 ${large} 1 ${f(o1.x)} ${f(o1.y)} Z`;
  }
  const i1 = polar(a1, rInner), i0 = polar(a0, rInner);
  return `M ${f(o0.x)} ${f(o0.y)} A ${rOuter} ${rOuter} 0 ${large} 1 ${f(o1.x)} ${f(o1.y)} L ${f(i1.x)} ${f(i1.y)} A ${rInner} ${rInner} 0 ${large} 0 ${f(i0.x)} ${f(i0.y)} Z`;
}

/** Whether a label at this SVG angle sits in the lower half (its text is turned so it still reads upright). */
export function isLowerHalf(angleDeg: number): boolean {
  return Math.sin((angleDeg * Math.PI) / 180) > 1e-9;
}

/** Rotation (degrees) for straight text centered at this SVG angle: tangential, tops outward in the upper half, upright (tops inward) in the lower half. */
export function tangentialTextRotation(angleDeg: number): number {
  return isLowerHalf(angleDeg) ? angleDeg - 90 : angleDeg + 90;
}

/**
 * An arc for curved text (browser textPath) across a span at radius r,
 * running left → right as read: clockwise across the upper half,
 * counterclockwise (reversed) across the lower half so the text is upright.
 */
export function textArcPath(span: AngularSpan, r: number): string {
  const f = (n: number) => n.toFixed(3);
  if (isLowerHalf(span.mid)) {
    const p0 = polar(span.end, r), p1 = polar(span.start, r);
    return `M ${f(p0.x)} ${f(p0.y)} A ${r} ${r} 0 0 0 ${f(p1.x)} ${f(p1.y)}`;
  }
  const p0 = polar(span.start, r), p1 = polar(span.end, r);
  return `M ${f(p0.x)} ${f(p0.y)} A ${r} ${r} 0 0 1 ${f(p1.x)} ${f(p1.y)}`;
}

/**
 * Planet-symbol positions for n activations sharing one gate, outermost
 * first: one radial column while they fit the slots, two columns (and the
 * compact size) beyond that.
 */
export function planetSymbolPositions(index: number, n: number): { x: number; y: number; fontSize: number }[] {
  const { mid } = gateSpan(index);
  const slots = MANDALA_RINGS.planetSlots;
  if (n <= slots.length) return Array.from({ length: n }, (_, k) => ({ ...polar(mid, slots[k]), fontSize: MANDALA_TYPE.planet }));
  const rad = (mid * Math.PI) / 180;
  const tx = -Math.sin(rad), ty = Math.cos(rad);
  const off = 1.55;
  return Array.from({ length: n }, (_, k) => {
    const row = Math.floor(k / 2), side = k % 2 === 0 ? -1 : 1;
    const p = polar(mid, slots[Math.min(row, slots.length - 1)] + (row >= slots.length ? -3.6 * (row - slots.length + 1) : 0));
    return { x: round3(p.x + side * off * tx), y: round3(p.y + side * off * ty), fontSize: MANDALA_TYPE.planetCompact };
  });
}

// ── Colors ───────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [113, 113, 122];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}
/** One configured color → a related shade (hue rotation + lightness/saturation nudge). */
export function deriveShade(hex: string, hueOffsetDeg: number, lightnessDelta = 0, saturationDelta = 0): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const h2 = (h + hueOffsetDeg + 360) % 360;
  const s2 = Math.min(1, Math.max(0.18, s + saturationDelta));
  const l2 = Math.min(0.86, Math.max(0.14, l + lightnessDelta));
  return rgbToHex(...hslToRgb(h2, s2, l2));
}
/** Perceived luminance (ITU-R BT.601) below 150 → treat as dark (white ink reads on it). */
export function isDarkColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}
/** `top` painted at `alpha` over `bottom`. */
export function blend(top: string, bottom: string, alpha: number): string {
  const a = hexToRgb(top), b = hexToRgb(bottom);
  return rgbToHex(a[0] * alpha + b[0] * (1 - alpha), a[1] * alpha + b[1] * (1 - alpha), a[2] * alpha + b[2] * (1 - alpha));
}

/** Quarter band: four related shades of the one configured quadrant color. */
export function quarterFills(quadrantColor: string): string[] {
  const HUE = [0, 28, -28, 52];
  const LIGHT = [0, 0.04, -0.06, 0.08];
  return [0, 1, 2, 3].map((q) => deriveShade(quadrantColor, HUE[q], LIGHT[q]));
}

/** Activation wedges are painted at this opacity over the field, so the gate's hexagram/number stay legible on them. */
export const WEDGE_OPACITY = 0.5;

/** Ink for gate numbers and hexagrams: one color for all 64 on the field, switched only where a filled wedge needs contrast. */
export function fieldInk(backgroundColor: string): string {
  return isDarkColor(backgroundColor) ? "#e4e4e7" : "#27272a";
}
export function inkOn(fill: string): string {
  return isDarkColor(fill) ? "#ffffff" : "#27272a";
}

/**
 * Center glow color, derived from the design's background (never a fixed
 * white, which would punch a hole in a dark design): on light backgrounds
 * a little lighter than the background (toward white, like the
 * reference), on dark backgrounds the background itself, so the fade
 * reads as the wheel clearing toward the BodyGraph.
 */
export function glowColor(backgroundColor: string): string {
  return isDarkColor(backgroundColor) ? rgbToHex(...hexToRgb(backgroundColor)) : blend("#ffffff", backgroundColor, 0.65);
}

// ── Element colors (Chart Design fields, with a fallback) ────────────

export const MANDALA_ELEMENT_FIELDS = {
  fire: "mandalaFireColor",
  earth: "mandalaEarthColor",
  air: "mandalaAirColor",
  water: "mandalaWaterColor",
} as const;

export type MandalaElementColors = Record<ZodiacElement, string>;

/** The element palettes the built-in designs use (fresh Default + the four ready-made designs). */
export const MANDALA_ELEMENT_PALETTES = {
  default: { fire: "#c97b7b", earth: "#a68a64", air: "#8f9a6a", water: "#7f9bb0" },
  magnetixViolet: { fire: "#c026d3", earth: "#7c3aed", air: "#a78bfa", water: "#4f46e5" },
  monochrome: { fire: "#3f3f46", earth: "#52525b", air: "#a1a1aa", water: "#71717a" },
  warmSunset: { fire: "#c2410c", earth: "#a16207", air: "#f59e0b", water: "#b45309" },
  midnight: { fire: "#f472b6", earth: "#a78bfa", air: "#38bdf8", water: "#6366f1" },
} as const satisfies Record<string, MandalaElementColors>;

/** Each ready-made design's element palette, by its stable starter key (CHART_DESIGN_STARTERS). */
const STARTER_ELEMENT_PALETTES: Record<ChartDesignStarterKey, MandalaElementColors> = {
  "magnetix-violet": MANDALA_ELEMENT_PALETTES.magnetixViolet,
  monochrome: MANDALA_ELEMENT_PALETTES.monochrome,
  "warm-sunset": MANDALA_ELEMENT_PALETTES.warmSunset,
  midnight: MANDALA_ELEMENT_PALETTES.midnight,
};

/** The design record fields the element-color fallback reads. */
export interface MandalaElementColorSource {
  id?: string | null;
  subAccountId?: string | null;
  ownerSetId?: string | null;
  isDefault?: boolean | null;
  mandalaZodiacColor?: string | null;
  mandalaFireColor?: string | null;
  mandalaEarthColor?: string | null;
  mandalaAirColor?: string | null;
  mandalaWaterColor?: string | null;
}

/**
 * Which built-in design a record is, by stable identity — never by name or
 * color: a ready-made design's records belong to the set
 * starterSetId(subAccountId, key) (their ownerSetId, and their own id is
 * starterMemberId(thatSet, system)), written when the ready-made designs
 * were added; the workspace's Default record carries isDefault: true.
 */
export function builtInElementPalette(design: MandalaElementColorSource | null | undefined): MandalaElementColors | null {
  if (!design) return null;
  if (design.subAccountId) {
    for (const { key } of CHART_DESIGN_STARTERS) {
      const setId = starterSetId(design.subAccountId, key);
      if (design.ownerSetId === setId || design.id === starterMemberId(setId, "mandala")) return STARTER_ELEMENT_PALETTES[key];
    }
  }
  if (design.isDefault === true) return MANDALA_ELEMENT_PALETTES.default;
  return null;
}

/**
 * A design's four element colors. Explicitly saved colors always win.
 * Designs saved before the element fields existed have only
 * `mandalaZodiacColor` (kept, never overwritten); for those the missing
 * colors fall back — at read time only, nothing is ever written:
 *   1. a built-in design (the Default, or a ready-made design, identified
 *      by builtInElementPalette above) → its own intended palette;
 *   2. any other (custom) design → from its own zodiac color: the built-in
 *      palette carrying that same zodiac color, otherwise four distinct
 *      shades derived from it, so a custom design keeps its color family.
 * The first Mandala save in the editor writes the four colors shown.
 */
export function resolveMandalaElementColors(design: MandalaElementColorSource | null | undefined): MandalaElementColors {
  const z = (design?.mandalaZodiacColor || "#8b5cf6").toLowerCase();
  const bySeed: Record<string, MandalaElementColors> = {
    "#8b5cf6": MANDALA_ELEMENT_PALETTES.default,
    "#52525b": MANDALA_ELEMENT_PALETTES.monochrome,
    "#ea580c": MANDALA_ELEMENT_PALETTES.warmSunset,
    "#a78bfa": MANDALA_ELEMENT_PALETTES.midnight,
  };
  const fallback: MandalaElementColors = builtInElementPalette(design) ??
    bySeed[z] ?? {
      fire: deriveShade(z, -35, 0.02),
      earth: deriveShade(z, 25, -0.1),
      air: deriveShade(z, 70, 0.08),
      water: deriveShade(z, -80, -0.04),
    };
  return {
    fire: design?.mandalaFireColor || fallback.fire,
    earth: design?.mandalaEarthColor || fallback.earth,
    air: design?.mandalaAirColor || fallback.air,
    water: design?.mandalaWaterColor || fallback.water,
  };
}

// ── The drawing model (everything both renderers draw) ──────────────

export interface MandalaColors {
  backgroundColor: string;
  personalityColor: string;
  designColor: string;
  /** "Activated gates" accent: the rim arc on each activated gate. */
  gateColor: string;
  gateRingColor: string;
  quadrantColor: string;
  elements: MandalaElementColors;
}

export interface MandalaActivationInput {
  gate: number;
  line: number;
  body: string;
}

export interface MandalaGateModel {
  gate: number;
  index: number;
  span: AngularSpan;
  personality: MandalaActivationInput[];
  design: MandalaActivationInput[];
  /** Activation wedges, center → field edge: one (one side) or two halves (both sides, split down the gate's center). */
  wedges: { start: number; end: number; fill: string }[];
  /** Rim accent arc for activated gates. */
  rim: { start: number; end: number } | null;
  number: { x: number; y: number; rotate: number; fill: string };
  hexagram: { segments: ReturnType<typeof hexagramSegments>; stroke: string };
  planets: { x: number; y: number; fontSize: number; body: string; fill: string; side: "personality" | "design" }[];
}

export interface MandalaModel {
  quarters: { quarter: MandalaQuarter; span: AngularSpan; fill: string; ink: string; labelAngle: number }[];
  signs: { sign: ZodiacSign; element: ZodiacElement; span: AngularSpan; fill: string; ink: string }[];
  gates: MandalaGateModel[];
  spokes: { x1: number; y1: number; x2: number; y2: number }[];
  glow: { color: string; solidStop: number };
  fieldInk: string;
}

/**
 * Everything a Mandala draws, from the profile's activations and the
 * design's colors. `showPersonality` / `showDesign` (the Reading page's
 * layer toggles) hide a side's wedges and symbols only — never data.
 */
export function buildMandalaModel(
  activations: { personality: MandalaActivationInput[]; design: MandalaActivationInput[] },
  colors: MandalaColors,
  opts: { showPersonality?: boolean; showDesign?: boolean } = {},
): MandalaModel {
  const showP = opts.showPersonality !== false;
  const showD = opts.showDesign !== false;
  const bg = colors.backgroundColor;
  const ink = fieldInk(bg);
  const quarterFill = quarterFills(colors.quadrantColor);
  const R = MANDALA_RINGS;

  const quarters = MANDALA_QUARTERS.map((quarter, q) => {
    const span = quarterSpan(quarter);
    return { quarter, span, fill: quarterFill[q], ink: inkOn(quarterFill[q]), labelAngle: span.mid };
  });
  const signs = MANDALA_SIGNS.map(({ sign, element, span }) => {
    const fill = colors.elements[element];
    return { sign, element, span, fill, ink: inkOn(fill) };
  });

  const gates: MandalaGateModel[] = GATE_WHEEL_ORDER.map((gate, index) => {
    const span = gateSpan(index);
    const personality = showP ? activations.personality.filter((a) => a.gate === gate) : [];
    const design = showD ? activations.design.filter((a) => a.gate === gate) : [];
    const pOn = personality.length > 0, dOn = design.length > 0;
    const wedges =
      pOn && dOn
        ? [
            // Personality on the half that comes first going counterclockwise (the higher-longitude side), Design on the other — fixed, so a split always reads the same way.
            { start: span.start, end: span.mid, fill: colors.personalityColor },
            { start: span.mid, end: span.end, fill: colors.designColor },
          ]
        : pOn || dOn
          ? [{ start: span.start, end: span.end, fill: pOn ? colors.personalityColor : colors.designColor }]
          : [];
    // Ink for the number + hexagram: the field ink, or white/dark against the wedge they sit on.
    const shown = wedges.map((w) => blend(w.fill, bg, WEDGE_OPACITY));
    const avg = shown.length
      ? rgbToHex(...([0, 1, 2].map((c) => shown.reduce((s, h) => s + hexToRgb(h)[c], 0) / shown.length) as [number, number, number]))
      : null;
    const gateInk = avg ? inkOn(avg) : ink;
    const numberPos = polar(span.mid, R.gateNumber);
    const symbols = [
      ...personality.map((a) => ({ body: a.body, side: "personality" as const, fill: colors.personalityColor })),
      ...design.map((a) => ({ body: a.body, side: "design" as const, fill: colors.designColor })),
    ];
    const positions = planetSymbolPositions(index, symbols.length);
    return {
      gate,
      index,
      span,
      personality,
      design,
      wedges,
      rim: wedges.length ? { start: span.start, end: span.end } : null,
      number: { ...numberPos, rotate: tangentialTextRotation(span.mid), fill: gateInk },
      hexagram: { segments: hexagramSegments(index, gate), stroke: gateInk },
      planets: symbols.map((s, k) => ({ ...positions[k], ...s })),
    };
  });

  const spokes = Array.from({ length: 64 }, (_, i) => {
    const a = gateSpan(i).start;
    const p = polar(a, R.field);
    return { x1: MANDALA_CX, y1: MANDALA_CY, x2: p.x, y2: p.y };
  });

  return { quarters, signs, gates, spokes, glow: { color: glowColor(bg), solidStop: R.glowSolid / R.glowOuter }, fieldInk: ink };
}
