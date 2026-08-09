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
  StyleSheet,
} from "@react-pdf/renderer";
import type { HumanDesignProfile } from "./human-design";
import { CENTERS, CENTER_LABELS, CHANNELS, type CenterKey } from "./human-design-data";
import { CENTER_LAYOUT, GATE_POINT, type CenterLayout, type CenterShape } from "./human-design-chart-layout";
import type { AstrologyChart, ZodiacSign } from "./astrology";
import type { GeneKeysSphereResult } from "./gene-keys";

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
 * use (CENTER_LAYOUT/GATE_POINT/CHANNELS, the real astrology wheel math) —
 * same accurate chart, just re-expressed in react-pdf's shape components.
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
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 7.5, color: "#9a9aa2", textAlign: "center" },
});

// ── Human Design chart (react-pdf Svg) — same math as human-design-chart.tsx ──

const HD_DEFAULT_FILL = "#d4d4d8";
const HD_DEFINED_STROKE = "#52525b";
const HD_UNDEFINED_FILL = "#ffffff";
const HD_UNDEFINED_STROKE = "#a1a1aa";
const HD_PERSONALITY_TEXT = "#18181b";
const HD_DESIGN_TEXT = "#dc2626";

function hdShapePoints(shape: CenterShape, cx: number, cy: number, r: number): string {
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

function HdCenterShape({ layout, defined, definedColor }: { layout: CenterLayout; defined: boolean; definedColor: string }) {
  const fill = defined ? definedColor : HD_UNDEFINED_FILL;
  const stroke = defined ? HD_DEFINED_STROKE : HD_UNDEFINED_STROKE;
  if (layout.shape === "square") {
    const r = layout.size;
    return <Rect x={layout.x - r} y={layout.y - r} width={r * 2} height={r * 2} rx={r * 0.25} fill={fill} stroke={stroke} strokeWidth={0.5} />;
  }
  return <Polygon points={hdShapePoints(layout.shape, layout.x, layout.y, layout.size)} fill={fill} stroke={stroke} strokeWidth={0.5} />;
}

function HumanDesignChartPdf({ profile, definedColor }: { profile: HumanDesignProfile; definedColor: string }) {
  const definedSet = new Set(profile.definedCenters);
  const definedChannelKeys = new Set(profile.definedChannels.map((c) => c.key));
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));

  return (
    <Svg viewBox="-4 -3 108 102" style={{ width: 260, height: 246 }}>
      <Rect x={-4} y={-3} width={108} height={102} fill="#ffffff" />
      {CHANNELS.map((ch) => {
        const a = GATE_POINT[ch.gates[0]];
        const b = GATE_POINT[ch.gates[1]];
        if (!a || !b) return null;
        const isDefined = definedChannelKeys.has(ch.key);
        return (
          <Line key={ch.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isDefined ? HD_DEFINED_STROKE : HD_DEFAULT_FILL} strokeWidth={isDefined ? 1.1 : 0.35} strokeOpacity={isDefined ? 0.9 : 0.7} />
        );
      })}
      {CENTERS.map((c) => (
        <HdCenterShape key={c} layout={CENTER_LAYOUT[c]} defined={definedSet.has(c)} definedColor={definedColor} />
      ))}
      {Object.entries(GATE_POINT).map(([gateStr, point]) => {
        const gate = Number(gateStr);
        const inPersonality = personalityGates.has(gate);
        const inDesign = designGates.has(gate);
        if (!inPersonality && !inDesign) return null;
        return (
          <Text
            key={gate}
            x={point.x}
            y={point.y + 1}
            style={{ fontSize: 2.6, fontWeight: 700, fill: inDesign ? HD_DESIGN_TEXT : HD_PERSONALITY_TEXT, textAnchor: "middle" }}
          >
            {gate}
          </Text>
        );
      })}
    </Svg>
  );
}

// ── Astrology wheel (react-pdf Svg) — same math as astrology-wheel-chart.tsx ──

const WHEEL_LINE = "#a1a1aa";
const WHEEL_TEXT = "#3f3f46";
const SIGN_GLYPH: Record<ZodiacSign, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};
const PLANET_GLYPH: Record<string, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
  northNode: "☊", southNode: "☋", lilith: "⚸", chiron: "⚷",
};
const CX = 50, CY = 50, SIGN_RING_OUTER = 47, SIGN_RING_INNER = 40, HOUSE_LINE_INNER = 10, PLANET_R_A = 33, PLANET_R_B = 29, MIN_SEPARATION_DEG = 7;

