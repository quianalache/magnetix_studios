import type { AstrologyChart, ZodiacSign } from "@/lib/energetics/astrology";
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
} from "@/lib/energetics/astrology-wheel-constants";

/**
 * The actual drawn natal wheel — same "that's not a chart" gap as Human
 * Design, fixed the same day. Standard, well-established chart-wheel
 * convention (not sourced from any one tool — this geometry is generic
 * astrology, the same convention every chart-drawing program uses):
 * Ascendant fixed at 9 o'clock, angle increases counterclockwise with
 * ecliptic longitude, every other point (house cusps, planets) plotted at
 * its own true longitude offset from the Ascendant — NOT forced into an
 * evenly-spaced ring, so an unequal house system (Placidus) draws
 * correctly uneven, exactly like a real chart.
 *
 * Same white-chart-surface treatment as the Human Design bodygraph
 * (2026-08-08): renders on a fixed white background regardless of the
 * app's own theme, like every real chart tool, with fixed dark-ink line/
 * text colors rather than colors that flip with dark mode.
 *
 * 2026-08-10 visual-polish pass — all layout/color constants and the
 * declutter logic now live in astrology-wheel-constants.ts, shared with
 * reading-pdf-document.tsx's AstrologyWheelPdf so the two can't drift.
 * Real gaps found auditing against a live Bodygraph astrology-chart
 * reference and fixed here: filled zodiac sign wedges (was outline-only),
 * a shaded house ring so it visually separates from the center aspect
 * zone (was one flat field with no boundary), and Descendant/IC angle
 * labels alongside the existing AC/MC (all 4 angles were already
 * calculated in astrology.ts, just not all rendered).
 */

const SIGN_GLYPH: Record<ZodiacSign, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const PLANET_GLYPH: Record<string, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
  // North/South Node + Lilith — added 2026-08-09, real free calculations (see gate-wheel.ts).
  northNode: "☊", southNode: "☋", lilith: "⚸",
  // Chiron — added 2026-08-09, from Bodygraph's API (see bodygraph-api.ts); only present when that call succeeded.
  chiron: "⚷",
};

function AngleLabel({ longitude, ascLon, accent, text }: { longitude: number; ascLon: number; accent: string; text: string }) {
  const pos = toXY(screenAngle(longitude, ascLon), ANGLE_LABEL_R);
  return (
    <text x={pos.x} y={pos.y + 1} fontSize={2.6} fontWeight={700} textAnchor="middle" fill={accent}>
      {text}
    </text>
  );
}

