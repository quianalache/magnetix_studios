import type { AstrologyPlacement, AspectType, ZodiacSign } from "./astrology";

/**
 * Shared pure geometry/color constants for the Astrology natal wheel —
 * same extraction pattern human-design-chart-constants.ts already
 * established for Human Design: both astrology-wheel-chart.tsx (the real
 * DOM/SVG web component) and reading-pdf-document.tsx's AstrologyWheelPdf
 * (react-pdf) import from here, so the two renderers use the exact same
 * layout numbers and colors and can't quietly drift apart the way two
 * hand-maintained copies could. No "server-only" import anywhere in this
 * file or its dependency chain (astrology.ts's types are imported with
 * `import type`, erased at compile time) — safe for client bundling.
 *
 * 2026-08-10 visual-polish pass. Audited against a real Bodygraph
 * astrology-chart reference (its own Chart Designs preview, inspected
 * during an earlier session's live audit) and our own prior
 * implementation. What the reference does that ours didn't: fill each
 * zodiac sign's wedge with a distinct color (ours was outline-only),
 * shade the house ring so it visually separates from the center aspect
 * zone (ours had no boundary there at all), and label all 4 angles —
 * As/Ds/Mc/Ic (ours only had AC/MC). All three fixed below/in the two
 * consuming files. Sign colors are original picks for this app, grouped
 * by element (fire/earth/air/water) with a shared lightness so no one
 * sign visually dominates the ring — not sampled or copied from
 * Bodygraph's own palette, same "don't copy proprietary chart assets"
 * rule that governed the original HD Chart Designs audit.
 */

export const WHEEL_LINE = "#a1a1aa"; // zinc-400 — ring/cusp line color, unchanged from before this pass
export const WHEEL_TEXT = "#3f3f46"; // zinc-700 — sign glyph / house number ink, unchanged from before this pass
export const RETRO_COLOR = "#dc2626";
/** Subtle warm off-white behind the house ring (between the sign ring's inner edge and the new aspect-zone boundary) — gives the wheel real 3-ring hierarchy (sign ring / house ring / aspect zone) instead of everything sitting on one flat white field. */
export const HOUSE_RING_FILL = "#faf9f7";

export const SIGN_COLORS: Record<ZodiacSign, string> = {
  Aries: "#e8b4a8",
  Leo: "#e8a87c",
  Sagittarius: "#d98c70",
  Taurus: "#a8c090",
  Virgo: "#8fa876",
  Capricorn: "#7d9468",
  Gemini: "#a8bfe8",
  Libra: "#8faedb",
  Aquarius: "#7b9bcc",
  Cancer: "#9dc9c4",
  Scorpio: "#7fb3ad",
  Pisces: "#6b9e98",
};

export const ASPECT_STYLE: Record<AspectType, { stroke: string; dash?: string } | null> = {
  Conjunction: null, // bodies already sit right next to each other on the ring — a line adds nothing
  Sextile: { stroke: "#0d9488" },
  Square: { stroke: "#dc2626" },
  Trine: { stroke: "#2563eb" },
  Opposition: { stroke: "#dc2626", dash: "1.5,1.2" },
};

export const CX = 50;
export const CY = 50;
export const SIGN_RING_OUTER = 47;
export const SIGN_RING_INNER = 40;
/** Inner edge of the house ring AND the radius of the aspect-zone boundary circle (new this pass) — a house cusp line runs from here out to SIGN_RING_INNER; the same radius closes the circle that visually separates the house ring from the center aspect zone. */
export const HOUSE_LINE_INNER = 10;
export const HOUSE_LABEL_R = 15;
export const ANGLE_LABEL_R = SIGN_RING_OUTER + 3;
export const PLANET_R_A = 33;
export const PLANET_R_B = 29;
export const MIN_SEPARATION_DEG = 7;

export function toXY(screenAngleDeg: number, r: number): { x: number; y: number } {
  const rad = (screenAngleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

/** Ascendant fixed at 9 o'clock (180°); every other longitude plotted at its true offset from it — standard, generic chart-wheel convention, not sourced from any one tool. */
export function screenAngle(longitude: number, ascLongitude: number): number {
  return 180 + (longitude - ascLongitude);
}

/**
 * An annular-sector (donut-slice) path for one zodiac sign's filled wedge,
 * between rInner and rOuter, sweeping from angle a1 to a2 (a2 = a1 + 30,
 * always a minor/small arc so the large-arc-flag is always 0). Same `d`
 * string syntax works unmodified in both a real SVG `<path>` (web) and
 * react-pdf's `<Path>` (PDF) — same technique already proven by the
 * Mandala's dual-activation split-dot paths.
 */
export function wedgePath(a1: number, a2: number, rOuter: number, rInner: number): string {
  const o1 = toXY(a1, rOuter);
  const o2 = toXY(a2, rOuter);
  const i1 = toXY(a1, rInner);
  const i2 = toXY(a2, rInner);
  return `M ${o1.x} ${o1.y} A ${rOuter} ${rOuter} 0 0 0 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${rInner} ${rInner} 0 0 1 ${i1.x} ${i1.y} Z`;
}

/**
 * Declutter: sort by longitude, nudge anything within MIN_SEPARATION_DEG
 * of the previous body forward so glyphs don't collide. Alternates the
 * plotted radius too, so even a nudged pair stays visually distinct.
 * Identical logic previously hand-duplicated in both consuming files;
 * extracted here so a future tweak can't accidentally apply to only one
 * of them.
 */
export function plotPlacements(
  placements: AstrologyPlacement[],
  ascLon: number,
): Map<string, { angle: number; r: number }> {
  const sorted = [...placements].sort((a, b) => a.longitude - b.longitude);
  const plotted = new Map<string, { angle: number; r: number }>();
  let lastAngle: number | null = null;
  sorted.forEach((p, i) => {
    let angle = screenAngle(p.longitude, ascLon);
    if (lastAngle !== null) {
      const gap = ((angle - lastAngle + 540) % 360) - 180; // signed shortest gap, handles wraparound
      if (Math.abs(gap) < MIN_SEPARATION_DEG && gap >= 0) {
        angle = lastAngle + MIN_SEPARATION_DEG;
      }
    }
    lastAngle = angle;
    plotted.set(p.body, { angle, r: i % 2 === 0 ? PLANET_R_A : PLANET_R_B });
  });
  return plotted;
}
