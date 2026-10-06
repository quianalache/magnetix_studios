import type { AstrologyAspect, AstrologyBodyName, AstrologyChart, AspectType, ZodiacSign } from "./astrology";
import { SIGNS } from "./gate-data";
import { CHART_DESIGN_STARTERS, starterMemberId, starterSetId, type ChartDesignStarterKey } from "./chart-design-starters";
import {
  TEXT_PRESENTATION,
  ZODIAC_ELEMENT,
  ZODIAC_GLYPH,
  ZODIAC_GLYPH_FONT,
  ZODIAC_GLYPH_PATHS,
  isDarkColor,
  type ZodiacElement,
} from "./mandala-spec";

/**
 * The Astrology natal wheel, specified once (2026-10 Chart Designs pass).
 * The browser AstrologyWheelChart, the PDF AstrologyWheelPdf and the
 * AspectGrid all draw from this file — geometry, glyphs, the aspect
 * styling and every design color — so the three can't drift apart again
 * (before this, each kept its own constants and the grid's aspect colors
 * no longer matched the wheel's). Pure and client-safe; the types from
 * astrology.ts are `import type` only.
 *
 * Wheel model (all in a 200 × 200 view, center 100,100):
 *  - Ascendant fixed at 9 o'clock, longitude counterclockwise — the
 *    convention every chart program uses; positions are the calculated
 *    ones, nothing here changes a calculation.
 *  - outside in: AC/DC/MC/IC labels · zodiac band (element colors, glyph
 *    per sign) · degree ticks (1°/5°/10°) · each planet's true-degree tick
 *    · planet glyphs on one track (clusters spread both ways around their
 *    true positions, never cascading) · house ring (cusp lines, numbers
 *    around the aspect circle) · aspect circle (radius ½ the wheel), whose
 *    lines run between the planets' TRUE degrees, weighted by orb.
 */

export const ASTRO_VIEW = 200;
export const ASTRO_CX = 100;
export const ASTRO_CY = 100;

export const ASTRO_RINGS = {
  /** Outer edge of the zodiac band — the wheel's radius. */
  outer: 92,
  bandInner: 80,
  /** Degree tick lengths, inward from the band. */
  tick1: 1.6,
  tick5: 2.6,
  tick10: 3.8,
  /** A planet's true-degree tick: from the degree scale (bandInner) in to trueTickInner. */
  trueTickOuter: 80,
  trueTickInner: 75.4,
  /** Where a displaced glyph's connector ends. */
  connectorInner: 72.4,
  planetTrack: 67.8,
  houseNumber: 50.8,
  /** The aspect circle: half the wheel's radius. */
  aspect: 46,
  /** AC–DC and MC–IC axes reach a little past the band… */
  axisOuter: 95,
  /** …and each label sits on its axis, just past the line's end (its center's distance grows with how wide the label reads along the axis). */
  angleLabelGap: 1.2,
} as const;

export const ASTRO_TYPE = {
  zodiacGlyph: 7.2,
  planetGlyph: 7.4,
  houseNumber: 4.2,
  angleLabel: 4.4,
  retrograde: 3.4,
} as const;

/** Minimum angular gap between two planet glyphs on the track. */
export const PLANET_MIN_SEPARATION = 7.2;

/**
 * Margin around the wheel, in view units, on each side. The editor preview
 * uses none — the outer ring then spans 92% of the preview canvas, the AC/
 * DC/MC/IC labels using the rest — every other surface keeps a little
 * breathing room. This replaces the old wrapper `padding: 5%`, which CSS
 * resolved against the PARENT's width (so the chart shrank as cards grew).
 */
export const ASTRO_DEFAULT_MARGIN = 4;
export const ASTRO_EDITOR_MARGIN = 0;
export function astroViewBox(margin: number = ASTRO_DEFAULT_MARGIN): string {
  return `${-margin} ${-margin} ${ASTRO_VIEW + 2 * margin} ${ASTRO_VIEW + 2 * margin}`;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Screen angle (degrees, counterclockwise from 3 o'clock) of an ecliptic longitude, Ascendant at 9 o'clock. */
export function astroScreenAngle(longitude: number, ascLongitude: number): number {
  return 180 + (longitude - ascLongitude);
}

export function astroPolar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: round3(ASTRO_CX + r * Math.cos(rad)), y: round3(ASTRO_CY - r * Math.sin(rad)) };
}

