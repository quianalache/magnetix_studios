import "server-only";

import {
  Document,
  Image,
  Page,
  Text,
  View,
  Svg,
  G,
  Polygon,
  Rect,
  Circle,
  Line,
  Path,
  StyleSheet,
} from "@react-pdf/renderer";
import type { HumanDesignProfile, LocalSkillEntry } from "./human-design";
import { CENTERS, CENTER_LABELS, HD_BODY_LABELS, type CenterKey } from "./human-design-data";
import { CENTER_LAYOUT, GATE_POINT, GATE_SPINE, CHART_VIEWBOX, type CenterGeometry } from "./human-design-chart-layout";
import { GATE_WHEEL_ORDER, WHEEL_START_LONGITUDE_DEG } from "./gate-data";
import { TYPE_CONTENT, AUTHORITY_CONTENT, CENTER_CONTENT } from "./human-design-content-data";
import type { VariableArrowDirection, VariableArrowSource } from "./human-design-variables";
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
  GATE_MARKER_R_DUAL,
  GATE_LABEL_OFFSET_DUAL,
  FONT_SIZE_ACTIVE,
  FONT_SIZE_ACTIVE_DUAL,
  FONT_SIZE_INACTIVE,
  declutterGateLabels,
  halfSplitDasharray,
} from "./human-design-chart-constants";
import type { AstrologyChart, ZodiacSign, AspectType } from "./astrology";
import { SIGNS } from "./astrology";
import { ASPECT_TYPE_CONTENT } from "./astrology-content-data";
import {
  WHEEL_LINE,
  WHEEL_TEXT,
  RETRO_COLOR,
  HOUSE_RING_FILL,
  SIGN_COLORS,
  ASPECT_STYLE,
  CX,
  CY,
  SIGN_RING_OUTER,
  SIGN_RING_INNER,
  HOUSE_LINE_INNER,
  HOUSE_LABEL_R,
  ANGLE_LABEL_R,
  toXY,
  screenAngle,
  wedgePath,
  plotPlacements,
} from "./astrology-wheel-constants";
import type { GeneKeysSphereResult } from "./gene-keys";
import type { HumanDesignReadingContent, AstrologyReadingContent } from "@/types/energetic-decoder";
import type { ChartDesign, PlanetBoxMode, VariableArrowStyle } from "@/types/chart-design";

/**
 * A downloadable PDF of a full reading — her direct ask (2026-08-09): "if
 * we have it for Quotes, why can't we have it for the Energetic Decoder?"
 * Same renderer/pattern as quotes' pdf-document.tsx (@react-pdf/renderer),
 * used by both an operator's authenticated download and the client's
 * public report page.
 *
 * The bodygraph/natal wheel here are redrawn using @react-pdf/renderer's
 * own Svg primitives rather than embedding Bodygraph's returned SVG
 * directly — @react-pdf's Image component only accepts raster (PNG/JPEG)
 * sources, not arbitrary SVG documents (checked directly against
 * @react-pdf/image's source, not assumed), so a foreign SVG string can't
 * just be dropped in. Redrawn instead using the exact same real geometry
 * this app's own on-screen HumanDesignChart/AstrologyWheelChart components
 * use (CENTER_LAYOUT/GATE_POINT/GATE_SPINE — the real Astrolo-ported
 * bodygraph geometry, 2026-08-17 — plus the real astrology wheel math) —
 * same accurate chart, just re-expressed in react-pdf's shape components.
 *
 * Full rewrite 2026-08-10 — her real downloaded PDF showed 2 confirmed
 * rendering bugs and a real content gap, not assumed, from the actual file:
 *
 *  1. Astrology wheel planet/sign glyphs (☉☽♈…) rendered as garbled
 *     placeholder characters (H, I, =, ?, @…). Root cause: react-pdf's
 *     only font here is the built-in Helvetica (a standard PDF base font,
 *     WinAnsi-encoded) — it has no astrological Unicode glyphs at all, and
 *     react-pdf doesn't fail safely on an unsupported codepoint, it
 *     silently substitutes whatever WinAnsi character shares that glyph
 *     index. Fixed by dropping Unicode glyph reliance entirely — reliable
 *     ASCII abbreviations instead (same fix category as #2).
 *  2. The Frequency section's "→" separator rendered as "'" for the same
 *     reason — replaced with a plain "->".
 *  3. The PDF only ever showed raw fact VALUES (Type: "Generator") with
 *     none of the descriptive text every other real content editor in
 *     this app (Content tab) exists specifically to let a sub-account
 *     rewrite — Type/Authority descriptions, Center defined/undefined
 *     text, Variable descriptions, Skills &amp; Attributes, Defined
 *     Channels, Astrology sign/house/aspect descriptions. All of that data
 *     was already being computed and saved on the reading (the web
 *     Readings tab shows it) — the PDF just never read `reading.content`
 *     at all. Now uses the exact same "reading's own snapshot, falling
 *     back to the hardcoded default" resolution reading-summary.tsx uses,
 *     so a sub-account's own rewritten wording shows up in the PDF too.
 */

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 52, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#1a1a22" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: "#e8e8ec" },
  headerLogo: { maxHeight: 36, maxWidth: 150, marginBottom: 6, objectFit: "contain" },
  businessName: { fontSize: 11, fontWeight: 700 },
  readerName: { fontSize: 16, fontWeight: 700, marginTop: 2 },
  readerMeta: { fontSize: 9, color: "#6b6b75", marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: "#3D1652" },
  factGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  factCard: { width: "31%", borderWidth: 1, borderColor: "#e8e8ec", borderRadius: 6, padding: 6 },
  factLabel: { fontSize: 7.5, textTransform: "uppercase", color: "#6b6b75", marginBottom: 2 },
  factValue: { fontSize: 9.5, fontWeight: 700 },
  para: { fontSize: 9, lineHeight: 1.5, color: "#3a3a42", marginBottom: 8 },
  chartWrap: { alignItems: "center", marginVertical: 10 },
  centerLabel: { fontSize: 8, fontWeight: 700, marginTop: 10, marginBottom: 3 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  pill: { fontSize: 7.5, borderWidth: 1, borderColor: "#e8e8ec", borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 },
  block: { borderWidth: 1, borderColor: "#e8e8ec", borderRadius: 6, padding: 7, marginBottom: 6, width: "48%" },
  blockGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  blockTitle: { fontSize: 8.5, fontWeight: 700, marginBottom: 2 },
  blockText: { fontSize: 8, lineHeight: 1.4, color: "#3a3a42" },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#eee", paddingVertical: 3 },
  rowLabel: { fontSize: 8.5, color: "#3a3a42" },
  rowValue: { fontSize: 8.5, fontWeight: 700 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 7.5, color: "#9a9aa2", textAlign: "center" },
});

/**
 * ASCII-safe planet abbreviations — real bug caught 2026-08-10 exporting
 * a real PDF and looking at it directly, same root cause already fixed
 * once for the Astrology wheel below: react-pdf's only font here is the
 * built-in Helvetica (WinAnsi-encoded), which has no astrological Unicode
 * glyphs (☉☽♃…) at all — it doesn't fail safely, it silently overlaps/
 * garbles the glyph into whatever WinAnsi character shares that glyph
 * index, visibly mangling the following label text ("Qupiter",
 * "DSaturn"). HD_BODY_LABELS' own `symbol` field is correct and used
 * as-is on the web (browsers have real Unicode font fallback) — this
 * map exists only for react-pdf's PDF output, used by both the Human
 * Design planet boxes below and the Astrology wheel further down (which
 * already had this fix; "earth" added here since only Human Design uses
 * it, Astrology placements never include it).
 */
const PLANET_ABBR: Record<string, string> = {
  sun: "Su", earth: "Ea", moon: "Mo", mercury: "Me", venus: "Ve", mars: "Ma",
  jupiter: "Ju", saturn: "Sa", uranus: "Ur", neptune: "Ne", pluto: "Pl",
  northNode: "NN", southNode: "SN", lilith: "Li", chiron: "Ch",
};

// ── Human Design full chart (react-pdf) — 2026-08-10 parity port ──
//
// Ports human-design-chart.tsx (the BodyGraph itself: two-tone Design/
// Personality channels, hanging-gate stubs, the G-diamond, solid
// activated-gate markers, traditional/uniform center colors) and
// human-design-full-chart.tsx (Design column + BodyGraph + Personality
// column + the 4 Variable arrows) into react-pdf's own primitives, since
// react-pdf can't render real DOM/SVG React components directly. Reuses
// the EXACT same colors and pure geometry math as both web renderers via
// human-design-chart-constants.ts, rather than re-deriving or hand-
// copying values that could drift — the only genuinely new code below is
// the react-pdf-primitive JSX itself (Polygon/Line/Circle/Text/View
// instead of DOM polygon/line/circle/text/div), not new logic.
//
// No responsive/container-query layout needed the way the web full-chart
// has (@container, since it can end up embedded at any width) — a PDF
// page is a fixed, known size, so this always renders the full 3-column
// layout directly.

