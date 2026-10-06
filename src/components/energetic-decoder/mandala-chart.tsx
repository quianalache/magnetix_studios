import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
import { PERSONALITY_FILL, DESIGN_FILL } from "@/lib/energetics/human-design-chart-constants";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import type { ChartDesign, CentersMode } from "@/types/chart-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";
import {
  MANDALA_CX,
  MANDALA_CY,
  MANDALA_RINGS,
  MANDALA_TYPE,
  MANDALA_VIEW,
  WEDGE_OPACITY,
  bandPath,
  buildMandalaModel,
  mandalaBodygraphBox,
  resolveMandalaColors,
  textArcPath,
  type ResolvedMandalaColors,
} from "@/lib/energetics/mandala-spec";

/**
 * The Mandala chart (browser) — 2026-10 redesign. Every geometry, label,
 * orientation and color decision lives in lib/energetics/mandala-spec.ts,
 * which the PDF Mandala (MandalaPdf in reading-pdf-document.tsx) consumes
 * too; this file only turns that model into DOM SVG, so the two can't
 * drift. See mandala-spec.ts for the layout (canonical Human Design
 * Quarters, element-colored zodiac, real King Wen hexagrams, gate numbers,
 * planet symbols, inward activation wedges, center glow, ~55% BodyGraph)
 * and the orientation (0° Aries at 9 o'clock, counterclockwise).
 *
 * CENTER BODYGRAPH — the exact same HumanDesignChart the Readings tab
 * uses (unchanged), with its inner padding removed and sized/positioned
 * by mandalaBodygraphBox() so its drawing is centered on the wheel.
 */

/** Below this Mandala width (the Chart Design library thumbnails, phone-width public cards) zodiac names shorten to 3 letters and Quarter labels to their number — at that size the full words can't be read either way. */
export const ZODIAC_FULL_NAMES_MIN_WIDTH = 300;

const SIGN_ABBREV = (sign: string) => sign.slice(0, 3).toUpperCase();