/** An annular sector (one zodiac sign) between two screen angles, a2 > a1 by less than 180°. Same `d` works in SVG and react-pdf. */
export function astroWedgePath(a1: number, a2: number, rOuter: number, rInner: number): string {
  const o1 = astroPolar(a1, rOuter), o2 = astroPolar(a2, rOuter), i1 = astroPolar(a1, rInner), i2 = astroPolar(a2, rInner);
  return `M ${o1.x} ${o1.y} A ${rOuter} ${rOuter} 0 0 0 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${rInner} ${rInner} 0 0 1 ${i1.x} ${i1.y} Z`;
}

// ── Glyphs ───────────────────────────────────────────────────────────

export { ZODIAC_GLYPH, ZODIAC_GLYPH_PATHS, TEXT_PRESENTATION };
/** Symbol fonts for the browser's glyph text — plus U+FE0E on every glyph, so no platform turns them into color emoji. */
export const ASTRO_GLYPH_FONT = ZODIAC_GLYPH_FONT;

export const PLANET_GLYPH: Record<AstrologyBodyName, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
  northNode: "☊", southNode: "☋", lilith: "⚸", chiron: "⚷",
};

export const BODY_LABEL: Record<AstrologyBodyName, string> = {
  sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars",
  jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", pluto: "Pluto",
  northNode: "North Node", southNode: "South Node", lilith: "Lilith", chiron: "Chiron",
};

/** A glyph as browser text: the symbol plus the text-presentation selector. */
export function glyphText(glyph: string): string {
  return glyph + TEXT_PRESENTATION;
}

/**
 * Vector planet glyphs for the PDF, whose only font (WinAnsi Helvetica)
 * has no astrological symbols. Original line drawings in a 10 × 10 box,
 * stroked, no fill — the same approach as the Mandala's zodiac glyphs
 * (ZODIAC_GLYPH_PATHS, reused for the zodiac band here).
 */
export const PLANET_GLYPH_PATHS: Record<AstrologyBodyName, string> = {
  sun: "M1.4 5 A3.6 3.6 0 1 0 8.6 5 A3.6 3.6 0 1 0 1.4 5 Z M4.4 5 A0.6 0.6 0 1 0 5.6 5 A0.6 0.6 0 1 0 4.4 5 Z",
  moon: "M6.6 1.2 A3.9 3.9 0 1 0 6.6 8.8 A3.1 3.1 0 1 1 6.6 1.2 Z",
  mercury: "M2.9 4.9 A2.1 2.1 0 1 0 7.1 4.9 A2.1 2.1 0 1 0 2.9 4.9 Z M3.2 0.9 A1.9 1.9 0 0 0 6.8 0.9 M5 7 L5 9.6 M3.6 8.4 L6.4 8.4",
  venus: "M2.4 3.8 A2.6 2.6 0 1 0 7.6 3.8 A2.6 2.6 0 1 0 2.4 3.8 Z M5 6.4 L5 9.6 M3.4 8.1 L6.6 8.1",
  mars: "M1.4 6.2 A2.6 2.6 0 1 0 6.6 6.2 A2.6 2.6 0 1 0 1.4 6.2 Z M5.84 4.36 L8.9 1.1 M5.9 1.1 L8.9 1.1 L8.9 4.1",
  jupiter: "M1.6 2.8 C2.4 1 5 1.2 4.8 3.4 C4.6 5.1 2.8 6.3 1.6 7 L8.6 7 M6.6 1.2 L6.6 9.4",
  saturn: "M3 0.8 L3 7.6 M1.4 2.4 L4.8 2.4 M3 5.4 C3.6 3.8 7.2 3.6 7.2 5.6 C7.2 7 5.6 7.4 5.6 8.5 C5.6 9.4 6.6 9.6 7.4 9",
  uranus: "M2.4 1 L2.4 6 M7.6 1 L7.6 6 M2.4 3.5 L7.6 3.5 M5 1 L5 7.3 M3.9 8.4 A1.1 1.1 0 1 0 6.1 8.4 A1.1 1.1 0 1 0 3.9 8.4 Z",
  neptune: "M1.6 1.4 C1.6 5.6 8.4 5.6 8.4 1.4 M5 1 L5 9.4 M3.4 7.6 L6.6 7.6",
  pluto: "M3 1.2 L3 8.8 L7.4 8.8 M3 1.2 L5.3 1.2 C7.6 1.2 7.6 5.2 5.3 5.2 L3 5.2",
  northNode: "M3 7.1 L3 5 C3 1.4 7 1.4 7 5 L7 7.1 M2.1 8 A0.9 0.9 0 1 0 3.9 8 A0.9 0.9 0 1 0 2.1 8 Z M6.1 8 A0.9 0.9 0 1 0 7.9 8 A0.9 0.9 0 1 0 6.1 8 Z",
  southNode: "M3 2.9 L3 5 C3 8.6 7 8.6 7 5 L7 2.9 M2.1 2 A0.9 0.9 0 1 0 3.9 2 A0.9 0.9 0 1 0 2.1 2 Z M6.1 2 A0.9 0.9 0 1 0 7.9 2 A0.9 0.9 0 1 0 6.1 2 Z",
  lilith: "M6.2 0.8 A2.9 2.9 0 1 0 6.2 6.4 A2.3 2.3 0 1 1 6.2 0.8 Z M4.6 6.6 L4.6 9.6 M3.2 8.2 L6 8.2",
  chiron: "M5 0.8 L5 6.8 M5 3.8 L7.6 1.2 M5 3.8 L7.6 6.2 M3.7 8.1 A1.3 1.3 0 1 0 6.3 8.1 A1.3 1.3 0 1 0 3.7 8.1 Z",
};

