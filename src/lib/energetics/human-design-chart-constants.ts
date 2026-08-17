import type { CenterKey } from "./human-design-data";
import { GATE_POINT } from "./human-design-chart-layout";

/**
 * Shared BodyGraph rendering constants + pure geometry — extracted
 * 2026-08-10 so the PDF renderer (reading-pdf-document.tsx) can reuse the
 * EXACT same colors/math the validated web renderer
 * (human-design-chart.tsx) uses, instead of hand-copying hex strings that
 * could silently drift out of sync between the two, or re-deriving
 * geometry that's already been tuned against real data.
 *
 * 2026-08-17 — rewritten alongside the Astrolo geometry port (see
 * human-design-chart-layout.ts's header). Two real changes:
 *
 *  1. The old per-gate/per-channel geometry helpers (shapePoints,
 *     channelStripPoints, STUB_LENGTH*, JUNCTION_GATES) are gone. They
 *     existed to compute channel/center shapes from scratch (straight
 *     line -> perpendicular-offset rectangle; center shape type -> polygon
 *     formula). Centers and channel spines are now real ported vector
 *     paths (CENTER_LAYOUT/GATE_SPINE in human-design-chart-layout.ts)
 *     drawn directly as stroked/filled <path>s, so there's no longer
 *     anything to compute for them.
 *
 *  2. Every visual-weight constant below (marker radius, font sizes,
 *     stroke widths, label-declutter spacing) is rescaled ~2.4x from its
 *     old value — the ported geometry lives in Astrolo's own native
 *     240x320-ish coordinate space instead of this app's old 0-100 space,
 *     and 2.4x is that space's real growth factor (new viewBox width 200
 *     / old viewBox width 84). Where the rescaled value landed close to
 *     one of Astrolo's own real authored weights (channel stroke ~5.5 vs
 *     Astrolo's own StrokeThickness=5; gate marker ~4.5 vs Astrolo's own
 *     6.5-diameter/3.25-radius gate button), that's a real independent
 *     cross-check that the rescale is right, not a coincidence to worry
 *     about.
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
 * Channel-spine colors — real hex values reverse-derived 2026-08-10 from
 * Bodygraph's own real SVG fill values for personality-N/design-N
 * elements, not invented. Used for every gate's own spine stroke
 * (GATE_SPINE in human-design-chart-layout.ts) when that gate is
 * Personality-only, Design-only, or (split via CHANNEL_DASH_MIDPOINT
 * below) both.
 */
export const HANGING_PERSONALITY = "#654422"; // brown
export const HANGING_DESIGN = "#e4b54b"; // gold

/**
 * Visual weights — see header comment for the ~2.4x rescale this session
 * (old 0-100-ish space -> Astrolo's native ~200x320 space).
 *
 * 2026-08-17 correction pass — GATE_MARKER_R (and everything scaled off
 * it) was too big for the real ported gate spacing, not a guess: computed
 * the real nearest-neighbor distance between every pair of gates sharing
 * a center directly from GATE_POINT (human-design-chart-layout.ts) —
 * global minimum 7.88 units (gates 19/52, Root), Throat's tightest pair
 * (35/56) at 7.96. At the old R=4.5, two simultaneously-active neighbors
 * need 2*4.5=9.0 units clear — more than either real minimum, so any
 * busy center with 2+ adjacent activations collided by construction,
 * independent of declutter. Astrolo's own native gate buttons are
 * MinWidth/MinHeight=6.5 (radius 3.25) in this exact same coordinate
 * space and don't collide at their real authored positions — real
 * evidence the geometry itself is fine at that scale. R brought down to
 * 3.4 (2*3.4=6.8, clears the 7.88 global minimum with ~1.1 units to
 * spare), everything derived from it scaled down to match.
 */