/** Mirrors CenterShapeEl in human-design-chart.tsx — same ported Astrolo geometry, react-pdf's Path/Rect instead of DOM path/rect. */
function CenterShapePdf({ layout, defined, color }: { layout: CenterGeometry; defined: boolean; color: string }) {
  const fill = defined ? color : UNDEFINED_FILL;
  const stroke = defined ? DEFINED_STROKE : UNDEFINED_STROKE;
  if (layout.shape === "rect") {
    return <Rect x={layout.x} y={layout.y} width={layout.width} height={layout.height} rx={layout.rx} fill={fill} stroke={stroke} strokeWidth={CENTER_STROKE_WIDTH} />;
  }
  return <Path d={layout.d} transform={layout.transform} fill={fill} stroke={stroke} strokeWidth={CENTER_STROKE_WIDTH} />;
}

/**
 * Mirrors GateSpine in human-design-chart.tsx — one gate's own ported
 * Astrolo channel-stub spine, colored by that gate's own activation (not
 * the channel pair's). react-pdf's Path instead of DOM path, same
 * strokeDasharray-based dual-split technique (confirmed to work
 * identically in react-pdf — @react-pdf/render applies strokeDasharray
 * generically to any stroked shape node, and @react-pdf/layout's
 * transform parser supports CSS matrix() the same way the G-center's
 * rotation needs).
 */
function GateSpinePdf({
  gate,
  personalityActive,
  designActive,
  recessiveColor,
}: {
  gate: number;
  personalityActive: boolean;
  designActive: boolean;
  recessiveColor: string;
}) {
  const d = GATE_SPINE[gate];
  if (!d) return null;

  if (!personalityActive && !designActive) {
    return <Path d={d} fill="none" stroke={recessiveColor} strokeWidth={CHANNEL_STROKE_WIDTH_RECESSIVE} strokeOpacity={CHANNEL_STROKE_OPACITY_RECESSIVE} strokeLinecap="round" />;
  }
  if (personalityActive && designActive) {
    return (
      <>
        <Path d={d} fill="none" stroke={HANGING_DESIGN} strokeWidth={CHANNEL_STROKE_WIDTH} strokeLinecap="round" />
        <Path d={d} fill="none" stroke={HANGING_PERSONALITY} strokeWidth={CHANNEL_STROKE_WIDTH} strokeLinecap="round" strokeDasharray={halfSplitDasharray(d)} />
      </>
    );
  }
  return <Path d={d} fill="none" stroke={personalityActive ? HANGING_PERSONALITY : HANGING_DESIGN} strokeWidth={CHANNEL_STROKE_WIDTH} strokeLinecap="round" />;
}

/** Mirrors HumanDesignChart in human-design-chart.tsx — the BodyGraph itself, react-pdf primitives instead of DOM/SVG. Full geometry replacement 2026-08-17, see that file's header for the Astrolo source/license story. */
function HumanDesignBodygraphPdf({
  profile,
  centersColor,
  centersMode,
  centerColors,
  channelsColor,
  gatesColor,
  backgroundColor,
  size,
}: {
  profile: HumanDesignProfile;
  centersColor: string;
  centersMode: "uniform" | "traditional";
  centerColors: Partial<Record<CenterKey, string>> | undefined;
  channelsColor: string;
  gatesColor: string;
  backgroundColor: string;
  size: number;
}) {
  const definedSet = new Set(profile.definedCenters);
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));
  const allGates = Object.keys(GATE_SPINE).map(Number);
  const activatedGates = allGates.filter((g) => personalityGates.has(g) || designGates.has(g));
  const dualGates = new Set(activatedGates.filter((g) => personalityGates.has(g) && designGates.has(g)));
  const labelPositions = declutterGateLabels(activatedGates, dualGates);
  const resolveCenterColor = (c: CenterKey): string =>
    centersMode === "traditional" ? (centerColors?.[c] ?? TRADITIONAL_CENTER_COLORS[c] ?? centersColor) : centersColor;

  // viewBox is the shared CHART_VIEWBOX ("18 -4 200 320") — see
  // human-design-chart-layout.ts's header for how it was computed.
  const [vbX, vbY, vbW, vbH] = CHART_VIEWBOX.split(" ").map(Number);
  const height = size * (vbH / vbW);

  return (
    <Svg viewBox={CHART_VIEWBOX} style={{ width: size, height }}>
      {/*
       * Real bug caught 2026-08-15 rendering an actual PDF (the Mandala's
       * embedded copy of this chart passes backgroundColor="transparent"
       * so it composites over the zodiac/gate rings) and inspecting it
       * directly: react-pdf's SVG fill parser doesn't recognize the CSS
       * keyword "transparent" the way a browser does — it silently
       * painted solid black instead of nothing. SVG's own "none" is the
       * correct way to paint no fill at all; every other real color this
       * shared component receives (from an actual Chart Design's
       * backgroundColor field) is unaffected by this check.
       */}
      <Rect x={vbX} y={vbY} width={vbW} height={vbH} fill={backgroundColor === "transparent" ? "none" : backgroundColor} />

      {/* Every gate's own spine — recessive/faint pass first (drawn under
          everything), then the active pass on top, same as the web
          renderer and same reasoning (the 10/20/34/57 junction cluster's
          4 spines converge, so an active one must never be visually
          broken by an inactive one crossing near it). */}
      {allGates
        .filter((g) => !personalityGates.has(g) && !designGates.has(g))
        .map((gate) => (
          <GateSpinePdf key={gate} gate={gate} personalityActive={false} designActive={false} recessiveColor={channelsColor} />
        ))}
      {activatedGates.map((gate) => (
        <GateSpinePdf key={gate} gate={gate} personalityActive={personalityGates.has(gate)} designActive={designGates.has(gate)} recessiveColor={channelsColor} />
      ))}

      {/* 9 centers — traditional or uniform per resolveCenterColor above */}
      {CENTERS.map((c) => (
        <CenterShapePdf key={c} layout={CENTER_LAYOUT[c]} defined={definedSet.has(c)} color={resolveCenterColor(c)} />
      ))}

      {/* All 64 gate numbers, inactive ones faint, drawn before the activated layer */}
      {allGates.map((gate) => {
        if (personalityGates.has(gate) || designGates.has(gate)) return null;
        const point = GATE_POINT[gate];
        if (!point) return null;
        return (
          <Text key={gate} x={point.x} y={point.y + FONT_SIZE_INACTIVE * 0.35} style={{ fontSize: FONT_SIZE_INACTIVE, fill: INACTIVE_GATE_TEXT, textAnchor: "middle" }}>
            {gate}
          </Text>
        );
      })}

      {/* Activated gates — solid-filled circle + reversed white number. Dual activation splits into 2 offset circles. */}
      {activatedGates.map((gate) => {
        const point = labelPositions.get(gate)!;
        const inPersonality = personalityGates.has(gate);
        const inDesign = designGates.has(gate);
        const dual = inPersonality && inDesign;

        if (dual) {
          const OFFSET = GATE_LABEL_OFFSET_DUAL;
          const R = GATE_MARKER_R_DUAL;
          return (
            <G key={gate}>
              <Circle cx={point.x + OFFSET} cy={point.y + OFFSET} r={R} fill={DESIGN_FILL} stroke={gatesColor} strokeWidth={GATE_MARKER_STROKE_WIDTH} />
              <Text x={point.x + OFFSET} y={point.y + OFFSET + FONT_SIZE_ACTIVE_DUAL * 0.35} style={{ fontSize: FONT_SIZE_ACTIVE_DUAL, fontWeight: 700, fill: ACTIVATED_TEXT, textAnchor: "middle" }}>
                {gate}
              </Text>
              <Circle cx={point.x - OFFSET} cy={point.y - OFFSET} r={R} fill={PERSONALITY_FILL} stroke={gatesColor} strokeWidth={GATE_MARKER_STROKE_WIDTH} />
              <Text x={point.x - OFFSET} y={point.y - OFFSET + FONT_SIZE_ACTIVE_DUAL * 0.35} style={{ fontSize: FONT_SIZE_ACTIVE_DUAL, fontWeight: 700, fill: ACTIVATED_TEXT, textAnchor: "middle" }}>
                {gate}
              </Text>
            </G>
          );
        }

        const R = GATE_MARKER_R;
        const fill = inPersonality ? PERSONALITY_FILL : DESIGN_FILL;
        return (
          <G key={gate}>
            <Circle cx={point.x} cy={point.y} r={R} fill={fill} stroke={gatesColor} strokeWidth={GATE_MARKER_STROKE_WIDTH} />
            <Text x={point.x} y={point.y + FONT_SIZE_ACTIVE * 0.35} style={{ fontSize: FONT_SIZE_ACTIVE, fontWeight: 700, fill: ACTIVATED_TEXT, textAnchor: "middle" }}>
              {gate}
            </Text>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Planet boxes + Variable arrows (react-pdf View/Text) — mirrors human-design-full-chart.tsx ──

const PDF_PLAIN_TEXT = "#3f3f46"; // zinc-700 — same neutral ink human-design-full-chart.tsx uses for iconOnly mode's label/value text

function PlanetBoxPdf({
  symbol,
  label,
  value,
  activationColor,
  mode,
  borderRadius,
}: {
  symbol: string;
  label: string;
  value: string;
  activationColor: string;
  mode: PlanetBoxMode;
  borderRadius: number;
}) {
  if (mode === "fullBox") {
    return (
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: activationColor, borderRadius, paddingVertical: 2, paddingHorizontal: 4, marginBottom: 1.5 }}>
        <Text style={{ fontSize: 6, color: "#ffffff" }}>{symbol} {label}</Text>
        <Text style={{ fontSize: 6, color: "#ffffff", fontWeight: 700 }}>{value}</Text>
      </View>
    );
  }
  // iconOnly — row stays genuinely unfilled; only the glyph chip is colored.
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2, paddingHorizontal: 4, marginBottom: 1.5 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activationColor, alignItems: "center", justifyContent: "center", marginRight: 3 }}>
          <Text style={{ fontSize: 5, color: "#ffffff" }}>{symbol}</Text>
        </View>
        <Text style={{ fontSize: 6, color: PDF_PLAIN_TEXT }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 6, color: PDF_PLAIN_TEXT, fontWeight: 700 }}>{value}</Text>
    </View>
  );
}