// ── Aspects ──────────────────────────────────────────────────────────

/**
 * The supported aspects. `orb` mirrors ASPECT_DEFS in astrology.ts (the
 * calculation — unchanged, and pinned equal by the spec check); here it
 * only scales line weight: an exact aspect draws boldest.
 */
export const ASPECT_META: Record<AspectType, { angle: number; orb: number; glyph: string; dash?: string; drawnInWheel: boolean }> = {
  Conjunction: { angle: 0, orb: 8, glyph: "☌", drawnInWheel: false }, // bodies sit together on the ring — a line adds nothing
  Sextile: { angle: 60, orb: 6, glyph: "⚹", drawnInWheel: true },
  Square: { angle: 90, orb: 8, glyph: "□", drawnInWheel: true },
  Trine: { angle: 120, orb: 8, glyph: "△", drawnInWheel: true },
  Opposition: { angle: 180, orb: 8, glyph: "☍", dash: "2.4 1.6", drawnInWheel: true },
};
export const ASPECT_TYPES: readonly AspectType[] = ["Conjunction", "Sextile", "Square", "Trine", "Opposition"];

/** Tighter aspects draw bolder: width and opacity scale with closeness to exact. */
export function aspectStroke(type: AspectType, orb: number): { width: number; opacity: number } {
  const t = Math.max(0, Math.min(1, 1 - orb / ASPECT_META[type].orb));
  return { width: round3(0.35 + 0.75 * t), opacity: round3(0.4 + 0.55 * t) };
}

/**
 * The North Node ↔ South Node opposition. It is drawn like every other
 * opposition (same color field, same dash, true-degree endpoints) — but
 * the nodes are opposite by definition, so its orb is always 0 and says
 * nothing about strength. It therefore takes the standard opposition
 * weight (the middle of the orb range) rather than the boldest line on
 * the chart.
 */
export function isNodeAxis(a: AstrologyAspect): boolean {
  return (a.bodyA === "northNode" && a.bodyB === "southNode") || (a.bodyA === "southNode" && a.bodyB === "northNode");
}

// ── Design colors (Chart Design fields, with fallbacks) ──────────────

export const ASTROLOGY_COLOR_FIELDS = {
  housesBackground: "astroHousesBackgroundColor",
  aspectsBackground: "astroAspectsBackgroundColor",
  wheelLines: "astroWheelLineColor",
  houseLines: "astroHouseLineColor",
  houseNumbers: "astroHouseNumberColor",
  angles: "astroAngleColor",
  elements: { fire: "astroFireColor", earth: "astroEarthColor", air: "astroAirColor", water: "astroWaterColor" },
  zodiacSymbols: "astroZodiacSymbolColor",
  aspects: {
    Conjunction: "astroConjunctionColor",
    Sextile: "astroSextileColor",
    Square: "astroSquareColor",
    Trine: "astroTrineColor",
    Opposition: "astroOppositionColor",
  },
} as const;