export const CHANNEL_STROKE_WIDTH = 5.5; // an active (Personality/Design/Both) gate spine — real "fillable pipe" weight, not a thin wire
export const CHANNEL_STROKE_WIDTH_RECESSIVE = 1.1; // an inactive gate's own spine, drawn faint — still the real geometry, just recessive (matches Astrolo's own ZIndex=0/Background-color treatment for ActivationState=None)
export const CHANNEL_STROKE_OPACITY_RECESSIVE = 0.55;
export const CENTER_STROKE_WIDTH = 1.2;
export const GATE_MARKER_STROKE_WIDTH = 0.6;
/**
 * Single activated-gate marker circle radius — used for EVERY activated
 * gate, dual included. Real cross-check for the value: Astrolo's own
 * native gate buttons are radius 3.25 in this same coordinate space.
 *
 * Dual (Personality + Design) marker color, 2026-08-17 correction-pass-4:
 * a plain flat circle like every other gate, Design as the single color
 * — see GateSpine's/the activated-gate render block's own comment. Two
 * earlier passes tried a two-offset-circles treatment, then a same-size
 * split-circle treatment; both were real attempts at showing dual state
 * visually at the marker, but her direct, explicit follow-up was "one
 * color the same way the other gates are" — no more visual distinction
 * at the marker level. The real P/D split is still visible on the
 * gate's own channel spine, unchanged.
 */
export const GATE_MARKER_R = 3.4;
export const FONT_SIZE_ACTIVE = 3.7;
export const FONT_SIZE_INACTIVE = 4.5;
/** Half-footprint of a plain inactive gate-number text label — used only to keep an active gate's marker from landing on top of a NEARBY inactive gate's printed number (see declutterGateLabels below). Not a circle radius; inactive gates have no marker, just this much text. */
const INACTIVE_LABEL_HALF_WIDTH = 2.4;

/**
 * Collision avoidance for activated-gate labels — pure math, no JSX.
 *
 * 2026-08-17 correction-pass-3: no more per-gate `dual` bonus at all.
 * Correction-pass-1/2 gave dual-activated gates extra declutter room
 * because their old rendering (two small offset circles) had a bigger
 * real footprint than a single marker. Now that dual gates render as one
 * GATE_MARKER_R circle like every other gate (see halfCirclePath above),
 * a dual gate's footprint is IDENTICAL to a single gate's — there's
 * nothing left to give it extra room for. Root's own tighter real
 * packing (measured directly from GATE_POINT: worst pairs 19-52 at 7.88,
 * 53-54 at 8.06, 52-60 at 8.90, 53-60 at 9.00, all tighter than every
 * other center's worst pair at 7.96) is still real, but MIN_GAP below
 * already clears it for same-size markers with margin — no center-
 * specific case needed anymore either.
 */
export function declutterGateLabels(gates: number[]): Map<number, { x: number; y: number }> {
  const activeSet = new Set(gates);
  const inactivePoints = Object.keys(GATE_POINT)
    .map(Number)
    .filter((g) => !activeSet.has(g))
    .map((g) => GATE_POINT[g]);
  const pts = gates.map((gate) => ({ gate, ...GATE_POINT[gate] }));
  const MIN_GAP = 7.2; // base clearance two label circles need at this font size — just under the real global-minimum gate spacing (7.88), so it's a no-op for ordinary already-clear pairs
  const INACTIVE_GAP = GATE_MARKER_R + INACTIVE_LABEL_HALF_WIDTH; // an active marker vs. a fixed inactive gate's plain text
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist < MIN_GAP) {
          const push = (MIN_GAP - dist) / 2;
          const ux = dist ? dx / dist : 1;
          const uy = dist ? dy / dist : 0;
          pts[i].x -= ux * push;
          pts[i].y -= uy * push;
          pts[j].x += ux * push;
          pts[j].y += uy * push;
        }
      }
      // One-sided repulsion from every fixed inactive gate position —
      // only the active point (pts[i]) moves, the inactive point never
      // does (it's real background reference geometry, not part of the
      // declutter problem).
      for (const inactive of inactivePoints) {
        const dx = pts[i].x - inactive.x;
        const dy = pts[i].y - inactive.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist < INACTIVE_GAP) {
          const push = INACTIVE_GAP - dist;
          const ux = dist ? dx / dist : 1;
          const uy = dist ? dy / dist : 0;
          pts[i].x += ux * push;
          pts[i].y += uy * push;
        }
      }
    }
  }
  return new Map(pts.map((p) => [p.gate, { x: p.x, y: p.y }]));
}

// ── Path-length math for the dual (Personality + Design) split overlay ──
//
// A dual-activated gate's own spine needs to render as two colors along
// its length (personality nearer the gate, design farther toward the
// partner — same convention this app already established). The ported
// GATE_SPINE paths are a mix of straight segments and real cubic Bézier
// curves (the 10/20/34/57 junction cluster, plus several other gates —
// confirmed by inspecting Astrolo's own source, not assumed to be just
// the 4 junction gates), so the split can't be computed with simple
// straight-line midpoint math the way the old channelStripPoints
// approach did. Instead: measure the spine's real length (straight
// segments exactly, Bézier segments via dense sampling — accurate to a
// fraction of a percent, plenty for a visual split), then use
// `strokeDasharray` to paint only the first half of the SAME path data in
// the overlay color — works identically for straight and curved spines,
// no separate geometry needed.

