import "server-only";
import React from "react";

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
  Defs,
  RadialGradient,
  Stop,
  StyleSheet,
} from "@react-pdf/renderer";
import type { HumanDesignProfile, LocalSkillEntry } from "./human-design";
import { CENTERS, CENTER_LABELS, HD_BODY_LABELS, type CenterKey } from "./human-design-data";
import { CENTER_LAYOUT, GATE_POINT, GATE_SPINE, CHART_VIEWBOX, type CenterGeometry } from "./human-design-chart-layout";
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
  polar,
  resolveMandalaColors,
  tangentialTextRotation,
  type ResolvedMandalaColors,
  ZODIAC_GLYPH_PATHS,
  zodiacLabelLayout,
} from "./mandala-spec";
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
  FONT_SIZE_ACTIVE,
  FONT_SIZE_INACTIVE,
  declutterGateLabels,
  halfSplitDasharray,
} from "./human-design-chart-constants";
import type { AstrologyChart, AspectType } from "./astrology";
import { ASPECT_TYPE_CONTENT } from "./astrology-content-data";
import {
  ASTRO_CX,
  ASTRO_CY,
  ASTRO_DEFAULT_MARGIN,
  ASTRO_RINGS,
  ASTRO_TYPE,
  ASTRO_VIEW,
  PLANET_GLYPH_PATHS,
  ZODIAC_GLYPH_PATHS as ASTRO_ZODIAC_GLYPH_PATHS,
  buildAstrologyModel,
  resolveAstrologyColors,
  vectorGlyphTransform,
  type ResolvedAstrologyColors,
} from "./astrology-spec";
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
  personalityColor = PERSONALITY_FILL,
  designColor = DESIGN_FILL,
}: {
  profile: HumanDesignProfile;
  centersColor: string;
  centersMode: "uniform" | "traditional";
  centerColors: Partial<Record<CenterKey, string>> | undefined;
  channelsColor: string;
  gatesColor: string;
  backgroundColor: string;
  size: number;
  /** Activated-gate marker colors — only the Mandala passes these (its design's colors); every other caller keeps the defaults. */
  personalityColor?: string;
  designColor?: string;
}) {
  const definedSet = new Set(profile.definedCenters);
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));
  const allGates = Object.keys(GATE_SPINE).map(Number);
  const activatedGates = allGates.filter((g) => personalityGates.has(g) || designGates.has(g));
  const labelPositions = declutterGateLabels(activatedGates);
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

      {/* Activated gates — solid-filled circle + reversed white number. Dual activation, 2026-08-17 correction-pass-4: one plain flat-colored circle, same as every other gate (Design wins as the single color when both are active — same real rule already used for the channel spine itself). See human-design-chart.tsx's identical block for the full story. */}
      {activatedGates.map((gate) => {
        const point = labelPositions.get(gate)!;
        const inDesign = designGates.has(gate);
        const fill = inDesign ? designColor : personalityColor;
        return (
          <G key={gate}>
            <Circle cx={point.x} cy={point.y} r={GATE_MARKER_R} fill={fill} stroke={gatesColor} strokeWidth={GATE_MARKER_STROKE_WIDTH} />
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

// ── Mandala (react-pdf Svg) — 2026-10 redesign. The geometry, orientation,
// labels, colors and activation model all come from mandala-spec.ts, the
// same specification the browser MandalaChart draws (so the two can't
// drift); this function only maps that model onto react-pdf primitives.
// react-pdf's Svg has no textPath, so Quarter and zodiac labels are
// straight text turned along the band (the browser curves them), and no
// paint-order, so planet symbols get their halo from a stroked copy drawn
// first. Planet symbols use PLANET_ABBR (ASCII) because the PDF's only
// font is WinAnsi Helvetica, which can't draw the astrological glyphs.

const MANDALA_SIZE = 300; // pt — 64 gate numbers + hexagrams need this much room to stay legible

/** Exported 2026-08-12 — see HumanDesignFullChartPdf's export note above. */
export function MandalaPdf({
  profile,
  gateColor,
  backgroundColor,
  personalityColor = PERSONALITY_FILL,
  designColor = DESIGN_FILL,
  zodiacColor = "#8b5cf6",
  mandalaColors,
  gateRingColor = "#71717a",
  quadrantColor = "#71717a",
  hdDesign,
}: {
  profile: HumanDesignProfile;
  gateColor: string;
  backgroundColor: string;
  personalityColor?: string;
  designColor?: string;
  /** Legacy single zodiac color — only used when `elementColors` isn't passed. */
  zodiacColor?: string;
  /** Every Mandala color of the design, resolved (resolveMandalaColors(design)); the single-color props only seed a fallback. */
  mandalaColors?: ResolvedMandalaColors;
  gateRingColor?: string;
  quadrantColor?: string;
  hdDesign?: ChartDesign | null;
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
  const model = buildMandalaModel({ personality: profile.personality, design: profile.design }, colors);
  const R = MANDALA_RINGS;
  const k = MANDALA_SIZE / MANDALA_VIEW; // pt per Mandala unit
  const box = mandalaBodygraphBox();
  const glowId = `mandala-glow-${model.glow.color.replace("#", "")}`;
  const abbr = (body: string) => PLANET_ABBR[body] ?? body.slice(0, 2);

  return (
    <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: MANDALA_SIZE * 0.04, position: "relative" }}>
      <View style={{ position: "relative", width: MANDALA_SIZE, height: MANDALA_SIZE }}>
        <Svg viewBox={`0 0 ${MANDALA_VIEW} ${MANDALA_VIEW}`} style={{ width: MANDALA_SIZE, height: MANDALA_SIZE }}>
          <Defs>
            <RadialGradient id={glowId} cx={MANDALA_CX} cy={MANDALA_CY} r={R.glowOuter} fx={MANDALA_CX} fy={MANDALA_CY} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={model.glow.color} stopOpacity={1} />
              <Stop offset={model.glow.solidStop} stopColor={model.glow.color} stopOpacity={1} />
              <Stop offset={(model.glow.solidStop + 1) / 2} stopColor={model.glow.color} stopOpacity={0.55} />
              <Stop offset={1} stopColor={model.glow.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {model.quarters.map(({ quarter, span, fill, ink, labelAngle }) => {
            const p = polar(labelAngle, (R.quarterOuter + R.quarterInner) / 2);
            return (
              <G key={quarter.number}>
                <Path d={bandPath(span.start, span.end, R.quarterOuter, R.quarterInner)} fill={fill} stroke="#ffffff" strokeWidth={0.5} />
                <G transform={`rotate(${tangentialTextRotation(labelAngle).toFixed(2)} ${p.x.toFixed(3)} ${p.y.toFixed(3)})`}>
                  <Text x={p.x} y={p.y + MANDALA_TYPE.quarterLabel * 0.35} style={{ fontSize: MANDALA_TYPE.quarterLabel, fontWeight: 700, fill: ink, textAnchor: "middle" }}>
                    {quarter.label}
                  </Text>
                </G>
              </G>
            );
          })}

          {model.signs.map(({ sign, span, fill, ink, glyphColor }) => {
            const p = polar(span.mid, (R.zodiacOuter + R.zodiacInner) / 2);
            // Helvetica has no zodiac glyphs, so the PDF draws the vector
            // equivalent (ZODIAC_GLYPH_PATHS) beside the name.
            const fs = MANDALA_TYPE.zodiacLabel;
            const lay = zodiacLabelLayout(sign, fs);
            const k = lay.glyphSize / 10;
            return (
              <G key={sign}>
                <Path d={bandPath(span.start, span.end, R.zodiacOuter, R.zodiacInner)} fill={fill} stroke="#ffffff" strokeWidth={0.4} />
                <G transform={`rotate(${tangentialTextRotation(span.mid).toFixed(2)} ${p.x.toFixed(3)} ${p.y.toFixed(3)})`}>
                  <G transform={`translate(${(p.x + lay.glyphX).toFixed(3)} ${(p.y - lay.glyphSize / 2).toFixed(3)}) scale(${k.toFixed(4)})`}>
                    <Path d={ZODIAC_GLYPH_PATHS[sign]} fill="none" stroke={glyphColor} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
                  </G>
                  <Text x={p.x + lay.textX} y={p.y + fs * 0.35} style={{ fontSize: fs, fontWeight: 700, fill: ink }}>
                    {sign}
                  </Text>
                </G>
              </G>
            );
          })}

          <Circle cx={MANDALA_CX} cy={MANDALA_CY} r={R.field} fill={colors.background} />

          {model.gates.flatMap((g) =>
            g.wedges.map((w, i) => <Path key={`${g.gate}-${i}`} d={bandPath(w.start, w.end, R.field, 0)} fill={w.fill} fillOpacity={WEDGE_OPACITY} />),
          )}

          {model.spokes.map((s, i) => (
            <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={colors.gateLines} strokeOpacity={0.45} strokeWidth={0.18} />
          ))}
          <Circle cx={MANDALA_CX} cy={MANDALA_CY} r={R.field} fill="none" stroke={colors.gateLines} strokeOpacity={0.6} strokeWidth={0.3} />

          <Circle cx={MANDALA_CX} cy={MANDALA_CY} r={R.glowOuter} fill={`url(#${glowId})`} />

          {model.gates.map((g) => (
            <G key={g.gate}>
              {g.rim && <Path d={bandPath(g.rim.start, g.rim.end, R.field, R.field - 1.1)} fill={colors.activatedEdge} />}
              {g.hexagram.segments.map((s, i) => (
                <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={g.hexagram.stroke} strokeWidth={R.hexagramLineThickness} />
              ))}
              <G transform={`rotate(${g.number.rotate.toFixed(2)} ${g.number.x.toFixed(3)} ${g.number.y.toFixed(3)})`}>
                <Text x={g.number.x} y={g.number.y + MANDALA_TYPE.gateNumber * 0.35} style={{ fontSize: MANDALA_TYPE.gateNumber, fontWeight: 700, fill: g.number.fill, textAnchor: "middle" }}>
                  {`${g.gate}`}
                </Text>
              </G>
              {/* Two-letter abbreviations are turned along the band (like the gate numbers) so stacked ones never run into each other on the sides of the wheel. */}
              {g.planets.map((p, i) => (
                <G key={i} transform={`rotate(${g.number.rotate.toFixed(2)} ${p.x.toFixed(3)} ${p.y.toFixed(3)})`}>
                  <Text x={p.x} y={p.y + p.fontSize * 0.35} style={{ fontSize: p.fontSize * 0.8, fontWeight: 700, fill: colors.background, stroke: colors.background, strokeWidth: 0.7, textAnchor: "middle" }}>
                    {abbr(p.body)}
                  </Text>
                  <Text x={p.x} y={p.y + p.fontSize * 0.35} style={{ fontSize: p.fontSize * 0.8, fontWeight: 700, fill: p.fill, textAnchor: "middle" }}>
                    {abbr(p.body)}
                  </Text>
                </G>
              ))}
            </G>
          ))}
        </Svg>

        {/* Center BodyGraph — the same box the browser uses (mandalaBodygraphBox), in points. */}
        <View style={{ position: "absolute", left: box.x * k, top: box.y * k }}>
          <HumanDesignBodygraphPdf
            profile={profile}
            centersColor={hdDesign?.chartDefinedColor || DEFAULT_DEFINED_FILL}
            centersMode={hdDesign?.centersMode || "uniform"}
            centerColors={centerColorsFromHdDesignPdf(hdDesign)}
            channelsColor={hdDesign?.channelsColor || DEFINED_STROKE}
            gatesColor={hdDesign?.gatesColor || "#e4e4e7"}
            backgroundColor="transparent"
            size={box.w * k}
            personalityColor={colors.personality}
            designColor={colors.design}
          />
        </View>
      </View>
    </View>
  );
}

// ── Astrology wheel (react-pdf Svg) — 2026-10 Chart Designs pass. Draws
// the same model as the browser AstrologyWheelChart (astrology-spec.ts's
// buildAstrologyModel: geometry, planet layout, aspect weights, all 18
// design colors), mapped onto react-pdf primitives. The PDF's only font
// (WinAnsi Helvetica) has no astrological glyphs, so zodiac and planet
// symbols are the spec's vector line drawings (ZODIAC_GLYPH_PATHS /
// PLANET_GLYPH_PATHS), stroked in the design's colors; the retrograde mark
// is a plain "R". Text has no dominant-baseline here, so labels are
// nudged down by ~0.35 em to center on their point. ──

const ASTRO_PDF_SIZE = 300; // pt — unchanged from before this pass

function PdfVectorGlyph({ d, x, y, size, color, strokeWidth }: { d: string; x: number; y: number; size: number; color: string; strokeWidth: number }) {
  return (
    <G transform={vectorGlyphTransform(x, y, size)}>
      <Path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

/** Exported 2026-08-12 — see HumanDesignFullChartPdf's export note above. `colors` = resolveAstrologyColors(design); omitted = the design-less defaults (the same ones the browser uses). */
export function AstrologyWheelPdf({ chart, colors }: { chart: AstrologyChart; colors?: ResolvedAstrologyColors }) {
  const c = colors ?? resolveAstrologyColors(null);
  const m = buildAstrologyModel(chart, c);
  const R = ASTRO_RINGS;
  const T = ASTRO_TYPE;
  const mg = ASTRO_DEFAULT_MARGIN;
  const view = ASTRO_VIEW + 2 * mg;

  return (
    <Svg viewBox={`${-mg} ${-mg} ${view} ${view}`} style={{ width: ASTRO_PDF_SIZE, height: ASTRO_PDF_SIZE }}>
      {/* The design's background (the PDF used to be always white) */}
      <Rect x={-mg} y={-mg} width={view} height={view} fill={c.background} />
      <Circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.bandInner} fill={c.housesBackground} />
      <Circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.aspect} fill={c.aspectsBackground} />

      {m.cusps.map((cusp) => (
        <Line key={cusp.house} x1={cusp.x1} y1={cusp.y1} x2={cusp.x2} y2={cusp.y2} stroke={c.houseLines} strokeWidth={0.45} />
      ))}
      {/* Axes under the zodiac band, as in the browser */}
      {m.axes.map((a) => (
        <Line key={a.key} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={c.angles} strokeWidth={1.1} strokeLinecap="round" />
      ))}
      {m.signs.map((s) => (
        <G key={s.sign}>
          <Path d={s.path} fill={s.fill} />
          <Line x1={s.divider.x1} y1={s.divider.y1} x2={s.divider.x2} y2={s.divider.y2} stroke={c.wheelLines} strokeWidth={0.4} />
          <PdfVectorGlyph d={ASTRO_ZODIAC_GLYPH_PATHS[s.sign]} x={s.glyphPos.x} y={s.glyphPos.y} size={T.zodiacGlyph * 0.9} color={c.zodiacSymbols} strokeWidth={1.15} />
        </G>
      ))}
      <Circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.outer} fill="none" stroke={c.wheelLines} strokeWidth={0.5} />
      <Circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.bandInner} fill="none" stroke={c.wheelLines} strokeWidth={0.5} />
      <Path d={m.tickPath} stroke={c.wheelLines} strokeWidth={0.3} fill="none" />

      {m.houseNumbers.map((h) => (
        <Text key={h.house} x={h.x} y={h.y + T.houseNumber * 0.35} style={{ fontSize: T.houseNumber, textAnchor: "middle", fill: c.houseNumbers }}>
          {String(h.house)}
        </Text>
      ))}

      <Circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.aspect} fill="none" stroke={c.wheelLines} strokeWidth={0.5} />
      {m.aspects.map((a, i) => (
        <Line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={a.width} strokeOpacity={a.opacity} strokeDasharray={a.dash} strokeLinecap="round" />
      ))}

      {m.axes.map((a) => (
        <Text key={a.key} x={a.label.x} y={a.label.y + T.angleLabel * 0.35} style={{ fontSize: T.angleLabel, fontWeight: 700, textAnchor: "middle", fill: c.angles }}>
          {a.key}
        </Text>
      ))}

      {m.planets.map((p) => (
        <G key={p.body}>
          <Line x1={p.tick.x1} y1={p.tick.y1} x2={p.tick.x2} y2={p.tick.y2} stroke={c.planets} strokeWidth={0.7} strokeLinecap="round" />
          {p.connector && <Line x1={p.connector.x1} y1={p.connector.y1} x2={p.connector.x2} y2={p.connector.y2} stroke={c.planets} strokeWidth={0.3} strokeOpacity={0.6} />}
          <PdfVectorGlyph d={PLANET_GLYPH_PATHS[p.body]} x={p.pos.x} y={p.pos.y} size={T.planetGlyph * 0.85} color={c.planets} strokeWidth={1.05} />
          {p.retrograde && (
            <Text x={p.retroPos.x} y={p.retroPos.y + T.retrograde * 0.35} style={{ fontSize: T.retrograde, textAnchor: "middle", fill: c.planets }}>
              R
            </Text>
          )}
        </G>
      ))}
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
  /** The sub-account's default Astrology Chart Design (system: "astrology") — same source reading-summary.tsx's AstrologySummary reads. Resolved with resolveAstrologyColors — the same 18 colors and fallbacks as the web wheel. */
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
                  mandalaColors={resolveMandalaColors(mandalaDesign)}
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
              <AstrologyWheelPdf chart={astrology} colors={resolveAstrologyColors(astroDesign)} />
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