export function AstrologyWheelChart({
  chart,
  className,
  wheelAccentColor = WHEEL_TEXT,
  backgroundColor = "#ffffff",
}: {
  chart: AstrologyChart;
  className?: string;
  /** Sub-account's chosen accent (Chart Designs tab) — planet markers, angle labels. Sign ring + house lines stay fixed regardless, same "structure is fixed, accent is a brand choice" rule as the bodygraph. */
  wheelAccentColor?: string;
  backgroundColor?: string;
}) {
  const ascLon = chart.angles.ascendant.longitude;
  const plotted = plotPlacements(chart.placements, ascLon);

  return (
    <div className={className} style={{ background: backgroundColor, borderRadius: 12, padding: "5%" }}>
      {/* viewBox has a 6-unit margin on all sides (not "0 0 100 100") — real bug found rendering this pass: the AC/DC labels sit exactly at ANGLE_LABEL_R's left/right extremes (x=0 and x=100 in the old tight viewBox), so center-anchored text got half-clipped ("AC" -> "C", "DC" -> "D"). Same margin technique the HD BodyGraph's own viewBox already uses. */}
      <svg viewBox="-6 -6 112 112" role="img" aria-label="Astrology natal chart wheel">
        {/* House ring fill, then a white punch-out for the center aspect zone — gives the wheel real 3-ring hierarchy (colored sign ring / shaded house ring / white aspect zone) instead of one flat field. */}
        <circle cx={CX} cy={CY} r={SIGN_RING_INNER} fill={HOUSE_RING_FILL} />
        <circle cx={CX} cy={CY} r={HOUSE_LINE_INNER} fill={backgroundColor} />

        {/* Sign ring — 12 filled wedges + glyphs, boundaries at each sign's true 30° start relative to ASC */}
        {(Object.keys(SIGN_GLYPH) as ZodiacSign[]).map((sign, i) => {
          const signStartLon = i * 30;
          const a1 = screenAngle(signStartLon, ascLon);
          const a2 = screenAngle(signStartLon + 30, ascLon);
          const mid = screenAngle(signStartLon + 15, ascLon);
          const glyphPos = toXY(mid, (SIGN_RING_OUTER + SIGN_RING_INNER) / 2);
          const p1o = toXY(a1, SIGN_RING_OUTER);
          const p1i = toXY(a1, SIGN_RING_INNER);
          return (
            <g key={sign}>
              <path d={wedgePath(a1, a2, SIGN_RING_OUTER, SIGN_RING_INNER)} fill={SIGN_COLORS[sign]} fillOpacity={0.55} />
              <line x1={p1i.x} y1={p1i.y} x2={p1o.x} y2={p1o.y} stroke={WHEEL_LINE} strokeWidth={0.3} />
              <text x={glyphPos.x} y={glyphPos.y + 1.5} fontSize={3.6} textAnchor="middle" fill={WHEEL_TEXT}>
                {SIGN_GLYPH[sign]}
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={SIGN_RING_OUTER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />
        <circle cx={CX} cy={CY} r={SIGN_RING_INNER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />

        {/* House cusps — real longitude-based angles, uneven under Placidus exactly like a real chart */}
        {chart.houses.cusps.map((cusp) => {
          const angle = screenAngle(cusp.longitude, ascLon);
          const outer = toXY(angle, SIGN_RING_INNER);
          const inner = toXY(angle, HOUSE_LINE_INNER);
          const label = toXY(angle + 4, HOUSE_LABEL_R);
          const isAngle = cusp.house === 1 || cusp.house === 10;
          return (
            <g key={cusp.house}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={WHEEL_LINE} strokeWidth={isAngle ? 0.9 : 0.4} />
              <text x={label.x} y={label.y + 1} fontSize={2.6} textAnchor="middle" fill={WHEEL_TEXT}>
                {cusp.house}
              </text>
            </g>
          );
        })}

        {/* Aspect-zone boundary — closes the 3rd ring, drawn after the house cusps so it reads as a clean edge on top of them. */}
        <circle cx={CX} cy={CY} r={HOUSE_LINE_INNER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />

        {/* Aspect lines — chords between planet positions */}
        {chart.aspects.map((asp, i) => {
          const style = ASPECT_STYLE[asp.type];
          if (!style) return null;
          const a = plotted.get(asp.bodyA);
          const b = plotted.get(asp.bodyB);
          if (!a || !b) return null;
          const p1 = toXY(a.angle, a.r);
          const p2 = toXY(b.angle, b.r);
          return (
            <line
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

        {/* Planets */}
        {chart.placements.map((p) => {
          const plot = plotted.get(p.body);
          if (!plot) return null;
          const pos = toXY(plot.angle, plot.r);
          return (
            <g key={p.body}>
              <circle cx={pos.x} cy={pos.y} r={2.8} fill={backgroundColor} stroke={wheelAccentColor} strokeWidth={0.35} />
              <text x={pos.x} y={pos.y + 1.15} fontSize={3} textAnchor="middle" fill={wheelAccentColor}>
                {PLANET_GLYPH[p.body] ?? p.body[0].toUpperCase()}
              </text>
              {p.retrograde && (
                <text x={pos.x + 3.2} y={pos.y - 1.8} fontSize={1.9} fill={RETRO_COLOR}>
                  ℞
                </text>
              )}
            </g>
          );
        })}

        {/* All 4 angles — was AC/MC only; Descendant and IC were already calculated (astrology.ts's chart.angles), just not rendered. */}
        <AngleLabel longitude={chart.angles.ascendant.longitude} ascLon={ascLon} accent={wheelAccentColor} text="AC" />
        <AngleLabel longitude={chart.angles.descendant.longitude} ascLon={ascLon} accent={wheelAccentColor} text="DC" />
        <AngleLabel longitude={chart.angles.mc.longitude} ascLon={ascLon} accent={wheelAccentColor} text="MC" />
        <AngleLabel longitude={chart.angles.ic.longitude} ascLon={ascLon} accent={wheelAccentColor} text="IC" />
      </svg>
    </div>
  );
}