type PathCmd = { cmd: "M" | "L" | "H" | "V" | "C"; args: number[] };

function parseSpine(d: string): PathCmd[] {
  const tokens = d.match(/[MmLlHhVvCc]|-?\d+\.?\d*(?:[eE][-+]?\d+)?/g) ?? [];
  const cmds: PathCmd[] = [];
  let i = 0;
  let cur: string | null = null;
  let x = 0;
  let y = 0;
  const isLetter = (t: string) => /^[MmLlHhVvCc]$/.test(t);
  while (i < tokens.length) {
    const t = tokens[i];
    if (isLetter(t)) {
      cur = t;
      i += 1;
      continue;
    }
    if (!cur) break;
    if (cur === "M" || cur === "m") {
      const nx = Number(tokens[i]);
      const ny = Number(tokens[i + 1]);
      x = cur === "m" ? x + nx : nx;
      y = cur === "m" ? y + ny : ny;
      cmds.push({ cmd: "M", args: [x, y] });
      i += 2;
      cur = cur === "m" ? "l" : "L"; // subsequent bare coordinate pairs are implicit lineto
    } else if (cur === "L" || cur === "l") {
      const nx = Number(tokens[i]);
      const ny = Number(tokens[i + 1]);
      x = cur === "l" ? x + nx : nx;
      y = cur === "l" ? y + ny : ny;
      cmds.push({ cmd: "L", args: [x, y] });
      i += 2;
    } else if (cur === "V" || cur === "v") {
      const ny = Number(tokens[i]);
      y = cur === "v" ? y + ny : ny;
      cmds.push({ cmd: "V", args: [x, y] });
      i += 1;
    } else if (cur === "H" || cur === "h") {
      const nx = Number(tokens[i]);
      x = cur === "h" ? x + nx : nx;
      cmds.push({ cmd: "H", args: [x, y] });
      i += 1;
    } else if (cur === "C" || cur === "c") {
      const v = [0, 1, 2, 3, 4, 5].map((k) => Number(tokens[i + k]));
      const [x1, y1, x2, y2, ex, ey] =
        cur === "c" ? [x + v[0], y + v[1], x + v[2], y + v[3], x + v[4], y + v[5]] : v;
      cmds.push({ cmd: "C", args: [x, y, x1, y1, x2, y2, ex, ey] });
      x = ex;
      y = ey;
      i += 6;
    } else {
      i += 1;
    }
  }
  return cmds;
}

function cubicPoint(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, t: number) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const dd = t * t * t;
  return { x: a * x0 + b * x1 + c * x2 + dd * x3, y: a * y0 + b * y1 + c * y2 + dd * y3 };
}

/** Real total length of a GATE_SPINE path — straight segments exact, Bézier segments sampled (24 steps, sub-percent accurate). */
export function spineLength(d: string): number {
  const cmds = parseSpine(d);
  let length = 0;
  let px = 0;
  let py = 0;
  for (const c of cmds) {
    if (c.cmd === "M") {
      [px, py] = c.args;
    } else if (c.cmd === "L" || c.cmd === "V" || c.cmd === "H") {
      const [nx, ny] = c.args;
      length += Math.hypot(nx - px, ny - py);
      px = nx;
      py = ny;
    } else if (c.cmd === "C") {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = c.args;
      const STEPS = 24;
      let prev = { x: x0, y: y0 };
      for (let s = 1; s <= STEPS; s++) {
        const p = cubicPoint(x0, y0, x1, y1, x2, y2, x3, y3, s / STEPS);
        length += Math.hypot(p.x - prev.x, p.y - prev.y);
        prev = p;
      }
      px = x3;
      py = y3;
    }
  }
  return length;
}

/** `strokeDasharray` value that paints exactly the first half of a spine — the personality-nearer-the-gate portion of a dual-activated gate's split overlay. */
export function halfSplitDasharray(d: string): string {
  const len = spineLength(d);
  return `${(len / 2).toFixed(2)} ${len.toFixed(2)}`;
}
