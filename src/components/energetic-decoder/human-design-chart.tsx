import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, type CenterKey } from "@/lib/energetics/human-design-data";
import { CENTER_LAYOUT, GATE_POINT, GATE_SPINE, CHART_VIEWBOX, type CenterGeometry } from "@/lib/energetics/human-design-chart-layout";
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
  CHANNEL_STROKE_WIDTH,
  CHANNEL_STROKE_WIDTH_RECESSIVE,
  CHANNEL_STROKE_OPACITY_RECESSIVE,
  CENTER_STROKE_WIDTH,
  GATE_MARKER_STROKE_WIDTH,
  GATE_MARKER_R,
  FONT_SIZE_ACTIVE,
  FONT_SIZE_INACTIVE,
  declutterGateLabels,
  halfSplitDasharray,
} from "@/lib/energetics/human-design-chart-constants";

/**
 * The actual drawn bodygraph.
 *
 * 2026-08-17 — full geometry replacement, not another visual pass: every
 * center shape, gate position, and channel line below now comes from
 * real, professionally hand-authored vector data ported from the
 * MIT-licensed schokee/Astrolo project (see human-design-chart-layout.ts's
 * header for the full source/license story, and /THIRD_PARTY_NOTICES.md
 * for the required notice). This file's own job shrank accordingly: it no
 * longer computes center-shape polygons or channel-strip rectangles from
 * scratch (the old shapePoints/channelStripPoints math is gone, see
 * human-design-chart-constants.ts's header) — it just draws the ported
 * paths and decides their COLOR from Magnetix's own real chart data
 * (profile.personality/design/definedCenters) and the sub-account's own
 * Chart Design.
 *
 * Architecture note: geometry is per-GATE now (GATE_SPINE — one authored
 * path per gate, same as Astrolo's own 64-BodyChannel-control structure),
 * not per-channel-pair. A "complete channel" is just two gates' spines
 * both rendered bright and happening to meet near the middle; a "hanging
 * gate" is one bright spine + one recessive/faint spine at the other end
 * — this falls out naturally from rendering all 64 spines independently,
 * no special-casing needed, including for the 10/20/34/57 junction
 * cluster (whose real cubic-Bézier spines were hand-fitted in the source
 * to visually converge at one shared point).
 *
 * Colors/customization are unchanged from before this rewrite: open/
 * undefined centers white, defined centers the sub-account's chosen
 * color (uniform) or the real traditional per-center color (traditional
 * mode); Personality activations brown, Design gold, dual activation
 * split along the gate's own spine (GateSpine below) — same real hex
 * values, same split convention (personality nearer the gate), just
 * painted along the real ported spine path instead of a computed
 * straight polygon strip.
 *
 * The chart itself always renders on a fixed white surface regardless of
 * the app's own light/dark theme — same as every real chart tool.
 */

/**
 * One gate's own channel spine, colored by that gate's own activation —
 * not the channel pair's. Undefined/inactive renders the real geometry
 * recessive (faint, thin) rather than omitting it, matching Astrolo's own
 * ActivationState=None treatment and giving the full 64-spine network a
 * visible structure even where nothing is activated. Dual (Personality +
 * Design) activation splits the spine itself into two colors via
 * strokeDasharray at the real midpoint of the path's own length
 * (halfSplitDasharray — works identically for the straight and the real
 * curved/Bézier spines, see human-design-chart-constants.ts's header) —
 * personality half nearer the gate, design half farther toward the
 * partner, same convention already established here.
 */
