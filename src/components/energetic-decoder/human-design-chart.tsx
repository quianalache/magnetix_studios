import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, CHANNELS } from "@/lib/energetics/human-design-data";
import { CENTER_LAYOUT, GATE_POINT, type CenterLayout, type CenterShape } from "@/lib/energetics/human-design-chart-layout";

/**
 * The actual drawn bodygraph — "that's not a chart" (2026-08-08), then
 * corrected on color the same day per her real-chart knowledge: open/
 * undefined centers are traditionally white, defined centers a plain
 * light gray — NOT branded to the sub-account's accent color, since she
 * wants per-chart color choice to eventually be its own control, not
 * silently tied to the portal's brand accent. Shipped the traditional
 * black/white/gray base first; the real color picker (`definedColor`
 * below) is the fast-follow flagged that day, built as Phase 4 of the
 * Report Builder initiative (2026-08-09).
 *
 * The chart itself always renders on a fixed white surface regardless of
 * the app's own light/dark theme — same as every real chart tool (a
 * printed chart doesn't flip to dark mode), which is also what makes
 * "white means undefined" mean anything: a white center against a white
 * page reads as blank, exactly the traditional convention.
 *
 * Personality activations render black, Design activations render red —
 * the one universally standard convention across every real Human Design
 * chart, unrelated to the center-fill color question above. Only the
 * DEFINED-center fill is customizable — undefined stays white and
 * Personality/Design stay black/red no matter what a sub-account picks.
 */

const DEFAULT_DEFINED_FILL = "#d4d4d8"; // zinc-300 — light gray
const DEFINED_STROKE = "#52525b"; // zinc-600
const UNDEFINED_FILL = "#ffffff";
const UNDEFINED_STROKE = "#a1a1aa"; // zinc-400
const PERSONALITY_TEXT = "#18181b";
const DESIGN_TEXT = "#dc2626";
const INACTIVE_GATE_TEXT = "#a1a1aa"; // zinc-400 — subtle/recessive but still legible against white

/**
 * Hanging-gate channel stubs — the "third visual state" investigated
 * 2026-08-10 by comparing 4 real Bodygraph charts (72 gate-level data
 * points) against our own activation data. A gate that's activated but
 * whose channel partner isn't still gets a short colored stub drawn
 * toward that partner, even though the channel itself never completes —
 * that's what was showing up as gold/brown segments on a Reflector chart
 * with zero defined channels. Verified rule, 70/72 direct matches:
 * Personality-only activation → stub is solid brown. Design-only → solid
 * gold. Dual (both P and D activate the same gate) → split, personality
 * half brown, design half gold. Complete channels get this same per-
 * endpoint coloring layered on top of the existing full defined-channel
 * line, not instead of it — confirmed against 2 real charts with
 * complete channels, not just the hanging-only Reflector case.
 *
 * Colors matched directly against Bodygraph's own real SVG fill values
 * for personality-N/design-N elements — not invented, not copied
 * artwork, just the two solid hex colors reverse-derived from comparing
 * our calculated activation data against their rendered output.
 */
const HANGING_PERSONALITY = "#654422"; // brown
const HANGING_DESIGN = "#e4b54b"; // gold
/**
 * Fixed absolute stub length (SVG viewBox units), not a fraction of the
 * gate-to-partner distance — real gap caught 2026-08-10 comparing the
 * first version against 4 real Bodygraph charts: a fraction-based stub
 * varies ~7x in visible length purely based on how far apart the two
 * centers happen to sit (a barely-visible nub between adjacent Head-
 * triangle gates 6 units apart, a long spike between distant Throat/
 * Solar Plexus gates 42 units apart). She asked for a "short" stub, which
 * means a consistent short mark regardless of channel span, not one that
 * scales with it. Capped at 40% of the real distance so it still stays
 * visually "partial" even on the closest gate pairs (e.g. the Head
 * triangle) rather than nearly reaching the partner.
 */
const STUB_LENGTH = 3.2;
const STUB_LENGTH_CAP_FRACTION = 0.4;

/**
 * The "Community square" — gates 10/20/34/57, each paired with the other
 * three (6 of the 36 channels: 10-20, 10-34, 10-57, 20-34, 20-57, 34-57).
 * Every other gate belongs to exactly one channel; these four belong to
 * three each. Real investigation 2026-08-10: when two of a junction
 * gate's channels are both complete at once, Bodygraph's own renderer
 * suppresses the hanging-gate stub entirely rather than picking one
 * channel to point it at (confirmed on a real chart with gates 10 and 57
 * each satisfying two complete channels simultaneously) — an ambiguous
 * case with no documented resolution, not something to guess at. Rather
 * than invent a rule Bodygraph itself doesn't expose, hanging-gate stubs
 * are skipped for all 6 of these channels; they keep only the existing,
 * already-correct full-channel line rendering, untouched.
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
const JUNCTION_GATES = computeJunctionGates();

/**
 * One end of a hanging-gate stub — renders nothing if this gate isn't
 * activated at all. Dual activation splits the short stub lengthwise,
 * personality half nearer the gate, design half farther toward the
 * partner; this ordering is a reasonable rendering choice (matching the
 * "personality is primary, design extends further" framing already used
 * for the activated-gate number offset above), not a measured match to
 * Bodygraph's own internal stub geometry, which we don't copy.
 */