/** The 16 optional Astrology color fields — what the editor pins on the first Astrology save. (`wheelAccentColor` = planet symbols and `backgroundColor` are the two pre-existing fields.) */
export const ASTROLOGY_OPTIONAL_COLOR_FIELDS: readonly string[] = [
  ASTROLOGY_COLOR_FIELDS.housesBackground,
  ASTROLOGY_COLOR_FIELDS.aspectsBackground,
  ASTROLOGY_COLOR_FIELDS.wheelLines,
  ASTROLOGY_COLOR_FIELDS.houseLines,
  ASTROLOGY_COLOR_FIELDS.houseNumbers,
  ASTROLOGY_COLOR_FIELDS.angles,
  ...(["fire", "earth", "air", "water"] as const).map((e) => ASTROLOGY_COLOR_FIELDS.elements[e]),
  ASTROLOGY_COLOR_FIELDS.zodiacSymbols,
  ...ASPECT_TYPES.map((t) => ASTROLOGY_COLOR_FIELDS.aspects[t]),
];

export interface ResolvedAstrologyColors {
  background: string;
  housesBackground: string;
  aspectsBackground: string;
  wheelLines: string;
  houseLines: string;
  houseNumbers: string;
  planets: string;
  angles: string;
  elements: Record<ZodiacElement, string>;
  zodiacSymbols: string;
  aspects: Record<AspectType, string>;
}

type AstrologyPalette = Omit<ResolvedAstrologyColors, "background" | "planets">;

export type BuiltInAstrologyKey = "default" | ChartDesignStarterKey;

/**
 * The built-in designs' Astrology palettes — deliberately restrained: each
 * coordinates with its design rather than restyling the chart (every design
 * shares one visual system; only these colors vary). Zodiac bands start from each
 * design's Mandala element colors (so a design reads as one family across
 * its charts), tuned for the wheel: every zodiac-symbol color clears ~3:1
 * against all four of its bands, house numbers / planets / angles clear
 * 4.5:1 against what they sit on, and the five aspect colors stay
 * distinguishable on their aspect circle (pinned by check-astrology-spec).
 * Midnight is a dark composition throughout — dark house ring and aspect
 * circle, light ink, dark glyphs on its bright bands.
 */
export const ASTROLOGY_PALETTES: Record<BuiltInAstrologyKey, AstrologyPalette> = {
  default: {
    housesBackground: "#faf9f7", aspectsBackground: "#ffffff", wheelLines: "#a1a1aa", houseLines: "#c4c4cc", houseNumbers: "#52525b", angles: "#5e2574",
    elements: { fire: "#c06e6e", earth: "#9c7f58", air: "#828d5d", water: "#6f8ca3" }, zodiacSymbols: "#1f1b24", // dark symbols: the traditional chart look, and crisper than white on these muted bands
    aspects: { Conjunction: "#3f3f46", Sextile: "#0d9488", Square: "#dc2626", Trine: "#2563eb", Opposition: "#b91c1c" },
  },
  "magnetix-violet": {
    housesBackground: "#faf7ff", aspectsBackground: "#ffffff", wheelLines: "#a78bfa", houseLines: "#ddd6fe", houseNumbers: "#5b21b6", angles: "#5b21b6",
    elements: { fire: "#c026d3", earth: "#7c3aed", air: "#8b5cf6", water: "#4f46e5" }, zodiacSymbols: "#ffffff",
    aspects: { Conjunction: "#4c1d95", Sextile: "#0891b2", Square: "#db2777", Trine: "#7c3aed", Opposition: "#be185d" },
  },
  monochrome: {
    housesBackground: "#fafafa", aspectsBackground: "#ffffff", wheelLines: "#71717a", houseLines: "#d4d4d8", houseNumbers: "#3f3f46", angles: "#18181b",
    elements: { fire: "#3f3f46", earth: "#66666f", air: "#85858e", water: "#52525b" }, zodiacSymbols: "#ffffff",
    aspects: { Conjunction: "#18181b", Sextile: "#71717a", Square: "#27272a", Trine: "#52525b", Opposition: "#27272a" },
  },
  "warm-sunset": {
    housesBackground: "#fffbf5", aspectsBackground: "#ffffff", wheelLines: "#d6a373", houseLines: "#f1d5b8", houseNumbers: "#7c2d12", angles: "#9a3412",
    // terracotta / olive-sage / muted gold / dusty rose: still warm and quiet, but the four elements read apart (the Mandala's four orange-browns didn't), with one deep-brown symbol color for all four
    elements: { fire: "#cf7f63", earth: "#a6a174", air: "#ddb86a", water: "#bf8693" }, zodiacSymbols: "#2a1a10",
    aspects: { Conjunction: "#7c2d12", Sextile: "#a16207", Square: "#b91c1c", Trine: "#ea580c", Opposition: "#9a3412" },
  },
  midnight: {
    housesBackground: "#171a21", aspectsBackground: "#0f1115", wheelLines: "#4b5563", houseLines: "#374151", houseNumbers: "#cbd5e1", angles: "#e0e7ff",
    elements: { fire: "#f472b6", earth: "#a78bfa", air: "#38bdf8", water: "#6366f1" }, zodiacSymbols: "#0f1115",
    aspects: { Conjunction: "#e5e7eb", Sextile: "#2dd4bf", Square: "#fb7185", Trine: "#60a5fa", Opposition: "#f472b6" },
  },
};

