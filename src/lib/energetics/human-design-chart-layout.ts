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

export const CENTER_LAYOUT: Record<CenterKey, CenterLayout> = {
  head: { center: "head", shape: "triangle-up", x: 50, y: 2, size: 6.5 },
  ajna: { center: "ajna", shape: "triangle-down", x: 50, y: 19, size: 6.5 },
  throat: { center: "throat", shape: "square", x: 50, y: 33, size: 6 },
  g: { center: "g", shape: "octagram", x: 50, y: 51, size: 8 },
  heart: { center: "heart", shape: "triangle-heart", x: 62, y: 57, size: 5 },
  spleen: { center: "spleen", shape: "triangle-right", x: 30, y: 72, size: 8.2 },
  solarplexus: { center: "solarplexus", shape: "triangle-left", x: 70, y: 72, size: 8.2 },
  sacral: { center: "sacral", shape: "square", x: 50, y: 72, size: 6 },
  root: { center: "root", shape: "square", x: 50, y: 89, size: 6 },
};

/** [gate, offsetX, offsetY] — offset is a multiplier of the center's own `size`, applied from its x/y. */
const GATE_OFFSETS: Record<CenterKey, readonly [number, number, number][]> = {
  head: [[64, -0.6, 0.85], [61, 0, 0.85], [63, 0.6, 0.85]],
  ajna: [[47, -0.6, -0.85], [24, 0, -0.85], [4, 0.6, -0.85], [17, -0.35, -0.35], [11, 0.35, -0.35], [43, 0, 0.15]],
  throat: [
    [62, -0.5, -0.85], [23, 0, -0.85], [56, 0.5, -0.85],
    [16, -0.8, -0.25], [35, 0.8, -0.45], [20, -0.8, 0.5], [12, 0.8, 0], [45, 0.8, 0.45],
    [31, -0.5, 0.85], [8, 0, 0.85], [33, 0.5, 0.85],
  ],
  g: [[1, 0, -0.8], [7, -0.55, -0.55], [13, 0.55, -0.55], [10, -0.75, 0], [25, 0.75, 0], [15, -0.55, 0.55], [46, 0.55, 0.55], [2, 0, 0.8]],
  heart: [[21, 0, -0.15], [51, -0.28, 0.28], [26, -0.6, 0.75], [40, 0.6, 0.8]],
  spleen: [[48, -0.85, -0.75], [57, -0.5, -0.5], [44, -0.1, -0.25], [50, 0.25, 0], [32, -0.1, 0.25], [28, -0.5, 0.5], [18, -0.85, 0.75]],
  solarplexus: [[36, 0.85, -0.75], [22, 0.5, -0.5], [37, 0.1, -0.25], [6, -0.25, 0], [49, 0.1, 0.25], [55, 0.5, 0.5], [30, 0.85, 0.75]],
  sacral: [[5, -0.5, -0.8], [14, 0, -0.8], [29, 0.5, -0.8], [34, -0.8, -0.3], [27, -0.8, 0.3], [59, 0.8, 0.3], [42, -0.5, 0.8], [3, 0, 0.8], [9, 0.5, 0.8]],
  root: [[53, -0.5, -0.8], [60, 0, -0.8], [52, 0.5, -0.8], [54, -0.8, -0.3], [38, -0.8, 0.2], [58, -0.8, 0.7], [19, 0.8, -0.3], [39, 0.8, 0.2], [41, 0.8, 0.7]],
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