function HangingGateStub({
  gate,
  toward,
  personalityActive,
  designActive,
}: {
  gate: { x: number; y: number };
  toward: { x: number; y: number };
  personalityActive: boolean;
  designActive: boolean;
}) {
  if (!personalityActive && !designActive) return null;
  const dx = toward.x - gate.x;
  const dy = toward.y - gate.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const length = Math.min(STUB_LENGTH, dist * STUB_LENGTH_CAP_FRACTION);
  const ux = dx / dist;
  const uy = dy / dist;
  const endX = gate.x + ux * length;
  const endY = gate.y + uy * length;

  if (personalityActive && designActive) {
    const midX = gate.x + ux * length * 0.5;
    const midY = gate.y + uy * length * 0.5;
    return (
      <>
        <line x1={gate.x} y1={gate.y} x2={midX} y2={midY} stroke={HANGING_PERSONALITY} strokeWidth={1.3} strokeLinecap="round" />
        <line x1={midX} y1={midY} x2={endX} y2={endY} stroke={HANGING_DESIGN} strokeWidth={1.3} strokeLinecap="round" />
      </>
    );
  }
  return (
    <line
      x1={gate.x}
      y1={gate.y}
      x2={endX}
      y2={endY}
      stroke={personalityActive ? HANGING_PERSONALITY : HANGING_DESIGN}
      strokeWidth={1.3}
      strokeLinecap="round"
    />
  );
}

/**
 * Real bug, found 2026-08-10 by her actually looking at a rendered chart:
 * "in the root center you have numbers overlapping." Root/Sacral/Throat
 * pack up to 11 gates into one small center, so two DIFFERENT activated
 * gates can sit close enough that their number labels collide — worse
 * when either gate is activated in both Personality AND Design, since
 * that gate already renders two offset labels of its own. Not a duplicate-
 * coordinate bug (verified — every gate has its own distinct point); the
 * points are correct, they're just closer together than two number labels
 * need. Same collision-avoidance technique already proven in
 * astrology-wheel-chart.tsx for crowded planet labels, ported here: only
 * the LABEL position gets nudged apart, never the true point (channel
 * lines and the "which center is this gate in" fact both keep using the
 * real, un-nudged GATE_POINT).
 *
 * First pass at these constants (MIN_GAP 2.8 / DUAL_BONUS 0.9) still left
 * real overlap — verified against her actual reading's real gate data
 * (not a synthetic sample this time), which has 3 dual-activated gates
 * packed into Root alone. Retuned larger (MIN_GAP 3.6 / DUAL_BONUS 1.6),
 * plus SELF_OFFSET below increased from 0.9→1.5 (a single dual gate's own
 * two labels were barely separated even before any cross-gate crowding)
 * and font/circle sized down slightly to give every number more real
 * breathing room. Re-verified visually against that same real data before
 * shipping — not just re-reading the math.
 */
