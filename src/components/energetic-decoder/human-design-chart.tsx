import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, CHANNELS, type CenterKey } from "@/lib/energetics/human-design-data";
import { CENTER_LAYOUT, GATE_POINT, type CenterLayout, type CenterShape } from "@/lib/energetics/human-design-chart-layout";
import {
  DEFAULT_DEFINED_FILL,
  DEFINED_STROKE,
  UNDEFINED_FILL,
  UNDEFINED_STROKE,
  INACTIVE_GATE_TEXT,
  TRADITIONAL_CENTER_COLORS,
  PERSONALITY_FILL,
  DESIGN_FILL,
  ACTIVATED_TEXT,
  HANGING_PERSONALITY,
  HANGING_DESIGN,
  STUB_LENGTH,
  STUB_LENGTH_CAP_FRACTION,
  JUNCTION_GATES,
  declutterGateLabels,
  shapePoints,
} from "@/lib/energetics/human-design-chart-constants";

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
 * Personality activations render solid black, Design activations render
 * solid rust/brown — the standard convention across every real Human
 * Design chart, unrelated to the center-fill color question above. Only
 * the DEFINED-center fill is customizable — undefined stays white and
 * Personality/Design stay black/rust no matter what a sub-account picks.
 * (Activated-gate markers switched from outlined-ring + colored text to
 * solid-filled circle + reversed white text 2026-08-10 — see
 * PERSONALITY_FILL/DESIGN_FILL below — after comparing against real
 * Bodygraph renders, every one of which fills the circle solid.)
 */

/**
 * All the color constants, STUB_LENGTH*, JUNCTION_GATES, and the pure
 * declutterGateLabels/shapePoints math used below now live in
 * human-design-chart-constants.ts (extracted 2026-08-10, see that file's
 * own header) — reused as-is here via the import above, so the PDF
 * renderer (reading-pdf-document.tsx) can share the exact same values/
 * logic instead of a second hand-copy that could drift. Nothing about
 * their values or behavior changed; this file just imports them now
 * instead of declaring them locally.
 */

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
 * Two-tone Design/Personality rendering for a COMPLETE channel's line —
 * confirmed 2026-08-10 against the live Bodygraph chart-design tool
 * (Channels Colors section, real Design #e4b54b / Personality #654422
 * fields) and by zooming into a real rendered chart's actual channel
 * lines: a complete channel is NOT one uniform "defined" color end to
 * end, it's two segments meeting at the midpoint, each colored by that
 * end's own activation — brown for Personality, gold for Design, split
 * further if that one gate is dual-activated (same mechanic as
 * HangingGateStub's own dual split, just extended to the channel's true
 * midpoint instead of a short capped stub).
 *
 * Deliberately a separate function, not a HangingGateStub refactor —
 * her explicit instruction: "Hanging-gate stubs already use the correct
 * P/D logic and should remain unchanged." Same real brown/gold values,
 * same dual-split mechanic, just full-half-length instead of a short
 * stub, and never called for the same channel HangingGateStub is called
 * for (see the isDefined/twoTone branch below) — so the validated
 * hanging-stub component and its behavior are untouched, not just
 * "unmodified in source" but never even invoked differently at runtime.
 *
 * Only applies to complete, non-junction channels — junction channels
 * (the "Community square", see JUNCTION_GATES below) keep their
 * existing full-strength single-color line exactly as before, same
 * conservative treatment already established for hanging-gate stubs on
 * those 6 channels.
 */