/**
 * A custom design that has never saved these fields renders exactly as
 * every Astrology chart did before this pass (the old fixed constants;
 * element colors = the old pastel bands as they appeared on white), so
 * nothing changes until someone edits it. On a dark background those
 * light constants were the "muddy" look, so a dark custom design gets the
 * dark counterparts instead.
 */
function legacyPalette(background: string, planets: string): AstrologyPalette {
  const aspects = { Conjunction: "#3f3f46", Sextile: "#0d9488", Square: "#dc2626", Trine: "#2563eb", Opposition: "#dc2626" };
  const elements = { fire: "#f2cfb7", earth: "#c1cfb4", air: "#c1d2eb", water: "#b9d5d2" };
  if (isDarkColor(background)) {
    return {
      housesBackground: background, aspectsBackground: background, wheelLines: "#52525b", houseLines: "#3f3f46", houseNumbers: "#d4d4d8", angles: planets,
      elements, zodiacSymbols: "#27272a", aspects: { ...aspects, Conjunction: "#d4d4d8" },
    };
  }
  return {
    housesBackground: "#faf9f7", aspectsBackground: background, wheelLines: "#a1a1aa", houseLines: "#a1a1aa", houseNumbers: "#3f3f46", angles: planets,
    elements, zodiacSymbols: "#3f3f46", aspects,
  };
}

/** The record fields resolveAstrologyColors reads (a ChartDesign, a frozen copy, or the editor's preview). */
export interface AstrologyDesignColorSource {
  id?: string | null;
  subAccountId?: string | null;
  ownerSetId?: string | null;
  isDefault?: boolean | null;
  backgroundColor?: string | null;
  wheelAccentColor?: string | null;
}

/** Which built-in design a record is, by stable identity only (its set/record id or the default flag) — never by name or color. Null = custom. */
export function builtInAstrologyKey(design: AstrologyDesignColorSource | null | undefined): BuiltInAstrologyKey | null {
  if (!design) return null;
  if (design.subAccountId) {
    for (const { key } of CHART_DESIGN_STARTERS) {
      const setId = starterSetId(design.subAccountId, key);
      if (design.ownerSetId === setId || design.id === starterMemberId(setId, "astrology")) return key;
    }
  }
  return design.isDefault === true ? "default" : null;
}

/** Planet color when a design has none (no design at all): the old neutral ink — the same everywhere now (browser and both PDFs used to differ). */
export const ASTRO_DEFAULT_PLANET_COLOR = "#3f3f46";

