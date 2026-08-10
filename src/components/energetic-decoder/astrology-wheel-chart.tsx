import type { AstrologyChart, AspectType, ZodiacSign } from "@/lib/energetics/astrology";

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
 */

const WHEEL_LINE = "#a1a1aa"; // zinc-400
const WHEEL_TEXT = "#3f3f46"; // zinc-700

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

const ASPECT_STYLE: Record<AspectType, { stroke: string; dash?: string } | null> = {
  Conjunction: null, // bodies already sit right next to each other on the ring — a line adds nothing
  Sextile: { stroke: "#0d9488" },
  Square: { stroke: "#dc2626" },
  Trine: { stroke: "#2563eb" },
  Opposition: { stroke: "#dc2626", dash: "1.5,1.2" },
};

const CX = 50;
const CY = 50;
const SIGN_RING_OUTER = 47;
const SIGN_RING_INNER = 40;
const HOUSE_LINE_INNER = 10;
const HOUSE_LABEL_R = 15;
const PLANET_R_A = 33;
const PLANET_R_B = 29;
const MIN_SEPARATION_DEG = 7;

function toXY(screenAngleDeg: number, r: number): { x: number; y: number } {
  const rad = (screenAngleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

/** Ascendant fixed at 9 o'clock (180°); every other longitude plotted at its true offset from it. */
function screenAngle(longitude: number, ascLongitude: number): number {
  return 180 + (longitude - ascLongitude);
}

export function AstrologyWheelChart({
  chart,
  className,
  wheelAccentColor = WHEEL_TEXT,
  backgroundColor = "#ffffff",
}: {
  chart: AstrologyChart;
  className?: string;
  /** Sub-account's chosen accent (Chart Designs tab) — planet markers, AC/MC labels. Sign ring + house lines stay neutral gray regardless, same "structure is fixed, accent is a brand choice" rule as the bodygraph. */
  wheelAccentColor?: string;
  backgroundColor?: string;
}) {
  const ascLon = chart.angles.ascendant.longitude;

  // Declutter: sort by longitude, nudge anything within MIN_SEPARATION_DEG
  // of the previous body forward so labels don't collide. Alternates the
  // plotted radius too, so even a nudged pair stays visually distinct.
  const sorted = [...chart.placements].sort((a, b) => a.longitude - b.longitude);
  const plotted = new Map<string, { angle: number; r: number }>();
  let lastAngle: number | null = null;
  sorted.forEach((p, i) => {
    let angle = screenAngle(p.longitude, ascLon);
    if (lastAngle !== null) {
      const gap = ((angle - lastAngle + 540) % 360) - 180; // signed shortest gap, handles wraparound
      if (Math.abs(gap) < MIN_SEPARATION_DEG && gap >= 0) {
        angle = lastAngle + MIN_SEPARATION_DEG;
      }
    }
    lastAngle = angle;
    plotted.set(p.body, { angle, r: i % 2 === 0 ? PLANET_R_A : PLANET_R_B });
  });

  return (
    <div className={className} style={{ background: backgroundColor, borderRadius: 12, padding: "5%" }}>
      <svg viewBox="0 0 100 100" role="img" aria-label="Astrology natal chart wheel">
      {/* Sign ring — 12 wedges + glyphs, boundaries at each sign's true 30° start relative to ASC */}
      <circle cx={CX} cy={CY} r={SIGN_RING_OUTER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />
      <circle cx={CX} cy={CY} r={SIGN_RING_INNER} fill="none" stroke={WHEEL_LINE} strokeWidth={0.4} />
      {(Object.keys(SIGN_GLYPH) as ZodiacSign[]).map((sign, i) => {
        const signStartLon = i * 30;
        const a1 = screenAngle(signStartLon, ascLon);
        const a2 = screenAngle(signStartLon + 30, ascLon);
        const mid = screenAngle(signStartLon + 15, ascLon);
        const p1 = toXY(a1, SIGN_RING_OUTER);
        const glyphPos = toXY(mid, (SIGN_RING_OUTER + SIGN_RING_INNER) / 2);
        return (
          <g key={sign}>
            <line
              x1={toXY(a1, SIGN_RING_INNER).x}
              y1={toXY(a1, SIGN_RING_INNER).y}
              x2={p1.x}
              y2={p1.y}
              stroke={WHEEL_LINE}
              strokeWidth={0.3}
            />
            <text x={glyphPos.x} y={glyphPos.y + 1.4} fontSize={3.2} textAnchor="middle" fill={WHEEL_TEXT}>
              {SIGN_GLYPH[sign]}
            </text>
            <line
              x1={toXY(a2, SIGN_RING_INNER).x}
              y1={toXY(a2, SIGN_RING_INNER).y}
              x2={toXY(a2, SIGN_RING_OUTER).x}
              y2={toXY(a2, SIGN_RING_OUTER).y}
              stroke={WHEEL_LINE}
              strokeWidth={0.3}
            />
          </g>
        );
      })}

      {/* House cusps — real longitude-based angles, uneven under Placidus exactly like a real chart */}
      {chart.houses.cusps.map((cusp) => {
        const angle = screenAngle(cusp.longitude, ascLon);
        const outer = toXY(angle, SIGN_RING_INNER);
        const inner = toXY(angle, HOUSE_LINE_INNER);
        const label = toXY(angle + 4, HOUSE_LABEL_R);
        const isAngle = cusp.house === 1 || cusp.house === 10;
        return (
          <g key={cusp.house}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={WHEEL_LINE}
              strokeWidth={isAngle ? 0.9 : 0.4}
            />
            <text x={label.x} y={label.y + 1} fontSize={2.4} textAnchor="middle" fill={WHEEL_TEXT}>
              {cusp.house}
            </text>
          </g>
        );
      })}

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
            strokeWidth={0.35}
            strokeDasharray={style.dash}
            strokeOpacity={0.55}
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
            <circle cx={pos.x} cy={pos.y} r={2.6} fill={backgroundColor} stroke={wheelAccentColor} strokeWidth={0.3} />
            <text x={pos.x} y={pos.y + 1.1} fontSize={2.8} textAnchor="middle" fill={wheelAccentColor}>
              {PLANET_GLYPH[p.body] ?? p.body[0].toUpperCase()}
            </text>
            {p.retrograde && (
              <text x={pos.x + 3} y={pos.y - 1.5} fontSize={1.8} fill="#dc2626">
                ℞
              </text>
            )}
          </g>
        );
      })}

      {/* Ascendant / MC markers */}
      <text x={toXY(180, SIGN_RING_OUTER + 3).x} y={toXY(180, SIGN_RING_OUTER + 3).y + 1} fontSize={2.6} fontWeight={700} textAnchor="middle" fill={wheelAccentColor}>
        AC
      </text>
      <text
        x={toXY(screenAngle(chart.angles.mc.longitude, ascLon), SIGN_RING_OUTER + 3).x}
        y={toXY(screenAngle(chart.angles.mc.longitude, ascLon), SIGN_RING_OUTER + 3).y + 1}
        fontSize={2.6}
        fontWeight={700}
        textAnchor="middle"
        fill={wheelAccentColor}
      >
        MC
      </text>
      </svg>
    </div>
  );
}