function ActivationColumnPdf({
  side,
  activations,
  color,
  mode,
  borderRadius,
}: {
  side: "Design" | "Personality";
  activations: HumanDesignProfile["design"] | HumanDesignProfile["personality"];
  color: string;
  mode: PlanetBoxMode;
  borderRadius: number;
}) {
  return (
    <View style={{ width: 140 }}>
      <Text style={{ fontSize: 7, fontWeight: 700, color, marginBottom: 3, textTransform: "uppercase" }}>{side}</Text>
      {HD_BODY_LABELS.map(({ body, label }) => {
        const a = activations.find((x) => x.body === body);
        return (
          <PlanetBoxPdf
            key={body}
            symbol={PLANET_ABBR[body] ?? label.slice(0, 2)}
            label={label}
            value={a ? `${a.gate}.${a.line}` : "—"}
            activationColor={color}
            mode={mode}
            borderRadius={borderRadius}
          />
        );
      })}
    </View>
  );
}

function ArrowGlyphPdf({ direction, color, style }: { direction: VariableArrowDirection; color: string; style: VariableArrowStyle }) {
  const points = direction === "Left" ? "9,1.5 9,10.5 1.5,6" : "1.5,1.5 1.5,10.5 9,6";
  return (
    <Svg viewBox="0 0 12 12" style={{ width: 8, height: 8 }}>
      <Polygon points={points} fill={style === "solid" ? color : "none"} stroke={color} strokeWidth={style === "outline" ? 1.1 : 0} />
    </Svg>
  );
}

/** Mirrors ArrowBadge in human-design-full-chart.tsx. Reordering children (instead of flexDirection: row-reverse) for "right" alignment — same visual result, avoids an unverified react-pdf flex value. */
function ArrowBadgePdf({
  label,
  source,
  value,
  color,
  style,
  align,
}: {
  label: string;
  source: string;
  value: VariableArrowSource | undefined;
  color: string;
  style: VariableArrowStyle;
  align: "left" | "right";
}) {
  const glyph = value ? <ArrowGlyphPdf direction={value.arrow} color={color} style={style} /> : <View style={{ width: 8, height: 8 }} />;
  const text = (
    <View style={{ marginLeft: align === "left" ? 3 : 0, marginRight: align === "right" ? 3 : 0 }}>
      <Text style={{ fontSize: 6.5, fontWeight: 700, color, textAlign: align }}>{label}</Text>
      <Text style={{ fontSize: 5.5, color: "#8a8a92", textAlign: align }}>
        {source}
        {value ? ` · ${value.arrow}` : " · —"}
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {align === "left" ? (
        <>
          {glyph}
          {text}
        </>
      ) : (
        <>
          {text}
          {glyph}
        </>
      )}
    </View>
  );
}

/** Mirrors HumanDesignFullChart in human-design-full-chart.tsx: Design column + BodyGraph + Personality column + all 4 Variable arrows. No container-query responsiveness needed — a PDF page is a fixed known width. */
/** Shared by HumanDesignFullChartPdf and MandalaPdf's embedded center chart (2026-08-15, Phase 6) — was hand-copied inline once before this; extracted so a second copy inside the Mandala's PDF mirror couldn't quietly drift from this one, the exact class of bug the Phase 4 correctness pass found and fixed on the web side. */
function centerColorsFromHdDesignPdf(hdDesign: ChartDesign | null | undefined): Partial<Record<CenterKey, string>> | undefined {
  if (!hdDesign) return undefined;
  return {
    head: hdDesign.headCenterColor,
    ajna: hdDesign.ajnaCenterColor,
    throat: hdDesign.throatCenterColor,
    g: hdDesign.gCenterColor,
    heart: hdDesign.heartCenterColor,
    spleen: hdDesign.spleenCenterColor,
    sacral: hdDesign.sacralCenterColor,
    solarplexus: hdDesign.solarPlexusCenterColor,
    root: hdDesign.rootCenterColor,
  };
}

/** Exported 2026-08-12 so report-design-pdf-document.tsx (custom ReportDesign PDF export) can reuse the exact same react-pdf chart rendering this reading PDF already proved out — no second chart-in-PDF implementation. */
export function HumanDesignFullChartPdf({ profile, hdDesign }: { profile: HumanDesignProfile; hdDesign?: ChartDesign | null }) {
  const personalityActivationColor = hdDesign?.personalityActivationColor || PERSONALITY_FILL;
  const designActivationColor = hdDesign?.designActivationColor || DESIGN_FILL;
  const arrowStyle: VariableArrowStyle = hdDesign?.arrowStyle || "solid";
  const planetBoxMode: PlanetBoxMode = hdDesign?.planetBoxMode || "fullBox";
  const planetBoxBorderRadius = hdDesign?.planetBoxBorderRadius ?? 6;
  const centersColor = hdDesign?.chartDefinedColor || DEFAULT_DEFINED_FILL;
  const centersMode = hdDesign?.centersMode || "uniform";
  const channelsColor = hdDesign?.channelsColor || DEFINED_STROKE;
  const gatesColor = hdDesign?.gatesColor || "#e4e4e7";
  const backgroundColor = hdDesign?.backgroundColor || "#ffffff";
  const centerColors = centerColorsFromHdDesignPdf(hdDesign);
  const arrows = profile.variableArrows;

  return (
    <View style={{ alignItems: "center", marginVertical: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width: 460, marginBottom: 4 }}>
        <ArrowBadgePdf label="Digestion" source="Design Sun" value={arrows?.digestion} color={designActivationColor} style={arrowStyle} align="left" />
        <ArrowBadgePdf label="Motivation" source="Personality Sun" value={arrows?.motivation} color={personalityActivationColor} style={arrowStyle} align="right" />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", width: 460 }}>
        <ActivationColumnPdf side="Design" activations={profile.design} color={designActivationColor} mode={planetBoxMode} borderRadius={planetBoxBorderRadius} />
        <HumanDesignBodygraphPdf
          profile={profile}
          centersColor={centersColor}
          centersMode={centersMode}
          centerColors={centerColors}
          channelsColor={channelsColor}
          gatesColor={gatesColor}
          backgroundColor={backgroundColor}
          size={180}
        />
        <ActivationColumnPdf side="Personality" activations={profile.personality} color={personalityActivationColor} mode={planetBoxMode} borderRadius={planetBoxBorderRadius} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width: 460, marginTop: 4 }}>
        <ArrowBadgePdf label="Environment" source="Design Node" value={arrows?.environment} color={designActivationColor} style={arrowStyle} align="left" />
        <ArrowBadgePdf label="Perspective" source="Personality Node" value={arrows?.perspective} color={personalityActivationColor} style={arrowStyle} align="right" />
      </View>
    </View>
  );
}