/** Every Astrology color of a design: saved field → built-in palette (by identity) → the legacy look. Never writes. */
export function resolveAstrologyColors(design: AstrologyDesignColorSource | object | null | undefined): ResolvedAstrologyColors {
  const d = (design ?? {}) as AstrologyDesignColorSource;
  const rec = d as unknown as Record<string, unknown>;
  const str = (k: string): string | null => (typeof rec[k] === "string" && (rec[k] as string) ? (rec[k] as string) : null);
  const F = ASTROLOGY_COLOR_FIELDS;
  const background = d.backgroundColor || "#ffffff";
  const planets = d.wheelAccentColor || ASTRO_DEFAULT_PLANET_COLOR;
  const key = builtInAstrologyKey(d);
  const base = key ? ASTROLOGY_PALETTES[key] : legacyPalette(background, planets);
  return {
    background,
    housesBackground: str(F.housesBackground) ?? base.housesBackground,
    aspectsBackground: str(F.aspectsBackground) ?? base.aspectsBackground,
    wheelLines: str(F.wheelLines) ?? base.wheelLines,
    houseLines: str(F.houseLines) ?? base.houseLines,
    houseNumbers: str(F.houseNumbers) ?? base.houseNumbers,
    planets,
    angles: str(F.angles) ?? base.angles,
    elements: {
      fire: str(F.elements.fire) ?? base.elements.fire,
      earth: str(F.elements.earth) ?? base.elements.earth,
      air: str(F.elements.air) ?? base.elements.air,
      water: str(F.elements.water) ?? base.elements.water,
    },
    zodiacSymbols: str(F.zodiacSymbols) ?? base.zodiacSymbols,
    aspects: Object.fromEntries(ASPECT_TYPES.map((t) => [t, str(F.aspects[t]) ?? base.aspects[t]])) as Record<AspectType, string>,
  };
}

/** A resolved color by its field name (the editor's value for pickers of fields a design hasn't saved yet). */
export function resolvedAstrologyFieldValue(colors: ResolvedAstrologyColors, field: string): string | undefined {
  const F = ASTROLOGY_COLOR_FIELDS;
  if (field === F.housesBackground) return colors.housesBackground;
  if (field === F.aspectsBackground) return colors.aspectsBackground;
  if (field === F.wheelLines) return colors.wheelLines;
  if (field === F.houseLines) return colors.houseLines;
  if (field === F.houseNumbers) return colors.houseNumbers;
  if (field === F.angles) return colors.angles;
  if (field === F.zodiacSymbols) return colors.zodiacSymbols;
  for (const e of ["fire", "earth", "air", "water"] as const) if (field === F.elements[e]) return colors.elements[e];
  for (const t of ASPECT_TYPES) if (field === F.aspects[t]) return colors.aspects[t];
  return undefined;
}

// ── Planet layout ────────────────────────────────────────────────────

/**
 * Display angles for the planet glyphs: each glyph as close to its true
 * angle as possible, with at least PLANET_MIN_SEPARATION between glyphs.
 * A crowded group spreads symmetrically around its own mean (both
 * directions), merging with a neighbor group only when they'd touch — the
 * old forward-only nudge cascaded a stellium far from where it really is.
 * Input/output: screen angles (degrees). Pure; the true angles are kept
 * separately (ticks and aspect lines use them).
 */
export function spreadPlanetAngles(trueAngles: readonly number[], minSep: number = PLANET_MIN_SEPARATION): number[] {
  const n = trueAngles.length;
  if (n === 0) return [];
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const order = trueAngles.map((a, i) => ({ a: norm(a), i })).sort((x, y) => x.a - y.a);
  // Start the unrolled circle just after its widest gap, so no group straddles the seam.
  let widest = 0, at = 0;
  for (let k = 0; k < n; k++) {
    const gap = k === n - 1 ? order[0].a + 360 - order[k].a : order[k + 1].a - order[k].a;
    if (gap > widest) { widest = gap; at = (k + 1) % n; }
  }
  const unrolled = Array.from({ length: n }, (_, k) => {
    const item = order[(at + k) % n];
    return { a: item.a + (at + k >= n ? 360 : 0), i: item.i };
  });
  type Group = { start: number; count: number; mean: number };
  const groups: Group[] = unrolled.map((u, k) => ({ start: k, count: 1, mean: u.a }));
  const first = (g: Group) => g.mean - ((g.count - 1) * minSep) / 2;
  const last = (g: Group) => g.mean + ((g.count - 1) * minSep) / 2;
  for (let merged = true; merged; ) {
    merged = false;
    for (let k = 0; k + 1 < groups.length; k++) {
      if (first(groups[k + 1]) - last(groups[k]) < minSep - 1e-9) {
        const a = groups[k], b = groups[k + 1];
        const count = a.count + b.count;
        const members = unrolled.slice(a.start, a.start + count).map((u) => u.a);
        groups.splice(k, 2, { start: a.start, count, mean: members.reduce((s, x) => s + x, 0) / count });
        merged = true;
        break;
      }
    }
  }
  const out = new Array<number>(n);
  for (const g of groups) for (let j = 0; j < g.count; j++) out[unrolled[g.start + j].i] = round3(first(g) + j * minSep);
  // Report each display angle on the same turn as its true angle, so callers can compare them directly.
  return out.map((d, i) => {
    const t = trueAngles[i];
    return round3(t + ((((d - t) % 360) + 540) % 360) - 180);
  });
}