function GateSpine({
  gate,
  personalityActive,
  designActive,
  recessiveColor,
}: {
  gate: number;
  personalityActive: boolean;
  designActive: boolean;
  /** Color of the faint always-present network for gates with no activation at either end — the sub-account's "Channel Network Color" Chart Design field (channelsColor). This is the one piece of channel styling that's still a brand choice; Personality/Design colors on an active spine are a fixed real convention, not customizable (see file header). */
  recessiveColor: string;
}) {
  const d = GATE_SPINE[gate];
  if (!d) return null;

  if (!personalityActive && !designActive) {
    return (
      <path
        d={d}
        fill="none"
        stroke={recessiveColor}
        strokeWidth={CHANNEL_STROKE_WIDTH_RECESSIVE}
        strokeOpacity={CHANNEL_STROKE_OPACITY_RECESSIVE}
        strokeLinecap="round"
      />
    );
  }
  if (personalityActive && designActive) {
    return (
      <>
        <path d={d} fill="none" stroke={HANGING_DESIGN} strokeWidth={CHANNEL_STROKE_WIDTH} strokeLinecap="round" />
        <path
          d={d}
          fill="none"
          stroke={HANGING_PERSONALITY}
          strokeWidth={CHANNEL_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={halfSplitDasharray(d)}
        />
      </>
    );
  }
  return (
    <path
      d={d}
      fill="none"
      stroke={personalityActive ? HANGING_PERSONALITY : HANGING_DESIGN}
      strokeWidth={CHANNEL_STROKE_WIDTH}
      strokeLinecap="round"
    />
  );
}

function CenterShapeEl({
  layout,
  defined,
  definedColor,
}: {
  layout: CenterGeometry;
  defined: boolean;
  definedColor: string;
}) {
  const fill = defined ? definedColor : UNDEFINED_FILL;
  const stroke = defined ? DEFINED_STROKE : UNDEFINED_STROKE;
  if (layout.shape === "rect") {
    return (
      <rect x={layout.x} y={layout.y} width={layout.width} height={layout.height} rx={layout.rx} fill={fill} stroke={stroke} strokeWidth={CENTER_STROKE_WIDTH} />
    );
  }
  return <path d={layout.d} transform={layout.transform} fill={fill} stroke={stroke} strokeWidth={CENTER_STROKE_WIDTH} />;
}

export function HumanDesignChart({
  profile,
  className,
  definedColor = DEFAULT_DEFINED_FILL,
  gatesColor = "#e4e4e7",
  channelsColor = DEFINED_STROKE,
  backgroundColor = "#ffffff",
  centersMode = "uniform",
  centerColors,
}: {
  profile: HumanDesignProfile;
  className?: string;
  /** Sub-account's chosen defined-center color (Chart Designs tab) — falls back to the traditional light gray when not set. Used for every defined center in "uniform" mode (the default); ignored per-center in "traditional" mode except as a fallback for a missing centerColors entry. */
  definedColor?: string;
  /** Accent ring color around each activated gate's solid marker circle. The circle fill itself (Personality black / Design rust) and its reversed white number stay fixed — universal convention, not a brand choice. */
  gatesColor?: string;
  /** "Channel Network Color" — the faint background color for every gate spine with no activation at either end. Was "Junction Channel Color" before the 2026-08-17 geometry rewrite (it used to color only the 6 Community-square channels' flat fill); remapped here since junction gates no longer get special treatment — every gate's spine, including 10/20/34/57's, is now colored purely by its own activation state, same as any other gate. */
  channelsColor?: string;
  backgroundColor?: string;
  /** "uniform" (default, existing behavior) — every defined center fills with `definedColor`. "traditional" — each defined center uses its own real color, see TRADITIONAL_CENTER_COLORS above / `centerColors` below. */
  centersMode?: "uniform" | "traditional";
  /** Per-center colors for traditional mode. Falls back to TRADITIONAL_CENTER_COLORS (then definedColor) for any center not supplied, so traditional mode always renders correctly even with a partial or absent map. Ignored entirely in uniform mode. */
  centerColors?: Partial<Record<CenterKey, string>>;
}) {
  const definedSet = new Set(profile.definedCenters);
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));
  const allGates = Object.keys(GATE_SPINE).map(Number);
  const activatedGates = allGates.filter((g) => personalityGates.has(g) || designGates.has(g));
  const labelPositions = declutterGateLabels(activatedGates);

  // Per-center resolved color — the only new logic this feature adds.
  // CenterShapeEl itself (shape/definition rendering) is completely
  // untouched below; it still just receives one resolved color string
  // per call, same as before this feature existed.
  const resolveCenterColor = (c: CenterKey): string =>
    centersMode === "traditional" ? (centerColors?.[c] ?? TRADITIONAL_CENTER_COLORS[c] ?? definedColor) : definedColor;

  return (
    <div className={className} style={{ background: backgroundColor, borderRadius: 12, padding: "6% 4%" }}>
      <svg viewBox={CHART_VIEWBOX} role="img" aria-label="Human Design bodygraph">
        {/* Every gate's own spine — recessive/faint pass first (drawn under
            everything, matches Astrolo's own ActivationState=None ZIndex=0
            treatment), then the active pass on top, so an active spine is
            never visually broken by an inactive one crossing near it
            (matters most at the 10/20/34/57 junction cluster where 4
            spines converge). */}
        {allGates
          .filter((g) => !personalityGates.has(g) && !designGates.has(g))
          .map((gate) => (
            <GateSpine key={gate} gate={gate} personalityActive={false} designActive={false} recessiveColor={channelsColor} />
          ))}
        {activatedGates.map((gate) => (
          <GateSpine key={gate} gate={gate} personalityActive={personalityGates.has(gate)} designActive={designGates.has(gate)} recessiveColor={channelsColor} />
        ))}

        {/* 9 centers */}
        {CENTERS.map((c) => (
          <CenterShapeEl key={c} layout={CENTER_LAYOUT[c]} defined={definedSet.has(c)} definedColor={resolveCenterColor(c)} />
        ))}

        {/* All 64 gate numbers — inactive ones faint, drawn before the
            activated layer so an activated gate's bold label always sits
            on top. */}
        {allGates.map((gate) => {
          if (personalityGates.has(gate) || designGates.has(gate)) return null;
          const point = GATE_POINT[gate];
          if (!point) return null;
          return (
            <text key={gate} x={point.x} y={point.y + FONT_SIZE_INACTIVE * 0.35} fontSize={FONT_SIZE_INACTIVE} fill={INACTIVE_GATE_TEXT} textAnchor="middle">
              {gate}
            </text>
          );
        })}

        {/* Gate numbers — the activated ones, solid-filled circle with
            reversed white text. Personality solid black, Design solid
            rust/brown. Dual (Personality + Design) activation, 2026-08-17
            correction-pass-4: back to ONE plain flat-colored circle, same
            as every other gate — the split-circle treatment from
            correction-pass-3 was a real improvement over the old two-
            offset-circles bug, but her direct follow-up was explicit: no
            split, no center divider line, "one color the same way the
            other gates are." Design wins as the single color when both
            are active — the same real "Both -> Design as base" rule
            already established for the channel spine itself (GateSpine
            above), not a new invented choice. The Personality/Design
            distinction for a dual gate is still visible on its own
            channel spine (the real two-tone split there is unchanged);
            it just doesn't duplicate onto the small number marker too. */}
        {activatedGates.map((gate) => {
          const point = labelPositions.get(gate)!;
          const inDesign = designGates.has(gate);
          const fill = inDesign ? DESIGN_FILL : PERSONALITY_FILL;
          return (
            <g key={gate}>
              <circle cx={point.x} cy={point.y} r={GATE_MARKER_R} fill={fill} stroke={gatesColor} strokeWidth={GATE_MARKER_STROKE_WIDTH} />
              <text x={point.x} y={point.y + FONT_SIZE_ACTIVE * 0.35} fontSize={FONT_SIZE_ACTIVE} fontWeight="700" fill={ACTIVATED_TEXT} textAnchor="middle">
                {gate}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