// ── Mandala (react-pdf Svg) — rebuilt 2026-08-15 (Phase 6). The prior
// version (2026-08-10) only ever drew the gate ring + quadrants + dots;
// this mirrors mandala-chart.tsx's completed rebuild exactly (zodiac ring,
// gate ring, line-position glyph, planet glyphs, embedded center
// BodyGraph) — same SPHERE_POSITION-style constants, same formulas, only
// the shape primitives differ (react-pdf's G/Line/Circle/Text/Path/Rect
// instead of DOM svg equivalents), for the same reason every other PDF
// mirror in this file exists. `MANDALA_` prefix on locals avoids colliding
// with the Astrology wheel's own CX/CY/toXY declared further down.
//
// This also fixes the real bug the Phase 4 parity-audit pass found — the
// PDF printed the word "Mandala" with no chart beneath it. The prior
// MandalaPdf component existed and was called correctly; concrete root
// cause not conclusively isolated (this rebuild replaces the component
// entirely rather than patching around an unconfirmed cause), but the
// fix is verified the way the audit itself insisted on: a real PDF was
// generated and inspected after this rebuild, not just previewed as
// HTML — see the Build Log / parity-audit update for that evidence.

const MANDALA_CX = 100;
const MANDALA_CY = 100;

const MANDALA_QUADRANT_OUTER = 98;
const MANDALA_QUADRANT_INNER = 89;
const MANDALA_QUADRANT_LABEL_R = (MANDALA_QUADRANT_OUTER + MANDALA_QUADRANT_INNER) / 2;

const MANDALA_ZODIAC_OUTER = 89;
const MANDALA_ZODIAC_INNER = 73;

const MANDALA_GATE_SECTOR_OUTER = 73;
const MANDALA_GATE_SECTOR_INNER = 23;
const MANDALA_GATE_LABEL_R = 68.5;
const MANDALA_LINE_GLYPH_R = 52;
const MANDALA_PLANET_GLYPH_R = 32;

const MANDALA_GATE_ARC_DEG = 360 / 64;
const MANDALA_SIZE = 300; // bigger than the 180pt BodyGraph/240pt Astrology wheel — 64 tightly-packed gate numbers need more room to stay legible than either of those.
/**
 * Width (pt) the embedded BodyGraph occupies, as a fraction of
 * MANDALA_SIZE. Retuned 2026-08-17 for the Astrolo geometry port (see
 * human-design-chart-layout.ts's header) — real bounding-box math is
 * different now (a wider, tighter-cropped viewBox: CHART_VIEWBOX below
 * vs. the old "8 -25 84 142"), so this was re-derived from scratch by
 * real-rendering the Mandala PDF and inspecting it, not carried over
 * from the old value.
 */
const MANDALA_CENTER_CHART_SIZE = MANDALA_SIZE * 0.3;
/** Real height of the embedded chart at MANDALA_CENTER_CHART_SIZE width — CHART_VIEWBOX isn't square, so this must be computed, not assumed equal to the width (a real bug this rewrite fixed: the old code used one value for both the width AND the vertical centering offset, silently assuming a square embed). */
const [, , CHART_VIEWBOX_W, CHART_VIEWBOX_H] = CHART_VIEWBOX.split(" ").map(Number);
const MANDALA_CENTER_CHART_HEIGHT = MANDALA_CENTER_CHART_SIZE * (CHART_VIEWBOX_H / CHART_VIEWBOX_W);