function declutterGateLabels(
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

function shapePoints(shape: CenterShape, cx: number, cy: number, r: number): string {
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
    case "octagram": {
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

function CenterShapeEl({
  layout,
  defined,
  definedColor,
}: {
  layout: CenterLayout;
  defined: boolean;
  definedColor: string;
}) {
  const commonProps = {
    fill: defined ? definedColor : UNDEFINED_FILL,
    stroke: defined ? DEFINED_STROKE : UNDEFINED_STROKE,
    strokeWidth: 0.5,
  };
  if (layout.shape === "square") {
    const r = layout.size;
    return (
      <rect
        x={layout.x - r}
        y={layout.y - r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.25}
        {...commonProps}
      />
    );
  }
  return <polygon points={shapePoints(layout.shape, layout.x, layout.y, layout.size)} {...commonProps} />;
}

export function HumanDesignChart({
  profile,
  className,
  definedColor = DEFAULT_DEFINED_FILL,
  channelsColor = DEFINED_STROKE,
  gatesColor = "#e4e4e7",
  backgroundColor = "#ffffff",
}: {
  profile: HumanDesignProfile;
  className?: string;
  /** Sub-account's chosen defined-center color (Chart Designs tab) — falls back to the traditional light gray when not set. */
  definedColor?: string;
  /** Defined-channel line color. Undefined channels always stay the same faint gray regardless — only DEFINED lines are a brand choice, same rule as centers. */
  channelsColor?: string;
  /** Accent ring color behind each activated gate number. Personality (black) / Design (red) text itself stays fixed — universal convention, not a brand choice. */
  gatesColor?: string;
  backgroundColor?: string;
}) {
  const definedSet = new Set(profile.definedCenters);
  const definedChannelKeys = new Set(profile.definedChannels.map((c) => c.key));
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));
  const activatedGates = Object.keys(GATE_POINT)
    .map(Number)
    .filter((g) => personalityGates.has(g) || designGates.has(g));
  const dualGates = new Set(activatedGates.filter((g) => personalityGates.has(g) && designGates.has(g)));
  const labelPositions = declutterGateLabels(activatedGates, dualGates);

  return (
    <div className={className} style={{ background: backgroundColor, borderRadius: 12, padding: "6% 4%" }}>
      <svg viewBox="-4 -3 108 102" role="img" aria-label="Human Design bodygraph">
        {/* All 36 possible channels, faint — the full network structure, real gate-to-gate geometry.
            Hanging-gate stubs (added 2026-08-10, see HangingGateStub above) layer on top for any
            activated endpoint, on both hanging (isDefined false) and complete (isDefined true)
            channels alike — skipped entirely for the 4 "Community square" junction gates, see
            JUNCTION_GATES above. */}
        {CHANNELS.map((ch) => {
          const [gateA, gateB] = ch.gates;
          const a = GATE_POINT[gateA];
          const b = GATE_POINT[gateB];
          if (!a || !b) return null;
          const isDefined = definedChannelKeys.has(ch.key);
          const isJunctionChannel = JUNCTION_GATES.has(gateA) || JUNCTION_GATES.has(gateB);
          return (
            <g key={ch.key}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isDefined ? channelsColor : DEFAULT_DEFINED_FILL}
                strokeWidth={isDefined ? 1.1 : 0.35}
                strokeOpacity={isDefined ? 0.9 : 0.7}
              />
              {!isJunctionChannel && (
                <>
                  <HangingGateStub
                    gate={a}
                    toward={b}
                    personalityActive={personalityGates.has(gateA)}
                    designActive={designGates.has(gateA)}
                  />
                  <HangingGateStub
                    gate={b}
                    toward={a}
                    personalityActive={personalityGates.has(gateB)}
                    designActive={designGates.has(gateB)}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* 9 centers */}
        {CENTERS.map((c) => (
          <CenterShapeEl key={c} layout={CENTER_LAYOUT[c]} defined={definedSet.has(c)} definedColor={definedColor} />
        ))}

        {/* All 64 gate numbers — real gap found 2026-08-10 comparing our
            chart against Bodygraph's own rendered image: a real bodygraph
            always shows every gate number, faint for inactive, bold/colored
            for activated, so the full structure reads at a glance. Ours
            previously drew nothing at all for an inactive gate. Drawn at
            the TRUE GATE_POINT (not decluttered — that pass only exists to
            spread apart ACTIVATED labels, which need to stand out; inactive
            numbers are background reference info, and real bodygraphs
            themselves show them packed exactly this tightly in busy centers
            like Root/Throat, confirmed against a real Bodygraph screenshot).
            Rendered BEFORE the activated layer below so an activated gate's
            bold label always sits on top, never obscured by its own
            inactive-number sibling. */}
        {Object.entries(GATE_POINT).map(([gateStr, point]) => {
          const gate = Number(gateStr);
          if (personalityGates.has(gate) || designGates.has(gate)) return null;
          return (
            <text
              key={gate}
              x={point.x}
              y={point.y + 0.8}
              fontSize="1.9"
              fill={INACTIVE_GATE_TEXT}
              textAnchor="middle"
            >
              {gate}
            </text>
          );
        })}

        {/* Gate numbers — the activated ones, drawn bold/colored on top of
            the faint inactive layer above. A soft
            dot behind each marks it as "on" at a glance before you even read
            the number; Personality black, Design red, offset slightly when
            both. Position is the decluttered label point (declutterGateLabels
            above), not the true GATE_POINT — channel lines above still use
            the true point, so the network geometry itself never shifts, only
            the number labels nudge apart from each other when crowded. */}
        {activatedGates.map((gate) => {
          const point = labelPositions.get(gate)!;
          const inPersonality = personalityGates.has(gate);
          const inDesign = designGates.has(gate);
          return (
            <g key={gate}>
              <circle cx={point.x} cy={point.y} r={1.5} fill={backgroundColor} stroke={gatesColor} strokeWidth={0.3} />
              {inDesign && (
                <text
                  x={point.x + (inPersonality ? 1.5 : 0)}
                  y={point.y + (inPersonality ? 1.5 : 0) + 0.8}
                  fontSize="2.1"
                  fontWeight="700"
                  fill={DESIGN_TEXT}
                  textAnchor="middle"
                >
                  {gate}
                </text>
              )}
              {inPersonality && (
                <text
                  x={point.x - (inDesign ? 1.5 : 0)}
                  y={point.y - (inDesign ? 1.5 : 0) + 0.8}
                  fontSize="2.1"
                  fontWeight="700"
                  fill={PERSONALITY_TEXT}
                  textAnchor="middle"
                >
                  {gate}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
