import { CHANNELS, type CenterKey } from "./human-design-data";
import { GATE_POINT, type CenterShape } from "./human-design-chart-layout";

/**
 * Shared BodyGraph rendering constants + pure geometry — extracted
 * 2026-08-10 so the PDF renderer (reading-pdf-document.tsx) can reuse the
 * EXACT same colors/math the validated web renderer
 * (human-design-chart.tsx) uses, instead of hand-copying hex strings that
 * could silently drift out of sync between the two, or re-deriving
 * geometry that's already been tuned against real data.
 *
 * Every value/function here is an unmodified extraction from where it
 * originally lived directly inside human-design-chart.tsx — this file
 * changes nothing about what already renders, it just gives the PDF
 * renderer (and any other future non-DOM renderer) a real, single
 * source of truth to import from instead of a second hand-copy.
 *
 * The JSX-returning pieces (CenterShapeEl, HangingGateStub,
 * CompleteChannelHalf, the activated-gate marker circles) deliberately
 * stay in human-design-chart.tsx itself — they're DOM-SVG components,
 * and react-pdf needs its own Svg/Polygon/Circle/Line primitives instead;
 * only the pure colors and math that both renderers need identically
 * move here.
 */

export const DEFAULT_DEFINED_FILL = "#d4d4d8"; // zinc-300 — light gray
export const DEFINED_STROKE = "#52525b"; // zinc-600
export const UNDEFINED_FILL = "#ffffff";
export const UNDEFINED_STROKE = "#a1a1aa"; // zinc-400
export const INACTIVE_GATE_TEXT = "#a1a1aa"; // zinc-400 — subtle/recessive but still legible against white

/**
 * Traditional per-center colors — real defaults confirmed 2026-08-10
 * against the live Bodygraph chart-design tool's own "Enable Traditional
 * Centers Colors" toggle, not invented.
 */
export const TRADITIONAL_CENTER_COLORS: Record<CenterKey, string> = {
  head: "#e49e4b",
  ajna: "#a19a5c",
  throat: "#bf5a0f",
  g: "#e49e4b",
  heart: "#a23423",
  spleen: "#bf5a0f",
  sacral: "#a23423",
  solarplexus: "#bf5a0f",
  root: "#bf5a0f",
};

/**
 * Activated-gate markers — solid-filled circle with reversed white
 * number. Personality solid black; Design solid rust/brown.
 */
export const PERSONALITY_FILL = "#18181b"; // zinc-900
export const DESIGN_FILL = "#9a3412"; // rust/brown
export const ACTIVATED_TEXT = "#ffffff";

/**
 * Hanging-gate channel stub colors — real hex values reverse-derived
 *2026-08-10 from Bodygraph's own real SVG fill values for
 * personality-N/design-N elements, not invented.
 */
export const HANGING_PERSONALITY = "#654422"; // brown
export const HANGING_DESIGN = "#e4b54b"; // gold
/** Fixed absolute stub length (viewBox units), capped at 40% of the real gate-to-partner distance — see human-design-chart.tsx's own header comment for the full real-tuning history. */
export const STUB_LENGTH = 3.2;
export const STUB_LENGTH_CAP_FRACTION = 0.4;

/**
 * The "Community square" junction gates (10/20/34/57) — each belongs to
 * 3 of the 36 channels instead of 1, and Bodygraph's own renderer
 * suppresses the hanging-gate stub when two of a junction gate's channels
 * are both complete at once rather than picking one to point at. See
 * human-design-chart.tsx's own header comment for the full real
 * investigation this conservative treatment came from.
 */
function computeJunctionGates(): Set<number> {
  const channelCount = new Map<number, number>();
  for (const ch of CHANNELS) {
    channelCount.set(ch.gates[0], (channelCount.get(ch.gates[0]) ?? 0) + 1);
    channelCount.set(ch.gates[1], (channelCount.get(ch.gates[1]) ?? 0) + 1);
  }
  const junctions = new Set<number>();
  for (const [gate, count] of channelCount) {
    if (count > 1) junctions.add(gate);
  }
  return junctions;
}
export const JUNCTION_GATES = computeJunctionGates();

/**
 * Collision avoidance for activated-gate labels — pure math, no JSX. See
 * human-design-chart.tsx's own header comment for the full real-tuning
 * history (MIN_GAP/DUAL_BONUS retuned against her actual reading's real
 * crowded-center gate data, not guessed).
 */
export function declutterGateLabels(
  gates: number[],
  dualSet: Set<number>,
): Map<number, { x: number; y: number }> {
  const pts = gates.map((gate) => ({ gate, ...GATE_POINT[gate], dual: dualSet.has(gate) }));
  const MIN_GAP = 3.6; // base clearance two single-label circles need at this font size
  const DUAL_BONUS = 1.6; // a dual gate's own two offset labels need more room from its neighbors
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const gap = MIN_GAP + (pts[i].dual ? DUAL_BONUS : 0) + (pts[j].dual ? DUAL_BONUS : 0);
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist < gap) {
          const push = (gap - dist) / 2;
          const ux = dist ? dx / dist : 1;
          const uy = dist ? dy / dist : 0;
          pts[i].x -= ux * push;
          pts[i].y -= uy * push;
          pts[j].x += ux * push;
          pts[j].y += uy * push;
        }
      }
    }
  }
  return new Map(pts.map((p) => [p.gate, { x: p.x, y: p.y }]));
}

/**
 * Center shape geometry — pure string math. Reusable as-is by both DOM
 * `<polygon points="...">` and react-pdf's `<Polygon points="...">`,
 * which use the identical "x,y x,y ..." string format.
 */
export function shapePoints(shape: CenterShape | "diamond", cx: number, cy: number, r: number): string {
  switch (shape) {
    case "triangle-up":
      return `${cx},${cy - 0.9 * r} ${cx - r},${cy + r} ${cx + r},${cy + r}`;
    case "triangle-down":
      return `${cx},${cy + 0.9 * r} ${cx - r},${cy - r} ${cx + r},${cy - r}`;
    case "triangle-left":
      return `${cx - 0.9 * r},${cy} ${cx + r},${cy - r} ${cx + r},${cy + r}`;
    case "triangle-right":
      return `${cx + 0.9 * r},${cy} ${cx - r},${cy - r} ${cx - r},${cy + r}`;
    case "triangle-heart":
      return `${cx},${cy - 0.9 * r} ${cx - r},${cy + 0.9 * r} ${cx + 1.1 * r},${cy + r}`;
    // Standard 4-point diamond — the G / Identity center's real shape,
    // confirmed against every real Bodygraph chart compared so far.
    case "diamond":
      return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    case "octagram": {
      // No longer reachable for the G center — kept for CenterShape type
      // completeness, in case CENTER_LAYOUT data changes later.
      const pts: string[] = [];
      for (let s = 0; s < 16; s++) {
        const angle = -Math.PI / 2 + (s * Math.PI) / 8;
        const radius = s % 2 === 0 ? r : 0.72 * r;
        pts.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
      }
      return pts.join(" ");
    }
    default:
      return "";
  }
}