function mandalaAngleForGateIndex(i: number): number {
  // 12 o'clock = -90°, clockwise = increasing angle — same convention mandala-chart.tsx documents.
  return -90 + i * MANDALA_GATE_ARC_DEG;
}
/** Real raw ecliptic longitude -> this chart's SVG angle — same formula, same anchor (WHEEL_START_LONGITUDE_DEG) as mandala-chart.tsx's angleForLongitude. */
function mandalaAngleForLongitude(rawLon: number): number {
  const wheelPos = (((rawLon - WHEEL_START_LONGITUDE_DEG) % 360) + 360) % 360;
  return -90 + wheelPos;
}
function mandalaToXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: MANDALA_CX + r * Math.cos(rad), y: MANDALA_CY + r * Math.sin(rad) };
}
function mandalaSignAbbrev(sign: string): string {
  return sign.slice(0, 3).toUpperCase();
}
/** One angular band as a filled ring wedge — mirrors bandPath() in mandala-chart.tsx, shared by the quadrant band, zodiac band, and every gate sector. */
function mandalaBandPath(a0: number, a1: number, rOuter: number, rInner: number): string {
  const o0 = mandalaToXY(a0, rOuter);
  const o1 = mandalaToXY(a1, rOuter);
  const i1 = mandalaToXY(a1, rInner);
  const i0 = mandalaToXY(a0, rInner);
  return [
    `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 0 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

// ── Color utilities — mirrors mandala-chart.tsx's deriveShade/isDarkFill
// exactly (own copy, not a shared import, same reason every other PDF
// primitive in this file is its own copy rather than shared with the DOM
// version): derive a small, related palette from ONE configured hex
// color per band type, so "use bold color" never means hardcoding a
// second palette. ──
function mandalaHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [113, 113, 122];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mandalaRgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mandalaRgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}
function mandalaHslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}
function mandalaDeriveShade(hex: string, hueOffsetDeg: number, lightnessDelta = 0, saturationDelta = 0): string {
  const [h, s, l] = mandalaRgbToHsl(...mandalaHexToRgb(hex));
  const h2 = (h + hueOffsetDeg + 360) % 360;
  const s2 = Math.min(1, Math.max(0.18, s + saturationDelta));
  const l2 = Math.min(0.86, Math.max(0.14, l + lightnessDelta));
  return mandalaRgbToHex(...mandalaHslToRgb(h2, s2, l2));
}
function mandalaIsDarkFill(hex: string): boolean {
  const [r, g, b] = mandalaHexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}

/** Mirrors QuadrantBand in mandala-chart.tsx — 4 related shades of one configured accent, not a hardcoded second palette. */
function MandalaQuadrantBandPdf({ baseColor }: { baseColor: string }) {
  const HUE_OFFSETS = [0, 28, -28, 52];
  const LIGHT_DELTAS = [0, 0.04, -0.06, 0.08];
  return (
    <>
      {[0, 1, 2, 3].map((q) => {
        const a0 = mandalaAngleForGateIndex(q * 16);
        const a1 = mandalaAngleForGateIndex(q * 16 + 16);
        const fill = mandalaDeriveShade(baseColor, HUE_OFFSETS[q], LIGHT_DELTAS[q]);
        const textColor = mandalaIsDarkFill(fill) ? "#ffffff" : "#1c1e24";
        const labelPos = mandalaToXY(mandalaAngleForGateIndex(q * 16 + 8), MANDALA_QUADRANT_LABEL_R);
        return (
          <G key={q}>
            <Path d={mandalaBandPath(a0, a1, MANDALA_QUADRANT_OUTER, MANDALA_QUADRANT_INNER)} fill={fill} stroke="#ffffff" strokeWidth={0.5} />
            <Text x={labelPos.x} y={labelPos.y + 2} style={{ fontSize: 6.5, fontWeight: 800, textAnchor: "middle", fill: textColor }}>
              {`${q + 1}`}
            </Text>
          </G>
        );
      })}
    </>
  );
}

/** Mirrors ZodiacRing in mandala-chart.tsx — 12 related shades of one configured accent, alternating lightness for adjacent-sign contrast; same real longitude anchor as the gate ring so the two always agree. */
function MandalaZodiacRingPdf({ baseColor }: { baseColor: string }) {
  return (
    <>
      {SIGNS.map((sign, i) => {
        const startLon = i * 30;
        const endLon = startLon + 30;
        const a0 = mandalaAngleForLongitude(startLon);
        const a1 = mandalaAngleForLongitude(endLon);
        const midA = mandalaAngleForLongitude(startLon + 15);
        const labelPos = mandalaToXY(midA, (MANDALA_ZODIAC_OUTER + MANDALA_ZODIAC_INNER) / 2);
        const hueOffset = -55 + i * (110 / 11);
        const fill = mandalaDeriveShade(baseColor, hueOffset, i % 2 === 0 ? 0.03 : -0.05);
        const textColor = mandalaIsDarkFill(fill) ? "#ffffff" : "#1c1e24";
        return (
          <G key={sign}>
            <Path d={mandalaBandPath(a0, a1, MANDALA_ZODIAC_OUTER, MANDALA_ZODIAC_INNER)} fill={fill} stroke="#ffffff" strokeWidth={0.4} />
            <Text x={labelPos.x} y={labelPos.y} style={{ fontSize: 4.2, fontWeight: 700, textAnchor: "middle", fill: textColor }}>
              {mandalaSignAbbrev(sign)}
            </Text>
          </G>
        );
      })}
    </>
  );
}

/** Mirrors LineGlyph in mandala-chart.tsx — the real activated line (1-6), not the traditional King Wen hexagram shape (see that file's header note on why), white against the gate wedge's own color fill. */
function MandalaLineGlyphPdf({ cx, cy, personalityLine, designLine }: { cx: number; cy: number; personalityLine?: number; designLine?: number }) {
  const tickH = 1.3;
  const tickW = 6;
  const gap = 1.9;
  const totalH = 6 * tickH + 5 * (gap - tickH);
  const startY = cy - totalH / 2;
  return (
    <G>
      {[1, 2, 3, 4, 5, 6].map((line) => {
        const y = startY + (6 - line) * gap;
        const active = personalityLine === line || designLine === line;
        return <Rect key={line} x={cx - tickW / 2} y={y} width={tickW} height={tickH} rx={0.4} fill="#ffffff" fillOpacity={active ? 1 : 0.3} />;
      })}
    </G>
  );
}

/**
 * Mirrors MandalaChart in mandala-chart.tsx in full — quadrant band,
 * zodiac band, 64 real gate-sector wedges (activated ones filled and
 * split Personality/Design down their own angular center, matching the
 * 2026-08-16 visual-composition rebuild), and an embedded center
 * BodyGraph via the same HumanDesignBodygraphPdf this file's own HD
 * Traditional section uses, composited with react-pdf's
 * `position: "absolute"` rather than a second nested Svg coordinate
 * system. `gateColor` carries the same meaning the web caller gives it —
 * the accent stroke around each activated gate's wedge, not the
 * Personality/Design fill itself.
 */
/** Exported 2026-08-12 — see HumanDesignFullChartPdf's export note above. */
export function MandalaPdf({
  profile,
  gateColor,
  backgroundColor,
  personalityColor = PERSONALITY_FILL,
  designColor = DESIGN_FILL,
  zodiacColor = "#8b5cf6",
  gateRingColor = "#71717a",
  quadrantColor = "#71717a",
  hdDesign,
}: {
  profile: HumanDesignProfile;
  gateColor: string;
  backgroundColor: string;
  personalityColor?: string;
  designColor?: string;
  zodiacColor?: string;
  gateRingColor?: string;
  quadrantColor?: string;
  hdDesign?: ChartDesign | null;
}) {
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));
  const byGatePersonality = new Map(profile.personality.map((a) => [a.gate, a]));
  const byGateDesign = new Map(profile.design.map((a) => [a.gate, a]));
  // Real bug caught 2026-08-15 rendering an actual PDF and looking at it
  // directly (same class of bug this file's own PLANET_ABBR comment
  // above already documents for the full-chart planet boxes and the
  // Astrology wheel): HD_BODY_LABELS' `symbol` field is a real Unicode
  // astrological glyph (☉☽♃…), correct for the web SVG (real font
  // fallback), but react-pdf's only font here is WinAnsi Helvetica —
  // it doesn't fail safely, it silently prints a garbled substitute
  // character. Reusing PLANET_ABBR (the same ASCII-safe 2-letter map
  // already proven correct elsewhere in this file) instead of adding a
  // second, PDF-unsafe lookup.
  const bodySymbol = new Map(HD_BODY_LABELS.map((b) => [b.body, PLANET_ABBR[b.body] ?? b.label.slice(0, 2)]));

  return (
    <View style={{ backgroundColor, borderRadius: 12, padding: MANDALA_SIZE * 0.05, position: "relative" }}>
      <Svg viewBox={`0 0 ${MANDALA_CX * 2} ${MANDALA_CY * 2}`} style={{ width: MANDALA_SIZE, height: MANDALA_SIZE }}>
        <MandalaQuadrantBandPdf baseColor={quadrantColor} />
        <MandalaZodiacRingPdf baseColor={zodiacColor} />

        <Circle cx={MANDALA_CX} cy={MANDALA_CY} r={MANDALA_GATE_SECTOR_OUTER} fill="none" stroke={gateRingColor} strokeOpacity={0.5} strokeWidth={0.4} />
        <Circle cx={MANDALA_CX} cy={MANDALA_CY} r={MANDALA_GATE_SECTOR_INNER} fill="none" stroke={gateRingColor} strokeOpacity={0.35} strokeWidth={0.35} />

        {[0, 1, 2, 3].map((q) => {
          const angle = mandalaAngleForGateIndex(q * 16);
          const outer = mandalaToXY(angle, MANDALA_QUADRANT_OUTER + 1);
          const inner = mandalaToXY(angle, MANDALA_GATE_SECTOR_INNER);
          return <Line key={q} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={quadrantColor} strokeOpacity={0.6} strokeWidth={0.5} />;
        })}

        {GATE_WHEEL_ORDER.map((gate, i) => {
          const angle = mandalaAngleForGateIndex(i);
          const angleMid = angle + MANDALA_GATE_ARC_DEG / 2;
          const angleEnd = angle + MANDALA_GATE_ARC_DEG;
          const labelPos = mandalaToXY(angleMid, MANDALA_GATE_LABEL_R);
          const glyphPos = mandalaToXY(angleMid, MANDALA_LINE_GLYPH_R);
          const planetPos = mandalaToXY(angleMid, MANDALA_PLANET_GLYPH_R);
          const inPersonality = personalityGates.has(gate);
          const inDesign = designGates.has(gate);
          const activated = inPersonality || inDesign;
          const pAct = byGatePersonality.get(gate);
          const dAct = byGateDesign.get(gate);
          const textColor = activated ? "#ffffff" : INACTIVE_GATE_TEXT;

          return (
            <G key={gate}>
              {/* The gate's own wedge — real fix for "activation as a floating dot": an activated gate's ENTIRE sector fills, split down its own angular center when both Personality and Design are active. */}
              {activated ? (
                inPersonality && inDesign ? (
                  <>
                    <Path d={mandalaBandPath(angle, angleMid, MANDALA_GATE_SECTOR_OUTER, MANDALA_GATE_SECTOR_INNER)} fill={personalityColor} stroke={gateColor} strokeWidth={0.3} />
                    <Path d={mandalaBandPath(angleMid, angleEnd, MANDALA_GATE_SECTOR_OUTER, MANDALA_GATE_SECTOR_INNER)} fill={designColor} stroke={gateColor} strokeWidth={0.3} />
                  </>
                ) : (
                  <Path
                    d={mandalaBandPath(angle, angleEnd, MANDALA_GATE_SECTOR_OUTER, MANDALA_GATE_SECTOR_INNER)}
                    fill={inPersonality ? personalityColor : designColor}
                    stroke={gateColor}
                    strokeWidth={0.3}
                  />
                )
              ) : (
                <Path d={mandalaBandPath(angle, angleEnd, MANDALA_GATE_SECTOR_OUTER, MANDALA_GATE_SECTOR_INNER)} fill={gateRingColor} fillOpacity={0.06} stroke={gateRingColor} strokeOpacity={0.18} strokeWidth={0.2} />
              )}

              <Text x={labelPos.x} y={labelPos.y + 0.9} style={{ fontSize: activated ? 4.4 : 3.2, fontWeight: activated ? 800 : 500, textAnchor: "middle", fill: textColor }}>
                {`${gate}`}
              </Text>

              {activated && <MandalaLineGlyphPdf cx={glyphPos.x} cy={glyphPos.y} personalityLine={pAct?.line} designLine={dAct?.line} />}

              {pAct && (
                <Text x={planetPos.x} y={planetPos.y - (dAct ? 2 : 0)} style={{ fontSize: 5.4, fontWeight: 700, textAnchor: "middle", fill: "#ffffff" }}>
                  {bodySymbol.get(pAct.body) ?? ""}
                </Text>
              )}
              {dAct && (
                <Text x={planetPos.x} y={planetPos.y + (pAct ? 5.2 : 2)} style={{ fontSize: 5.4, fontWeight: 700, textAnchor: "middle", fill: "#ffffff" }}>
                  {bodySymbol.get(dAct.body) ?? ""}
                </Text>
              )}
            </G>
          );
        })}
      </Svg>

      {/*
       * Real bug caught 2026-08-15 generating an actual PDF (the sibling
       * web MandalaChart had the identical mistake) and inspecting it
       * directly: this used to require `hdDesign` to be non-null/defined
       * before the embedded BodyGraph would render at all, which
       * silently hid it for any sub-account that never separately
       * created an HD Traditional chart design — a normal state, not an
       * error, and unrelated to whether this chart should render.
       * `centerColorsFromHdDesignPdf` and every field below already
       * degrade to the same defaults `HumanDesignFullChartPdf` uses when
       * hdDesign is absent, so there's nothing left that actually needs
       * the gate.
       */}
      <View style={{ position: "absolute", top: (MANDALA_SIZE - MANDALA_CENTER_CHART_HEIGHT) / 2, left: (MANDALA_SIZE - MANDALA_CENTER_CHART_SIZE) / 2 }}>
        <HumanDesignBodygraphPdf
          profile={profile}
          centersColor={hdDesign?.chartDefinedColor || DEFAULT_DEFINED_FILL}
          centersMode={hdDesign?.centersMode || "uniform"}
          centerColors={centerColorsFromHdDesignPdf(hdDesign)}
          channelsColor={hdDesign?.channelsColor || DEFINED_STROKE}
          gatesColor={hdDesign?.gatesColor || "#e4e4e7"}
          backgroundColor="transparent"
          size={MANDALA_CENTER_CHART_SIZE}
        />
      </View>
    </View>
  );
}

// ── Astrology wheel (react-pdf Svg) — 2026-08-10 parity + visual-polish
// pass. Ports astrology-wheel-chart.tsx's now-current design (filled sign
// wedges, shaded house ring, all 4 angle labels) into react-pdf's own
// primitives, and brings this PDF up from a real, substantial gap it had
// before: it was missing house numbers, ALL aspect lines, retrograde
// markers, and 3 of the 4 angle labels entirely (only AC/MC existed).
// Same layout/color constants and declutter logic as the web chart via
// astrology-wheel-constants.ts — the two can't drift apart. ASCII-safe
// sign abbreviations instead of Unicode glyphs stay local to this file
// (see header note #1 for why: react-pdf's Helvetica has no astrological
// Unicode glyphs at all).

const SIGN_ABBR: Record<ZodiacSign, string> = {
  Aries: "Ari", Taurus: "Tau", Gemini: "Gem", Cancer: "Can", Leo: "Leo", Virgo: "Vir",
  Libra: "Lib", Scorpio: "Sco", Sagittarius: "Sag", Capricorn: "Cap", Aquarius: "Aqu", Pisces: "Pis",
};

function AngleLabelPdf({ longitude, ascLon, accent, text }: { longitude: number; ascLon: number; accent: string; text: string }) {
  const pos = toXY(screenAngle(longitude, ascLon), ANGLE_LABEL_R);
  return (
    <Text x={pos.x} y={pos.y + 1} style={{ fontSize: 2.6, fontWeight: 700, textAnchor: "middle", fill: accent }}>
      {text}
    </Text>
  );
}

/** Exported 2026-08-12 — see HumanDesignFullChartPdf's export note above. */
export function AstrologyWheelPdf({ chart, wheelAccentColor }: { chart: AstrologyChart; wheelAccentColor: string }) {
  const ascLon = chart.angles.ascendant.longitude;
  const plotted = plotPlacements(chart.placements, ascLon);

  return (
    // -6/-6/112/112, not 0/0/100/100 — same real clipping bug found and
    // fixed on the web chart: AC/DC's label anchor points sit exactly at
    // ANGLE_LABEL_R's left/right extremes (the old tight viewBox's own
    // edge), so center-anchored text lost its first character. Fixed the
    // same way here before it ever shipped, not discovered separately.
    <Svg viewBox="-6 -6 112 112" style={{ width: 300, height: 300 }}>
      <Rect x={-6} y={-6} width={112} height={112} fill="#ffffff" />

      {/* House ring fill, then a white punch-out for the center aspect zone — same 3-ring hierarchy as the web chart. */}
      <Circle cx={CX} cy={CY} r={SIGN_RING_INNER} fill={HOUSE_RING_FILL} />
      <Circle cx={CX} cy={CY} r={HOUSE_LINE_INNER} fill="#ffffff" />

      {/* Sign ring — 12 filled wedges + abbreviations */}
      {(Object.keys(SIGN_ABBR) as ZodiacSign[]).map((sign, i) => {
        const signStartLon = i * 30;
        const a1 = screenAngle(signStartLon, ascLon);
        const a2 = screenAngle(signStartLon + 30, ascLon);
        const mid = screenAngle(signStartLon + 15, ascLon);
        const glyphPos = toXY(mid, (SIGN_RING_OUTER + SIGN_RING_INNER) / 2);
        const p1i = toXY(a1, SIGN_RING_INNER);
        const p1o = toXY(a1, SIGN_RING_OUTER);
        return (
          <G key={sign}>
            <Path d={wedgePath(a1, a2, SIGN_RING_OUTER, SIGN_RING_INNER)} fill={SIGN_COLORS[sign]} fillOpacity={0.55} />
            <Line x1={p1i.x} y1={p1i.y} x2={p1o.x} y2={p1o.y} stroke={WHEEL_LINE} strokeWidth={0.3} />
            <Text x={glyphPos.x} y={glyphPos.y + 1} style={{ fontSize: 2.4, textAnchor: "middle", fill: WHEEL_TEXT }}>{SIGN_ABBR[sign]}</Text>
          </G>
        );
      })}
      <Circle cx={CX} cy={CY} r={SIGN_RING_OUTER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />
      <Circle cx={CX} cy={CY} r={SIGN_RING_INNER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />

      {/* House cusps + house numbers — the numbers were missing entirely before this pass */}
      {chart.houses.cusps.map((cusp) => {
        const angle = screenAngle(cusp.longitude, ascLon);
        const outer = toXY(angle, SIGN_RING_INNER);
        const inner = toXY(angle, HOUSE_LINE_INNER);
        const label = toXY(angle + 4, HOUSE_LABEL_R);
        const isAngle = cusp.house === 1 || cusp.house === 10;
        return (
          <G key={cusp.house}>
            <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={WHEEL_LINE} strokeWidth={isAngle ? 0.9 : 0.4} />
            <Text x={label.x} y={label.y + 1} style={{ fontSize: 2.6, textAnchor: "middle", fill: WHEEL_TEXT }}>
              {cusp.house}
            </Text>
          </G>
        );
      })}

      <Circle cx={CX} cy={CY} r={HOUSE_LINE_INNER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />

      {/* Aspect lines — entirely missing before this pass */}
      {chart.aspects.map((asp, i) => {
        const style = ASPECT_STYLE[asp.type];
        if (!style) return null;
        const a = plotted.get(asp.bodyA);
        const b = plotted.get(asp.bodyB);
        if (!a || !b) return null;
        const p1 = toXY(a.angle, a.r);
        const p2 = toXY(b.angle, b.r);
        return (
          <Line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={style.stroke}
            strokeWidth={0.4}
            strokeDasharray={style.dash}
            strokeOpacity={0.6}
          />
        );
      })}

      {/* Planets, with retrograde markers — the ℞ marker was missing before this pass */}
      {chart.placements.map((p) => {
        const plot = plotted.get(p.body);
        if (!plot) return null;
        const pos = toXY(plot.angle, plot.r);
        return (
          <G key={p.body}>
            <Circle cx={pos.x} cy={pos.y} r={3.2} fill="#fff" stroke={wheelAccentColor} strokeWidth={0.35} />
            <Text x={pos.x} y={pos.y + 1} style={{ fontSize: 2.4, textAnchor: "middle", fill: wheelAccentColor }}>{PLANET_ABBR[p.body] ?? p.body.slice(0, 2)}</Text>
            {p.retrograde && (
              <Text x={pos.x + 3.4} y={pos.y - 1.8} style={{ fontSize: 1.9, fill: RETRO_COLOR }}>
                R
              </Text>
            )}
          </G>
        );
      })}

      {/* All 4 angles — was AC/MC only before this pass */}
      <AngleLabelPdf longitude={chart.angles.ascendant.longitude} ascLon={ascLon} accent={wheelAccentColor} text="AC" />
      <AngleLabelPdf longitude={chart.angles.descendant.longitude} ascLon={ascLon} accent={wheelAccentColor} text="DC" />
      <AngleLabelPdf longitude={chart.angles.mc.longitude} ascLon={ascLon} accent={wheelAccentColor} text="MC" />
      <AngleLabelPdf longitude={chart.angles.ic.longitude} ascLon={ascLon} accent={wheelAccentColor} text="IC" />
    </Svg>
  );
}

// ── Frequency / Gene Keys Hologenetic Profile chart (react-pdf Svg) —
// rebuilt 2026-08-15 (Phase 5) to mirror gene-keys-chart.tsx's real
// radial-by-planetary-body structure exactly (see that file's own header
// for the full derivation — every position/connection below is copied
// from the same SPHERE_POSITION/SEQUENCES tables, not re-derived). react-
// pdf can't share the DOM component directly (same constraint as the
// BodyGraph/Mandala PDF mirrors below), so this ports it to G/Line/Circle/
// Text/Path. No hover state — a PDF page is static, same reasoning
// HumanDesignFullChartPdf already documents for its own responsive/
// interactive web-only features. ──

type GkAxis = "sun" | "earth" | "venus" | "mars" | "jupiter" | "moon";
type GkRing = "personality" | "design";

const GK_AXIS_ORDER: GkAxis[] = ["earth", "sun", "jupiter", "mars", "venus", "moon"];

const GK_SPHERE_POSITION: Record<GeneKeysSphereResult["sphere"], { axis: GkAxis; ring: GkRing }> = {
  "Life's Work": { axis: "sun", ring: "personality" },
  Brand: { axis: "sun", ring: "personality" },
  Radiance: { axis: "sun", ring: "design" },
  Evolution: { axis: "earth", ring: "personality" },
  Purpose: { axis: "earth", ring: "design" },
  IQ: { axis: "venus", ring: "personality" },
  SQ: { axis: "venus", ring: "design" },
  EQ: { axis: "mars", ring: "personality" },
  Vocation: { axis: "mars", ring: "design" },
  Culture: { axis: "jupiter", ring: "design" },
  Pearl: { axis: "jupiter", ring: "personality" },
  Attraction: { axis: "moon", ring: "design" },
};

const GK_SEQUENCES: { key: "activation" | "venus" | "pearl"; color: string; order: GeneKeysSphereResult["sphere"][] }[] = [
  { key: "activation", color: "#b45309", order: ["Life's Work", "Evolution", "Radiance", "Purpose"] },
  { key: "venus", color: "#9d3a63", order: ["Attraction", "IQ", "EQ", "SQ"] },
  { key: "pearl", color: "#5E2574", order: ["Vocation", "Culture", "Brand", "Pearl"] },
];

const GK_VIEW = 340;
const GK_CENTER = GK_VIEW / 2;
const GK_OUTER_R = 118;
const GK_INNER_R = 66;
const GK_NODE_R_OUTER = 12;
const GK_NODE_R_INNER = 10;
const GK_SPOKE_COLOR = "#e4e4e7";
const GK_LABEL_COLOR = "#52525b";

function gkAxisAngleRad(axisIndex: number): number {
  return ((-90 + axisIndex * 60) * Math.PI) / 180;
}
function gkAxisIndexOf(axis: GkAxis): number {
  return GK_AXIS_ORDER.indexOf(axis);
}
function gkPointOn(radius: number, axisIndex: number): { x: number; y: number } {
  const a = gkAxisAngleRad(axisIndex);
  return { x: GK_CENTER + radius * Math.cos(a), y: GK_CENTER + radius * Math.sin(a) };
}
function gkLabelAnchor(axisIndex: number): { anchor: "start" | "middle" | "end"; dy: number } {
  const a = gkAxisAngleRad(axisIndex);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
  const dy = sin > 0.35 ? 9 : sin < -0.35 ? -4 : 3;
  return { anchor, dy };
}

/** Mirrors GeneKeysChart in gene-keys-chart.tsx. Fixed pixel size, no responsive/container-query layout needed — a PDF page is a fixed known size, same reasoning HumanDesignFullChartPdf already documents. */
/** Exported 2026-08-15 (Phase 5) so report-design-pdf-document.tsx (custom ReportDesign PDF export) can render a Report Builder "Frequency" chart block — same reuse pattern already established for HumanDesignFullChartPdf/MandalaPdf/AstrologyWheelPdf above. */
export function GeneKeysChartPdf({ spheres }: { spheres: GeneKeysSphereResult[] }) {
  if (spheres.length === 0) return null;
  const bySphere = new Map(spheres.map((s) => [s.sphere, s]));

  const nodesByKey = new Map<string, { axis: GkAxis; ring: GkRing; spheres: GeneKeysSphereResult[] }>();
  for (const s of spheres) {
    const pos = GK_SPHERE_POSITION[s.sphere];
    if (!pos) continue;
    const key = `${pos.axis}-${pos.ring}`;
    const existing = nodesByKey.get(key);
    if (existing) existing.spheres.push(s);
    else nodesByKey.set(key, { axis: pos.axis, ring: pos.ring, spheres: [s] });
  }

  return (
    <Svg viewBox={`0 0 ${GK_VIEW} ${GK_VIEW}`} style={{ width: 300, height: 300 }}>
      {GK_AXIS_ORDER.map((axis, i) => {
        const outer = gkPointOn(GK_OUTER_R, i);
        return <Line key={axis} x1={GK_CENTER} y1={GK_CENTER} x2={outer.x} y2={outer.y} stroke={GK_SPOKE_COLOR} strokeWidth={1} />;
      })}

      {GK_SEQUENCES.map((seq) => {
        const pts = seq.order
          .map((name) => {
            const pos = GK_SPHERE_POSITION[name];
            if (!pos || !bySphere.has(name)) return null;
            const r = pos.ring === "personality" ? GK_OUTER_R : GK_INNER_R;
            return gkPointOn(r, gkAxisIndexOf(pos.axis));
          })
          .filter((p): p is { x: number; y: number } => p !== null);
        if (pts.length < 2) return null;
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
        return <Path key={seq.key} d={d} fill="none" stroke={seq.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
      })}

      {Array.from(nodesByKey.values()).map((node) => {
        const axisIndex = gkAxisIndexOf(node.axis);
        const r = node.ring === "personality" ? GK_OUTER_R : GK_INNER_R;
        const nodeR = node.ring === "personality" ? GK_NODE_R_OUTER : GK_NODE_R_INNER;
        const pt = gkPointOn(r, axisIndex);
        const color = node.ring === "personality" ? PERSONALITY_FILL : DESIGN_FILL;
        const { anchor, dy } = gkLabelAnchor(axisIndex);
        // Same 2 real bugs as the web GeneKeysChart, caught 2026-08-15
        // rendering an actual PDF and looking at it directly: (1) Design-
        // ring labels sitting inside their own node (r - 17, toward the
        // shared center where all 6 axes converge) now offset outward
        // instead, same as Personality's own offset direction; (2) the one
        // collapsed 2-sphere node's combined "Life's Work / Brand" label
        // ran well past the canvas edge at its diagonal angle — showing
        // only the primary sphere name fixes the clip without losing
        // information (this PDF has no hover/title equivalent, but the
        // reading's own sphere detail section always lists both in full).
        const labelR = node.ring === "personality" ? r + 16 : r + 14;
        const labelPt = gkPointOn(labelR, axisIndex);
        const primary = node.spheres[0];
        return (
          <G key={`${node.axis}-${node.ring}`}>
            <Circle cx={pt.x} cy={pt.y} r={nodeR} fill={color} stroke="#ffffff" strokeWidth={1.5} />
            {/* Single template-literal child, not `{gate}.{line}` as 3 separate JSX children — react-pdf's Svg Text (unlike its regular document-flow Text, and unlike a browser's DOM svg <text>) doesn't reliably concatenate multiple text-node children into one run; real bug caught 2026-08-10 by exporting an actual PDF. */}
            <Text x={pt.x} y={pt.y + 2.6} style={{ fontSize: 7.5, fontWeight: 700, textAnchor: "middle", fill: "#ffffff" }}>
              {`${primary.gate}.${primary.line}`}
            </Text>
            <Text x={labelPt.x} y={labelPt.y + dy} style={{ fontSize: 7.5, fontWeight: 600, textAnchor: anchor, fill: GK_LABEL_COLOR }}>
              {primary.sphere}
            </Text>
          </G>
        );
      })}
    </Svg>
  );
}

// ── document ──

export function ReadingPdfDocument({
  readerName,
  birthDate,
  birthPlace,
  businessName,
  businessLogoUrl,
  humanDesign,
  astrology,
  spheres,
  hdDesign,
  mandalaDesign,
  astroDesign,
}: {
  readerName: string;
  birthDate: string;
  birthPlace: string;
  businessName: string;
  businessLogoUrl?: string | null;
  humanDesign?: (HumanDesignProfile & { content?: HumanDesignReadingContent }) | null;
  astrology?: (AstrologyChart & { content?: AstrologyReadingContent }) | null;
  spheres?: GeneKeysSphereResult[];
  /** The sub-account's default Human Design Chart Design — same shape/fallback contract as the web renderers (human-design-chart.tsx / human-design-full-chart.tsx); undefined/null renders correctly with the same traditional defaults. */
  hdDesign?: ChartDesign | null;
  /** The sub-account's default Mandala Chart Design (system: "mandala", a separate record from hdDesign) — same source reading-summary.tsx reads. Mandala section only renders when this is present, mirroring the web's own `{mandalaDesign && (...)}` guard. */
  mandalaDesign?: ChartDesign | null;
  /** The sub-account's default Astrology Chart Design (system: "astrology") — same source reading-summary.tsx's AstrologySummary reads. Only wheelAccentColor is used today (planet markers, angle labels), same as the web wheel; undefined/null falls back to the fixed WHEEL_TEXT ink color. */
  astroDesign?: ChartDesign | null;
}) {
  const hdContent = humanDesign?.content;
  const astroContent = astrology?.content;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {businessLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={businessLogoUrl} style={styles.headerLogo} />
            ) : (
              <Text style={styles.businessName}>{businessName}</Text>
            )}
            <Text style={styles.readerName}>{readerName}</Text>
            <Text style={styles.readerMeta}>{birthPlace} · born {birthDate}</Text>
          </View>
        </View>

        {humanDesign && (
          <View>
            <Text style={styles.sectionTitle}>Human Design</Text>
            <View style={styles.factGrid}>
              <Fact label="Type" value={humanDesign.type} />
              <Fact label="Strategy" value={hdContent?.typeStrategy || TYPE_CONTENT[humanDesign.type].strategy} />
              <Fact label="Authority" value={humanDesign.authority} />
              <Fact label="Profile" value={humanDesign.profile ?? "—"} />
              <Fact label="Definition" value={humanDesign.definitionLabel} />
              <Fact label="Signature" value={humanDesign.signature} />
              <Fact label="Not-Self Theme" value={humanDesign.notSelfTheme} />
              {humanDesign.incarnationCross && <Fact label="Incarnation Cross" value={humanDesign.incarnationCross} />}
            </View>
            <Text style={styles.para}>
              {hdContent?.typeDescription || TYPE_CONTENT[humanDesign.type].description}
            </Text>
            <Text style={styles.para}>
              {hdContent?.authorityDescription || AUTHORITY_CONTENT[humanDesign.authority].description}
            </Text>

            <View style={styles.chartWrap}>
              <HumanDesignFullChartPdf profile={humanDesign} hdDesign={hdDesign} />
            </View>

            {mandalaDesign && (
              <View style={styles.chartWrap} break>
                <Text style={styles.centerLabel}>Mandala</Text>
                <MandalaPdf
                  profile={humanDesign}
                  gateColor={mandalaDesign.chartDefinedColor || DEFAULT_DEFINED_FILL}
                  backgroundColor={mandalaDesign.backgroundColor || "#ffffff"}
                  personalityColor={mandalaDesign.personalityActivationColor}
                  designColor={mandalaDesign.designActivationColor}
                  zodiacColor={mandalaDesign.mandalaZodiacColor}
                  gateRingColor={mandalaDesign.mandalaGateRingColor}
                  quadrantColor={mandalaDesign.mandalaQuadrantColor}
                  hdDesign={hdDesign}
                />
              </View>
            )}

            {humanDesign.variables && (
              <View>
                <Text style={styles.centerLabel}>Variables</Text>
                <View style={styles.blockGrid}>
                  <VariableBlock label="Digestion" field={humanDesign.variables.digestion} />
                  <VariableBlock label="Sense" field={humanDesign.variables.sense} />
                  <VariableBlock label="Design Sense" field={humanDesign.variables.designSense} />
                  <VariableBlock label="Motivation" field={humanDesign.variables.motivation} />
                  <VariableBlock label="Perspective" field={humanDesign.variables.perspective} />
                  <VariableBlock label="Environment" field={humanDesign.variables.environment} />
                </View>
              </View>
            )}

            {humanDesign.skills && (
              <View>
                <Text style={styles.centerLabel}>Skills &amp; Attributes</Text>
                {humanDesign.skills.framingLine && (
                  <Text style={[styles.para, { fontSize: 8, fontStyle: "italic" }]}>{humanDesign.skills.framingLine}</Text>
                )}
                <SkillLayerBlock title="Core Strengths" entries={humanDesign.skills.coreStrengths} />
                <SkillLayerBlock title="Signature Talents" entries={humanDesign.skills.signatureTalents} />
                <SkillLayerBlock title="Natural Gifts" entries={humanDesign.skills.naturalGifts} />
              </View>
            )}

            <Text style={styles.centerLabel}>Centers</Text>
            <View style={styles.blockGrid}>
              {(CENTERS as readonly CenterKey[]).map((c) => {
                const defined = humanDesign.definedCenters.includes(c);
                const cc = hdContent?.centers[c];
                const text = defined
                  ? cc?.definedText || CENTER_CONTENT[c].definedText
                  : cc?.undefinedText || CENTER_CONTENT[c].undefinedText;
                return (
                  <View key={c} style={[styles.block, defined ? { backgroundColor: "#F3E4F0", borderColor: "#dcc3d8" } : {}]}>
                    <Text style={styles.blockTitle}>{CENTER_LABELS[c]} — {defined ? "Defined" : "Undefined"}</Text>
                    <Text style={styles.blockText}>{text}</Text>
                  </View>
                );
              })}
            </View>

            {humanDesign.definedChannels.length > 0 && (
              <View>
                <Text style={styles.centerLabel}>Defined Channels</Text>
                <View style={styles.pillRow}>
                  {humanDesign.definedChannels.map((ch) => (
                    <Text key={ch.key} style={styles.pill}>
                      {ch.gates[0]}-{ch.gates[1]}{ch.name ? ` · ${ch.name}` : ""}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.centerLabel}>Activated Gates</Text>
            <View style={styles.pillRow}>
              {humanDesign.activatedGates.map((g) => (
                <Text key={g} style={styles.pill}>{g}</Text>
              ))}
            </View>
          </View>
        )}

        {astrology && (
          <View break={!!humanDesign}>
            <Text style={styles.sectionTitle}>Astrology</Text>
            <View style={styles.factGrid}>
              <Fact label="Sun" value={astrology.placements.find((p) => p.body === "sun")?.sign ?? "—"} />
              <Fact label="Moon" value={astrology.placements.find((p) => p.body === "moon")?.sign ?? "—"} />
              <Fact label="Rising" value={astrology.angles.ascendant.sign} />
              <Fact label="Midheaven" value={astrology.angles.mc.sign} />
              {astrology.placements.find((p) => p.body === "chiron") && (
                <Fact label="Chiron" value={astrology.placements.find((p) => p.body === "chiron")!.sign} />
              )}
            </View>
            <View style={styles.chartWrap}>
              <AstrologyWheelPdf chart={astrology} wheelAccentColor={astroDesign?.wheelAccentColor || WHEEL_TEXT} />
            </View>

            <Text style={styles.centerLabel}>Placements</Text>
            {astrology.placements.map((p) => {
              const signText = astroContent?.signs[p.sign];
              return (
                <View key={p.body} style={{ marginBottom: 5 }}>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>
                      {p.body.charAt(0).toUpperCase() + p.body.slice(1)} — House {p.house}{p.retrograde ? " (retrograde)" : ""}
                    </Text>
                    <Text style={styles.rowValue}>{p.sign} {p.degInSign.toFixed(1)}°</Text>
                  </View>
                  {signText && <Text style={[styles.blockText, { marginTop: 1 }]}>{signText}</Text>}
                </View>
              );
            })}

            <Text style={styles.centerLabel}>Houses</Text>
            <View style={styles.pillRow}>
              {astrology.houses.cusps.map((c) => (
                <Text key={c.house} style={styles.pill}>
                  House {c.house}: {c.sign} {c.degInSign.toFixed(1)}°
                </Text>
              ))}
            </View>

            {astrology.aspects.length > 0 && (
              <View>
                <Text style={styles.centerLabel}>Aspects</Text>
                {astrology.aspects.slice(0, 14).map((a, i) => (
                  <View key={i} style={{ marginBottom: 4 }}>
                    <Text style={styles.rowLabel}>
                      {cap(a.bodyA)} {a.type} {cap(a.bodyB)} ({a.orb.toFixed(1)}° from exact)
                    </Text>
                    <Text style={styles.blockText}>{astroContent?.aspectTypes[a.type] || ASPECT_TYPE_CONTENT[a.type as AspectType]}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {spheres && spheres.length > 0 && (
          <View break={!!(humanDesign || astrology)}>
            <Text style={styles.sectionTitle}>Frequency</Text>
            <View style={styles.chartWrap}>
              <GeneKeysChartPdf spheres={spheres} />
            </View>
            {spheres.map((s) => (
              <View key={s.sphere} style={{ marginBottom: 8 }}>
                <Text style={styles.factLabel}>{s.sphere} — Gate {s.gate}.{s.line}</Text>
                <Text style={styles.para}>{s.shadow} -&gt; {s.gift} -&gt; {s.siddhi}</Text>
                {(s.showsUp || s.giftText) && (
                  <Text style={styles.blockText}>{s.showsUp} {s.giftText}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          Generated by {businessName}
        </Text>
      </Page>
    </Document>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factCard}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function VariableBlock({ label, field }: { label: string; field: { value: string; description: string } }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{label}: {field.value}</Text>
      {field.description && <Text style={styles.blockText}>{field.description}</Text>}
    </View>
  );
}

/**
 * One layer of the local Skills & Attributes section (Core Strengths /
 * Signature Talents / Natural Gifts) — mirrors reading-summary.tsx's
 * SkillLayerList for web. See human-design-skills-service.ts for how each
 * layer's entries are chosen and composed. Renders nothing when a person
 * has no entries for a layer.
 */
function SkillLayerBlock({ title, entries }: { title: string; entries: LocalSkillEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <View>
      <Text style={[styles.centerLabel, { fontSize: 7, color: "#6b6b76", marginTop: 4, marginBottom: 2 }]}>{title}</Text>
      <View style={styles.blockGrid}>
        {entries.map((entry, i) => (
          <View key={`${entry.headline}-${i}`} style={styles.block}>
            <Text style={styles.blockTitle}>
              {entry.headline}
              {entry.meta ? ` (${entry.meta})` : ""}
            </Text>
            {entry.description && <Text style={styles.blockText}>{entry.description}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}