// ── The drawing model (everything all renderers draw) ────────────────

export interface AstrologyWheelModel {
  colors: ResolvedAstrologyColors;
  signs: { sign: ZodiacSign; element: ZodiacElement; path: string; fill: string; glyph: string; glyphPos: { x: number; y: number }; divider: { x1: number; y1: number; x2: number; y2: number } }[];
  /** One path with every degree tick (1°, 5°, 10°). */
  tickPath: string;
  cusps: { house: number; x1: number; y1: number; x2: number; y2: number }[];
  houseNumbers: { house: number; x: number; y: number }[];
  axes: { key: "AC" | "DC" | "MC" | "IC"; x1: number; y1: number; x2: number; y2: number; label: { x: number; y: number } }[];
  planets: {
    body: AstrologyBodyName;
    glyph: string;
    trueAngle: number;
    displayAngle: number;
    tick: { x1: number; y1: number; x2: number; y2: number };
    connector: { x1: number; y1: number; x2: number; y2: number } | null;
    pos: { x: number; y: number };
    retrograde: boolean;
    retroPos: { x: number; y: number };
  }[];
  aspects: { bodyA: AstrologyBodyName; bodyB: AstrologyBodyName; type: AspectType; orb: number; x1: number; y1: number; x2: number; y2: number; color: string; width: number; opacity: number; dash?: string }[];
}