function CompleteChannelHalf({
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
  const ux = dx / dist;
  const uy = dy / dist;
  const half = dist / 2;
  const endX = gate.x + ux * half;
  const endY = gate.y + uy * half;

  if (personalityActive && designActive) {
    const midX = gate.x + ux * half * 0.5;
    const midY = gate.y + uy * half * 0.5;
    return (
      <>
        <line x1={gate.x} y1={gate.y} x2={midX} y2={midY} stroke={HANGING_PERSONALITY} strokeWidth={1.1} strokeLinecap="round" />
        <line x1={midX} y1={midY} x2={endX} y2={endY} stroke={HANGING_DESIGN} strokeWidth={1.1} strokeLinecap="round" />
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
      strokeWidth={1.1}
      strokeLinecap="round"
    />
  );
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
  // G / Identity center renders as a standard diamond, not the 8-point
  // star CENTER_LAYOUT still declares (see shapePoints' "diamond" case
  // above for why the override lives here instead of in the layout data).
  const effectiveShape: CenterShape | "diamond" = layout.center === "g" ? "diamond" : layout.shape;
  return <polygon points={shapePoints(effectiveShape, layout.x, layout.y, layout.size)} {...commonProps} />;
}

export function HumanDesignChart({
  profile,
  className,
  definedColor = DEFAULT_DEFINED_FILL,
  channelsColor = DEFINED_STROKE,
  gatesColor = "#e4e4e7",
  backgroundColor = "#ffffff",
  centersMode = "uniform",
  centerColors,
}: {
  profile: HumanDesignProfile;
  className?: string;
  /** Sub-account's chosen defined-center color (Chart Designs tab) — falls back to the traditional light gray when not set. Used for every defined center in "uniform" mode (the default); ignored per-center in "traditional" mode except as a fallback for a missing centerColors entry. */
  definedColor?: string;
  /** Defined-channel line color. Undefined channels always stay the same faint gray regardless — only DEFINED lines are a brand choice, same rule as centers. */
  channelsColor?: string;
  /** Accent ring color around each activated gate's solid marker circle. The circle fill itself (Personality black / Design rust) and its reversed white number stay fixed — universal convention, not a brand choice. */
  gatesColor?: string;
  backgroundColor?: string;
  /** "uniform" (default, existing behavior) — every defined center fills with `definedColor`. "traditional" — each defined center uses its own real color, see TRADITIONAL_CENTER_COLORS above / `centerColors` below. */
  centersMode?: "uniform" | "traditional";
  /** Per-center colors for traditional mode. Falls back to TRADITIONAL_CENTER_COLORS (then definedColor) for any center not supplied, so traditional mode always renders correctly even with a partial or absent map. Ignored entirely in uniform mode. */
  centerColors?: Partial<Record<CenterKey, string>>;
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

  // Per-center resolved color — the only new logic this feature adds.
  // CenterShapeEl itself (shape/definition rendering) is completely
  // untouched below; it still just receives one resolved color string
  // per call, same as before this feature existed.
  const resolveCenterColor = (c: CenterKey): string =>
    centersMode === "traditional" ? (centerColors?.[c] ?? TRADITIONAL_CENTER_COLORS[c] ?? definedColor) : definedColor;

  return (
    <div className={className} style={{ background: backgroundColor, borderRadius: 12, padding: "6% 4%" }}>
      <svg viewBox="-4 -3 108 102" role="img" aria-label="Human Design bodygraph">
        {/* All 36 possible channels, faint — the full network structure, real gate-to-gate geometry.
            Complete, non-junction channels render as two-tone Design/Personality halves
            (CompleteChannelHalf above) instead of one flat channelsColor line — real behavior
            confirmed 2026-08-10 against the live Bodygraph chart-design tool. Hanging-gate stubs
            (HangingGateStub above) layer on top only for hanging (isDefined false) channels now —
            a complete channel's two-tone halves already fully represent both endpoints'
            activation, so the stub would just be a redundant same-color overdraw of the segment's
            first ~3 units. Junction channels ("Community square", see JUNCTION_GATES) keep the
            original flat-color line and no stubs at all, exactly as before. */}
        {CHANNELS.map((ch) => {
          const [gateA, gateB] = ch.gates;
          const a = GATE_POINT[gateA];
          const b = GATE_POINT[gateB];
          if (!a || !b) return null;
          const isDefined = definedChannelKeys.has(ch.key);
          const isJunctionChannel = JUNCTION_GATES.has(gateA) || JUNCTION_GATES.has(gateB);
          const twoTone = isDefined && !isJunctionChannel;
          return (
            <g key={ch.key}>
              {twoTone ? (
                <>
                  <CompleteChannelHalf
                    gate={a}
                    toward={b}
                    personalityActive={personalityGates.has(gateA)}
                    designActive={designGates.has(gateA)}
                  />
                  <CompleteChannelHalf
                    gate={b}
                    toward={a}
                    personalityActive={personalityGates.has(gateB)}
                    designActive={designGates.has(gateB)}
                  />
                </>
              ) : (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isDefined ? channelsColor : DEFAULT_DEFINED_FILL}
                  strokeWidth={isDefined ? 1.1 : 0.35}
                  strokeOpacity={isDefined ? 0.9 : 0.7}
                />
              )}
              {!isJunctionChannel && !twoTone && (
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
          <CenterShapeEl key={c} layout={CENTER_LAYOUT[c]} defined={definedSet.has(c)} definedColor={resolveCenterColor(c)} />
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

        {/* Gate numbers — the activated ones, drawn as solid-filled circles
            with reversed white text on top of the faint inactive layer
            above (see PERSONALITY_FILL/DESIGN_FILL above for why solid
            fill replaced the old outline-ring + colored-text version).
            Personality solid black, Design solid rust/brown, each ringed
            in the sub-account's own `gatesColor` accent (the "Gate accent"
            Chart Designs field — preserved here, just moved from being the
            ring's only visible color to an accent outline around the new
            solid fill). Dual activation renders as two separate offset
            circles (never one blended color) rather than collapsing to a
            single fill — same offset direction/magnitude the previous
            text-only version already used, now applied to a full filled
            circle + its own white number instead of bare colored text.
            Position is the decluttered label point (declutterGateLabels
            above), not the true GATE_POINT — channel lines above still use
            the true point, so the network geometry itself never shifts,
            only the number labels/circles nudge apart from each other
            when crowded. */}
        {activatedGates.map((gate) => {
          const point = labelPositions.get(gate)!;
          const inPersonality = personalityGates.has(gate);
          const inDesign = designGates.has(gate);
          const dual = inPersonality && inDesign;

          if (dual) {
            const OFFSET = 1.5;
            const R = 1.55;
            return (
              <g key={gate}>
                <circle cx={point.x + OFFSET} cy={point.y + OFFSET} r={R} fill={DESIGN_FILL} stroke={gatesColor} strokeWidth={0.35} />
                <text x={point.x + OFFSET} y={point.y + OFFSET + 0.6} fontSize="1.6" fontWeight="700" fill={ACTIVATED_TEXT} textAnchor="middle">
                  {gate}
                </text>
                <circle cx={point.x - OFFSET} cy={point.y - OFFSET} r={R} fill={PERSONALITY_FILL} stroke={gatesColor} strokeWidth={0.35} />
                <text x={point.x - OFFSET} y={point.y - OFFSET + 0.6} fontSize="1.6" fontWeight="700" fill={ACTIVATED_TEXT} textAnchor="middle">
                  {gate}
                </text>
              </g>
            );
          }

          const R = 1.9;
          const fill = inPersonality ? PERSONALITY_FILL : DESIGN_FILL;
          return (
            <g key={gate}>
              <circle cx={point.x} cy={point.y} r={R} fill={fill} stroke={gatesColor} strokeWidth={0.35} />
              <text x={point.x} y={point.y + 0.7} fontSize="2" fontWeight="700" fill={ACTIVATED_TEXT} textAnchor="middle">
                {gate}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
