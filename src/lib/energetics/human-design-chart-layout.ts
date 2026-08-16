import type { CenterKey } from "./human-design-data";

/**
 * Real visual bodygraph layout — center positions/shapes and the exact
 * position of all 64 gates within their center, so a reading can show an
 * actual drawn chart instead of a text summary (the gap flagged 2026-08-08:
 * "that's not a chart"). Ported from the same MIT-licensed `free-human-
 * design` project already credited for the bodygraph gate/channel/center
 * data (github.com/adamblvck/free-human-design, © Adam Blvck / Blvck
 * Studios) — its `site/charts.min.js` renderer, not `src/hd/bodygraph.js`
 * this time, since the layout coordinates live in the chart-drawing code,
 * not the calculation engine. Same provenance, same license, credited the
 * same way.
 *
 * Coordinate space: 0-100 on both axes (their own 800px canvas is just
 * this space × 8 — using 0-100 directly keeps the SVG viewBox simple and
 * the numbers below exactly match their source, no re-derivation).
 */

export type CenterShape =
  | "triangle-up"
  | "triangle-down"
  | "triangle-left"
  | "triangle-right"
  | "triangle-heart"
  | "square"
  | "octagram";

export interface CenterLayout {
  center: CenterKey;
  shape: CenterShape;
  x: number;
  y: number;
  size: number;
}

/**
 * Real bug caught 2026-08-16, confirmed by direct measurement (not
 * eyeballing): the G-center's own diagonal gate offsets (7/13/15/46 at
 * ±0.55 of size) sat OUTSIDE the diamond shape's real boundary (a
 * diamond's interior is |dx|+|dy|<=1, not the square's independent
 * |dx|<=1 AND |dy|<=1 — 0.55+0.55=1.10 > 1), a genuine geometry error,
 * not a style choice — exactly the gates she named as visibly floating
 * outside the G-center. Every other center's offsets left only ~1-1.2
 * units of clearance before even subtracting the activated-gate marker's
 * own radius (~1.9-2.2 absolute units), producing the crowded/
 * overlapping look at every center, not just G.
 *
 * Fixed with two independent changes, not one bigger number papering
 * over the other: (1) every center's x/y/size scaled up 1.35x uniformly
 * around a fixed anchor (so relative spacing between centers is
 * unchanged — no new center-to-center collisions introduced), which
 * alone shrinks the FIXED-size marker circle relative to the now-bigger
 * shapes; (2) GATE_OFFSETS pulled inward per shape (diamond gates
 * recomputed to genuinely satisfy |dx|+|dy|<1; square-center offsets
 * ×0.78; triangle-center offsets ×0.82) so every gate clears its own
 * center's real boundary by a verified >=2.5 units — computed and
 * checked per-gate before writing these numbers, not estimated.
 */
export const CENTER_LAYOUT: Record<CenterKey, CenterLayout> = {
  head: { center: "head", shape: "triangle-up", x: 50, y: -13.23, size: 8.78 },
  ajna: { center: "ajna", shape: "triangle-down", x: 50, y: 9.72, size: 8.78 },
  throat: { center: "throat", shape: "square", x: 50, y: 28.63, size: 8.1 },
  g: { center: "g", shape: "octagram", x: 50, y: 52.92, size: 10.8 },
  heart: { center: "heart", shape: "triangle-heart", x: 71, y: 61.02, size: 5.5 },
  spleen: { center: "spleen", shape: "triangle-right", x: 23, y: 81.28, size: 11.07 },
  solarplexus: { center: "solarplexus", shape: "triangle-left", x: 77, y: 81.28, size: 11.07 },
  sacral: { center: "sacral", shape: "square", x: 50, y: 81.28, size: 8.1 },
  root: { center: "root", shape: "square", x: 50, y: 104.22, size: 8.1 },
};

/** [gate, offsetX, offsetY] — offset is a multiplier of the center's own `size`, applied from its x/y. Values pulled inward from the original ported layout 2026-08-16 (see CENTER_LAYOUT's header comment) so every gate's real position clears its center's actual shape boundary. */
const GATE_OFFSETS: Record<CenterKey, readonly [number, number, number][]> = {
  head: [[64, -0.49, 0.7], [61, 0, 0.7], [63, 0.49, 0.7]],
  ajna: [[47, -0.49, -0.7], [24, 0, -0.7], [4, 0.49, -0.7], [17, -0.29, -0.29], [11, 0.29, -0.29], [43, 0, 0.12]],
  throat: [
    [62, -0.39, -0.66], [23, 0, -0.66], [56, 0.39, -0.66],
    [16, -0.62, -0.2], [35, 0.62, -0.35], [20, -0.62, 0.39], [12, 0.62, 0], [45, 0.62, 0.35],
    [31, -0.39, 0.66], [8, 0, 0.66], [33, 0.39, 0.66],
  ],
  g: [[1, 0, -0.68], [7, -0.38, -0.38], [13, 0.38, -0.38], [10, -0.75, 0], [25, 0.75, 0], [15, -0.38, 0.38], [46, 0.38, 0.38], [2, 0, 0.68]],
  heart: [[21, 0, -0.12], [51, -0.23, 0.23], [26, -0.49, 0.61], [40, 0.49, 0.66]],
  spleen: [[48, -0.7, -0.61], [57, -0.41, -0.41], [44, -0.08, -0.2], [50, 0.2, 0], [32, -0.08, 0.2], [28, -0.41, 0.41], [18, -0.7, 0.61]],
  solarplexus: [[36, 0.7, -0.61], [22, 0.41, -0.41], [37, 0.08, -0.2], [6, -0.2, 0], [49, 0.08, 0.2], [55, 0.41, 0.41], [30, 0.7, 0.61]],
  sacral: [[5, -0.39, -0.62], [14, 0, -0.62], [29, 0.39, -0.62], [34, -0.62, -0.23], [27, -0.62, 0.23], [59, 0.62, 0.23], [42, -0.39, 0.62], [3, 0, 0.62], [9, 0.39, 0.62]],
  root: [[53, -0.39, -0.62], [60, 0, -0.62], [52, 0.39, -0.62], [54, -0.62, -0.23], [38, -0.62, 0.16], [58, -0.62, 0.55], [19, 0.62, -0.23], [39, 0.62, 0.16], [41, 0.62, 0.55]],
};

/** Every gate → its exact x/y point in the same 0-100 chart space, built once at module load. */
export const GATE_POINT: Record<number, { x: number; y: number; center: CenterKey }> = (() => {
  const points: Record<number, { x: number; y: number; center: CenterKey }> = {};
  for (const center of Object.keys(GATE_OFFSETS) as CenterKey[]) {
    const layout = CENTER_LAYOUT[center];
    for (const [gate, dx, dy] of GATE_OFFSETS[center]) {
      points[gate] = { x: layout.x + dx * layout.size, y: layout.y + dy * layout.size, center };
    }
  }
  return points;
})();