export function MandalaChart({
  profile,
  gateColor,
  backgroundColor,
  className,
  zodiacColor = "#8b5cf6",
  mandalaColors,
  gateRingColor = "#71717a",
  quadrantColor = "#71717a",
  personalityColor = PERSONALITY_FILL,
  designColor = DESIGN_FILL,
  hdDesign,
  showCenterChart = true,
  showPersonality = true,
  showDesign = true,
  canvasPadding = "4%",
}: {
  profile: HumanDesignProfile;
  /** "Activated gate edge" — the rim arc on each activated gate. */
  gateColor: string;
  backgroundColor: string;
  className?: string;
  /** Legacy single zodiac color — only used to resolve element colors when `elementColors` isn't passed. */
  zodiacColor?: string;
  /** Every Mandala color of the design, resolved (resolveMandalaColors(design)) — consumers pass this; the single-color props above only seed a fallback. */
  mandalaColors?: ResolvedMandalaColors;
  gateRingColor?: string;
  quadrantColor?: string;
  personalityColor?: string;
  designColor?: string;
  /** The HD Traditional Chart Design — centers/channels/gates colors of the embedded BodyGraph. */
  hdDesign?: ChartDesign | null;
  /** Skip the center BodyGraph (tiny library thumbnails). */
  showCenterChart?: boolean;
  /** The Reading page's "Show in Mandala" layer toggles — hide a side's wedges and symbols, never its data. */
  showPersonality?: boolean;
  showDesign?: boolean;
  /**
   * Space between the canvas (the design-background box) and the wheel.
   * Every consumer keeps the default; the Chart Design editor preview
   * passes a smaller value so the wheel fills more of its canvas. The box
   * stays square either way, so its size (and any fit around it) doesn't
   * change — only how much of it the wheel uses.
   */
  canvasPadding?: string;
}) {
  const colors =
    mandalaColors ??
    resolveMandalaColors({
      backgroundColor,
      personalityActivationColor: personalityColor,
      designActivationColor: designColor,
      chartDefinedColor: gateColor,
      mandalaGateRingColor: gateRingColor,
      mandalaQuadrantColor: quadrantColor,
      mandalaZodiacColor: zodiacColor,
    });
  const model = buildMandalaModel({ personality: profile.personality, design: profile.design }, colors, { showPersonality, showDesign });
  const bodySymbol = new Map<string, string>(HD_BODY_LABELS.map((b) => [b.body, b.symbol]));
  const R = MANDALA_RINGS;
  const glowId = `mandala-glow-${model.glow.color.replace("#", "")}`;
  const bg = mandalaBodygraphBox();

  const centerColors: Partial<Record<CenterKey, string>> | undefined = hdDesign
    ? {
        head: hdDesign.headCenterColor,
        ajna: hdDesign.ajnaCenterColor,
        throat: hdDesign.throatCenterColor,
        g: hdDesign.gCenterColor,
        heart: hdDesign.heartCenterColor,
        spleen: hdDesign.spleenCenterColor,
        sacral: hdDesign.sacralCenterColor,
        solarplexus: hdDesign.solarPlexusCenterColor,
        root: hdDesign.rootCenterColor,
      }
    : undefined;

  const full = "hidden @min-[300px]/mandala:inline";
  const compact = "@min-[300px]/mandala:hidden";

  return (
    // @container/mandala: labels shorten on tiny Mandalas (ZODIAC_FULL_NAMES_MIN_WIDTH).
    <div className={`@container/mandala ${className ?? ""}`} style={{ background: colors.background, borderRadius: 12, padding: canvasPadding, position: "relative" }}>
      {/* The wheel and the center BodyGraph share this box, so the BodyGraph is sized against the wheel itself. */}
      <div data-mandala-wheel style={{ position: "relative" }} className="[&>svg]:block">
        <svg viewBox={`0 0 ${MANDALA_VIEW} ${MANDALA_VIEW}`} role="img" aria-label="Mandala chart">
          <defs>
            {/* Ids are derived from the geometry/color they hold, so several Mandalas on one page can share them safely. */}
            <radialGradient id={glowId} cx={MANDALA_CX} cy={MANDALA_CY} r={R.glowOuter} gradientUnits="userSpaceOnUse">
              <stop offset={0} stopColor={model.glow.color} stopOpacity={1} />
              <stop offset={model.glow.solidStop} stopColor={model.glow.color} stopOpacity={1} />
              <stop offset={(model.glow.solidStop + 1) / 2} stopColor={model.glow.color} stopOpacity={0.55} />
              <stop offset={1} stopColor={model.glow.color} stopOpacity={0} />
            </radialGradient>
            {model.quarters.map(({ quarter, span }) => (
              <path key={quarter.number} id={`mandala-arc-q${quarter.number}`} d={textArcPath(span, (R.quarterOuter + R.quarterInner) / 2)} />
            ))}
            {model.signs.map(({ sign, span }) => (
              <path key={sign} id={`mandala-arc-${sign}`} d={textArcPath(span, (R.zodiacOuter + R.zodiacInner) / 2)} />
            ))}
          </defs>

          {/* Human Design Quarters */}
          {model.quarters.map(({ quarter, span, fill, ink }) => (
            <g key={quarter.number} data-mandala-quarter={quarter.name}>
              <path d={bandPath(span.start, span.end, R.quarterOuter, R.quarterInner)} fill={fill} stroke="#ffffff" strokeWidth={0.5} />
              <text fontSize={MANDALA_TYPE.quarterLabel} fontWeight={700} letterSpacing={0.35} fill={ink} dominantBaseline="central">
                <textPath href={`#mandala-arc-q${quarter.number}`} startOffset="50%" textAnchor="middle">
                  <tspan className={full}>{quarter.label}</tspan>
                  <tspan className={compact}>{quarter.number}</tspan>
                </textPath>
              </text>
            </g>
          ))}

          {/* Zodiac, one color per element */}
          {model.signs.map(({ sign, element, span, fill, ink }) => (
            <g key={sign} data-mandala-sign={sign} data-element={element}>
              <path d={bandPath(span.start, span.end, R.zodiacOuter, R.zodiacInner)} fill={fill} stroke="#ffffff" strokeWidth={0.4} />
              <text fontSize={MANDALA_TYPE.zodiacLabel} fontWeight={700} fill={ink} dominantBaseline="central">
                <textPath href={`#mandala-arc-${sign}`} startOffset="50%" textAnchor="middle">
                  <tspan data-zodiac-label="full" className={full}>{sign}</tspan>
                  <tspan data-zodiac-label="abbrev" className={compact}>{SIGN_ABBREV(sign)}</tspan>
                </textPath>
              </text>
            </g>
          ))}

          {/* Gate field */}
          <circle cx={MANDALA_CX} cy={MANDALA_CY} r={R.field} fill={colors.background} />

          {/* Activation wedges, running inward from the field edge, in the color of the Human Design center each gate belongs to (Personality / Design show in the planet symbols) */}
          {model.gates.flatMap((g) =>
            g.wedges.map((w, k) => (
              <path key={`${g.gate}-${k}`} data-gate-wedge={g.gate} data-center={g.center} d={bandPath(w.start, w.end, R.field, 0)} fill={w.fill} fillOpacity={WEDGE_OPACITY} />
            )),
          )}

          {model.spokes.map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={colors.gateLines} strokeOpacity={0.45} strokeWidth={0.18} />
          ))}
          <circle cx={MANDALA_CX} cy={MANDALA_CY} r={R.field} fill="none" stroke={colors.gateLines} strokeOpacity={0.6} strokeWidth={0.3} />

          {/* Center glow — wedges and spokes fade toward the BodyGraph */}
          <circle cx={MANDALA_CX} cy={MANDALA_CY} r={R.glowOuter} fill={`url(#${glowId})`} />

          {model.gates.map((g) => (
            <g key={g.gate} data-gate={g.gate}>
              {g.rim && <path d={bandPath(g.rim.start, g.rim.end, R.field, R.field - 1.1)} fill={colors.activatedEdge} />}
              {g.hexagram.segments.map((s, k) => (
                <line key={k} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={g.hexagram.stroke} strokeWidth={R.hexagramLineThickness} />
              ))}
              <text
                data-gate-number={g.gate}
                x={g.number.x}
                y={g.number.y}
                fontSize={MANDALA_TYPE.gateNumber}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
                fill={g.number.fill}
                transform={`rotate(${g.number.rotate.toFixed(2)}, ${g.number.x.toFixed(3)}, ${g.number.y.toFixed(3)})`}
              >
                {g.gate}
              </text>
              {g.planets.map((p, k) => (
                <text
                  key={k}
                  data-planet={p.side}
                  x={p.x}
                  y={p.y}
                  fontSize={p.fontSize}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={p.fill}
                  stroke={colors.background}
                  strokeWidth={0.7}
                  paintOrder="stroke"
                >
                  {bodySymbol.get(p.body) ?? ""}
                </text>
              ))}
            </g>
          ))}
        </svg>

        {showCenterChart && (
          <div
            data-mandala-center-chart
            className="[&_svg]:block"
            style={{
              position: "absolute",
              left: `${((bg.x / MANDALA_VIEW) * 100).toFixed(3)}%`,
              top: `${((bg.y / MANDALA_VIEW) * 100).toFixed(3)}%`,
              width: `${((bg.w / MANDALA_VIEW) * 100).toFixed(3)}%`,
            }}
          >
            {/* Activations use this Mandala's own Personality/Design colors (the same ones its wedges use). */}
            <HumanDesignChart
              profile={profile}
              className="p-0!"
              definedColor={hdDesign?.chartDefinedColor}
              channelsColor={hdDesign?.channelsColor}
              gatesColor={hdDesign?.gatesColor}
              personalityColor={colors.personality}
              designColor={colors.design}
              backgroundColor="transparent"
              centersMode={hdDesign?.centersMode as CentersMode | undefined}
              centerColors={centerColors}
            />
          </div>
        )}
      </div>
    </div>
  );
}