function line(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function degreeTickPath(ascLon: number): string {
  const R = ASTRO_RINGS;
  const parts: string[] = [];
  for (let deg = 0; deg < 360; deg++) {
    if (deg % 30 === 0) continue; // sign boundaries are drawn as dividers across the band
    const len = deg % 10 === 0 ? R.tick10 : deg % 5 === 0 ? R.tick5 : R.tick1;
    const a = astroScreenAngle(deg, ascLon);
    const p = astroPolar(a, R.bandInner), q = astroPolar(a, R.bandInner - len);
    parts.push(`M${p.x} ${p.y}L${q.x} ${q.y}`);
  }
  return parts.join("");
}

export function buildAstrologyModel(chart: AstrologyChart, colors: ResolvedAstrologyColors): AstrologyWheelModel {
  const R = ASTRO_RINGS;
  const asc = chart.angles.ascendant.longitude;
  const ang = (lon: number) => astroScreenAngle(lon, asc);

  const signs = SIGNS.map((sign, i) => {
    const a1 = ang(i * 30), a2 = ang(i * 30 + 30), mid = ang(i * 30 + 15);
    const element = ZODIAC_ELEMENT[sign];
    return {
      sign,
      element,
      path: astroWedgePath(a1, a2, R.outer, R.bandInner),
      fill: colors.elements[element],
      glyph: ZODIAC_GLYPH[sign],
      glyphPos: astroPolar(mid, (R.outer + R.bandInner) / 2),
      divider: line(astroPolar(a1, R.bandInner), astroPolar(a1, R.outer)),
    };
  });

  const cuspList = chart.houses.cusps;
  const cusps = cuspList.map((c) => ({ house: c.house, ...line(astroPolar(ang(c.longitude), R.aspect), astroPolar(ang(c.longitude), R.bandInner)) }));
  const houseNumbers = cuspList.map((c, i) => {
    const next = cuspList[(i + 1) % cuspList.length].longitude;
    const span = (((next - c.longitude) % 360) + 360) % 360;
    return { house: c.house, ...astroPolar(ang(c.longitude + span / 2), R.houseNumber) };
  });

  const axisDefs: [AstrologyWheelModel["axes"][number]["key"], number][] = [
    ["AC", chart.angles.ascendant.longitude],
    ["DC", chart.angles.descendant.longitude],
    ["MC", chart.angles.mc.longitude],
    ["IC", chart.angles.ic.longitude],
  ];
  const axes = axisDefs.map(([key, lon]) => {
    const a = ang(lon);
    const rad = (a * Math.PI) / 180;
    // Half the label's extent along the axis direction: ~2 letters wide horizontally, one line tall vertically.
    const halfW = ASTRO_TYPE.angleLabel * 0.72, halfH = ASTRO_TYPE.angleLabel * 0.42;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const halfAlong = Math.abs(cos) * halfW + Math.abs(sin) * halfH;
    const halfAcross = Math.abs(sin) * halfW + Math.abs(cos) * halfH;
    const axis = line(astroPolar(a, R.aspect), astroPolar(a, R.axisOuter));
    const along = R.axisOuter + R.angleLabelGap + halfAlong;
    // Past the line's end when that stays inside the view; otherwise (axes near horizontal reach the view's edge) beside the line's end — above it for a horizontal axis, right of it for a vertical one.
    if (along + halfAlong <= ASTRO_VIEW / 2 - 0.4) return { key, ...axis, label: astroPolar(a, along) };
    const p = astroPolar(a, ASTRO_VIEW / 2 - 0.6 - halfAlong);
    let nx = -sin, ny = -cos; // screen-space unit perpendicular
    if (Math.abs(cos) >= Math.abs(sin) ? ny > 0 : nx < 0) { nx = -nx; ny = -ny; }
    const off = halfAcross + R.angleLabelGap;
    return { key, ...axis, label: { x: round3(p.x + nx * off), y: round3(p.y + ny * off) } };
  });

  const trueAngles = chart.placements.map((p) => ang(p.longitude));
  const display = spreadPlanetAngles(trueAngles);
  const planets = chart.placements.map((p, i) => {
    const t = trueAngles[i], d = display[i];
    const displaced = Math.abs(d - t) > 0.5;
    const pos = astroPolar(d, R.planetTrack);
    return {
      body: p.body,
      glyph: PLANET_GLYPH[p.body],
      trueAngle: round3(t),
      displayAngle: d,
      tick: line(astroPolar(t, R.trueTickOuter), astroPolar(t, R.trueTickInner)),
      connector: displaced ? line(astroPolar(t, R.trueTickInner), astroPolar(d, R.connectorInner)) : null,
      pos,
      retrograde: p.retrograde,
      retroPos: astroPolar(d - 3.4, R.planetTrack - 4.6),
    };
  });

  const trueByBody = new Map(chart.placements.map((p) => [p.body, ang(p.longitude)]));
  const aspects = chart.aspects
    .filter((a) => ASPECT_META[a.type].drawnInWheel && trueByBody.has(a.bodyA) && trueByBody.has(a.bodyB))
    .map((a) => {
      const s = isNodeAxis(a) ? aspectStroke(a.type, ASPECT_META[a.type].orb / 2) : aspectStroke(a.type, a.orb);
      return {
        bodyA: a.bodyA,
        bodyB: a.bodyB,
        type: a.type,
        orb: a.orb,
        ...line(astroPolar(trueByBody.get(a.bodyA)!, R.aspect), astroPolar(trueByBody.get(a.bodyB)!, R.aspect)),
        color: colors.aspects[a.type],
        width: s.width,
        opacity: s.opacity,
        dash: ASPECT_META[a.type].dash,
      };
    });

  return { colors, signs, tickPath: degreeTickPath(asc), cusps, houseNumbers, axes, planets, aspects };
}

/** Where a 10 × 10 vector glyph goes so it's centered on (x, y) at `size` view units: translate + scale for react-pdf's G. */
export function vectorGlyphTransform(x: number, y: number, size: number): string {
  return `translate(${round3(x - size / 2)} ${round3(y - size / 2)}) scale(${round3(size / 10)})`;
}

/** House system names as readings show them (the stored id → label). */
export const HOUSE_SYSTEM_LABEL: Record<"placidus" | "whole" | "equal", string> = {
  placidus: "Placidus",
  whole: "Whole Sign",
  equal: "Equal",
};