function toXY(screenAngleDeg: number, r: number): { x: number; y: number } {
  const rad = (screenAngleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}
function screenAngle(longitude: number, ascLongitude: number): number {
  return 180 + (longitude - ascLongitude);
}

function AstrologyWheelPdf({ chart }: { chart: AstrologyChart }) {
  const ascLon = chart.angles.ascendant.longitude;
  const sorted = [...chart.placements].sort((a, b) => a.longitude - b.longitude);
  const plotted = new Map<string, { angle: number; r: number }>();
  let lastAngle: number | null = null;
  sorted.forEach((p, i) => {
    let angle = screenAngle(p.longitude, ascLon);
    if (lastAngle !== null) {
      const gap = ((angle - lastAngle + 540) % 360) - 180;
      if (Math.abs(gap) < MIN_SEPARATION_DEG && gap >= 0) angle = lastAngle + MIN_SEPARATION_DEG;
    }
    lastAngle = angle;
    plotted.set(p.body, { angle, r: i % 2 === 0 ? PLANET_R_A : PLANET_R_B });
  });

  return (
    <Svg viewBox="0 0 100 100" style={{ width: 240, height: 240 }}>
      <Rect x={0} y={0} width={100} height={100} fill="#ffffff" />
      <Circle cx={CX} cy={CY} r={SIGN_RING_OUTER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />
      <Circle cx={CX} cy={CY} r={SIGN_RING_INNER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />
      {(Object.keys(SIGN_GLYPH) as ZodiacSign[]).map((sign, i) => {
        const signStartLon = i * 30;
        const mid = screenAngle(signStartLon + 15, ascLon);
        const glyphPos = toXY(mid, (SIGN_RING_OUTER + SIGN_RING_INNER) / 2);
        const a2 = screenAngle(signStartLon + 30, ascLon);
        const p2i = toXY(a2, SIGN_RING_INNER);
        const p2o = toXY(a2, SIGN_RING_OUTER);
        return (
          <G key={sign}>
            <Text x={glyphPos.x} y={glyphPos.y + 1.4} style={{ fontSize: 3.2, textAnchor: "middle", fill: WHEEL_TEXT }}>{SIGN_GLYPH[sign]}</Text>
            <Line x1={p2i.x} y1={p2i.y} x2={p2o.x} y2={p2o.y} stroke={WHEEL_LINE} strokeWidth={0.3} />
          </G>
        );
      })}
      {chart.houses.cusps.map((cusp) => {
        const angle = screenAngle(cusp.longitude, ascLon);
        const outer = toXY(angle, SIGN_RING_INNER);
        const inner = toXY(angle, HOUSE_LINE_INNER);
        const isAngle = cusp.house === 1 || cusp.house === 10;
        return <Line key={cusp.house} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={WHEEL_LINE} strokeWidth={isAngle ? 0.9 : 0.4} />;
      })}
      {chart.placements.map((p) => {
        const plot = plotted.get(p.body);
        if (!plot) return null;
        const pos = toXY(plot.angle, plot.r);
        return (
          <G key={p.body}>
            <Circle cx={pos.x} cy={pos.y} r={2.6} fill="#fff" stroke={WHEEL_TEXT} strokeWidth={0.3} />
            <Text x={pos.x} y={pos.y + 1.1} style={{ fontSize: 2.8, textAnchor: "middle", fill: WHEEL_TEXT }}>{PLANET_GLYPH[p.body] ?? p.body[0].toUpperCase()}</Text>
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
  definedColor,
}: {
  readerName: string;
  birthDate: string;
  birthPlace: string;
  businessName: string;
  businessLogoUrl?: string | null;
  humanDesign?: HumanDesignProfile | null;
  astrology?: AstrologyChart | null;
  spheres?: GeneKeysSphereResult[];
  definedColor: string;
}) {
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
              <Fact label="Strategy" value={humanDesign.strategy} />
              <Fact label="Authority" value={humanDesign.authority} />
              <Fact label="Profile" value={humanDesign.profile ?? "—"} />
              <Fact label="Definition" value={humanDesign.definitionLabel} />
              <Fact label="Signature" value={humanDesign.signature} />
              <Fact label="Not-Self Theme" value={humanDesign.notSelfTheme} />
              {humanDesign.incarnationCross && <Fact label="Incarnation Cross" value={humanDesign.incarnationCross} />}
            </View>

            <View style={styles.chartWrap}>
              <HumanDesignChartPdf profile={humanDesign} definedColor={definedColor} />
            </View>

            {humanDesign.variables && (
              <View>
                <Text style={styles.centerLabel}>Variables</Text>
                <View style={styles.factGrid}>
                  <Fact label="Digestion" value={humanDesign.variables.digestion.value} />
                  <Fact label="Sense" value={humanDesign.variables.sense.value} />
                  <Fact label="Design Sense" value={humanDesign.variables.designSense.value} />
                  <Fact label="Motivation" value={humanDesign.variables.motivation.value} />
                  <Fact label="Perspective" value={humanDesign.variables.perspective.value} />
                  <Fact label="Environment" value={humanDesign.variables.environment.value} />
                </View>
              </View>
            )}

            <Text style={styles.centerLabel}>Centers</Text>
            <View style={styles.pillRow}>
              {(CENTERS as readonly CenterKey[]).map((c) => (
                <Text key={c} style={[styles.pill, humanDesign.definedCenters.includes(c) ? { backgroundColor: "#F3E4F0" } : {}]}>
                  {CENTER_LABELS[c]}
                </Text>
              ))}
            </View>

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
              <AstrologyWheelPdf chart={astrology} />
            </View>
          </View>
        )}

        {spheres && spheres.length > 0 && (
          <View break={!!(humanDesign || astrology)}>
            <Text style={styles.sectionTitle}>Frequency</Text>
            {spheres.map((s) => (
              <View key={s.sphere} style={{ marginBottom: 8 }}>
                <Text style={styles.factLabel}>{s.sphere} — Gate {s.gate}.{s.line}</Text>
                <Text style={styles.para}>{s.shadow} → {s.gift} → {s.siddhi}</Text>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factCard}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}
