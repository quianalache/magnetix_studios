import type { AstrologyChart } from "@/lib/energetics/astrology";
import {
  ASTRO_CX,
  ASTRO_CY,
  ASTRO_DEFAULT_MARGIN,
  ASTRO_GLYPH_FONT,
  ASTRO_RINGS,
  ASTRO_TYPE,
  astroViewBox,
  buildAstrologyModel,
  glyphText,
  resolveAstrologyColors,
  type ResolvedAstrologyColors,
} from "@/lib/energetics/astrology-spec";

/**
 * The natal wheel (browser). Everything it draws — geometry, glyphs, the
 * planet layout, aspect weights and every color — comes from
 * astrology-spec.ts, the same model AstrologyWheelPdf draws, so the two
 * can't drift. Generic chart-wheel convention: Ascendant at 9 o'clock,
 * longitude counterclockwise, every point at its calculated position.
 *
 * 2026-10 (Chart Designs → Astrology): element-colored zodiac band with
 * text glyphs (U+FE0E + symbol fonts — never color emoji), degree ticks,
 * bare planet glyphs with a tick at each planet's true degree (glyphs of a
 * cluster spread both ways around it), aspect lines inside an aspect circle
 * half the wheel's radius running between TRUE degrees and weighted by
 * orb, AC–DC / MC–IC axes past the band. All 18 colors are Chart Design
 * values (resolveAstrologyColors).
 *
 * Sizing: the SVG fills its wrapper; the margin around the wheel is inside
 * the viewBox (`margin`), not wrapper padding — a percentage padding
 * resolves against the parent's width, which made the chart shrink as its
 * card grew.
 */
export function AstrologyWheelChart({
  chart,
  className,
  colors,
  wheelAccentColor,
  backgroundColor,
  margin = ASTRO_DEFAULT_MARGIN,
}: {
  chart: AstrologyChart;
  className?: string;
  /** The design's resolved Astrology colors (resolveAstrologyColors(design)). */
  colors?: ResolvedAstrologyColors;
  /** Only when `colors` isn't passed: planet color + background of a design-less chart. */
  wheelAccentColor?: string;
  backgroundColor?: string;
  /** Margin around the wheel in view units (the editor preview uses ASTRO_EDITOR_MARGIN). */
  margin?: number;
}) {
  const c = colors ?? resolveAstrologyColors({ wheelAccentColor, backgroundColor });
  const m = buildAstrologyModel(chart, c);
  const R = ASTRO_RINGS;
  const T = ASTRO_TYPE;

  return (
    <div className={className} style={{ background: c.background, borderRadius: 12 }}>
      <svg viewBox={astroViewBox(margin)} role="img" aria-label="Astrology natal chart wheel" style={{ display: "block", width: "100%", height: "auto" }}>
        {/* House ring, then the aspect circle on top of it */}
        <circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.bandInner} fill={c.housesBackground} />
        <circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.aspect} fill={c.aspectsBackground} />

        {/* House cusps (under the axes, which run along the 1st/4th/7th/10th cusps in most house systems) */}
        {m.cusps.map((cusp) => (
          <line key={cusp.house} data-astro-cusp={cusp.house} x1={cusp.x1} y1={cusp.y1} x2={cusp.x2} y2={cusp.y2} stroke={c.houseLines} strokeWidth={0.45} />
        ))}

        {/* AC–DC and MC–IC axes: drawn before the zodiac band, so the band covers them — they show across the house ring and past the band, never over a sign glyph */}
        {m.axes.map((a) => (
          <line key={a.key} data-astro-angle={a.key} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={c.angles} strokeWidth={1.1} strokeLinecap="round" />
        ))}

        {/* Zodiac band: element colors, sign dividers, glyphs */}
        {m.signs.map((s) => (
          <g key={s.sign} data-astro-sign={s.sign} data-element={s.element}>
            <path d={s.path} fill={s.fill} />
            <line {...s.divider} stroke={c.wheelLines} strokeWidth={0.4} />
            <text
              data-zodiac-glyph={s.sign}
              x={s.glyphPos.x}
              y={s.glyphPos.y}
              fontSize={T.zodiacGlyph}
              fontFamily={ASTRO_GLYPH_FONT}
              fill={c.zodiacSymbols}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {glyphText(s.glyph)}
            </text>
          </g>
        ))}
        <circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.outer} fill="none" stroke={c.wheelLines} strokeWidth={0.5} />
        <circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.bandInner} fill="none" stroke={c.wheelLines} strokeWidth={0.5} />

        {/* Degree ticks (1° / 5° / 10°) */}
        <path data-astro-ticks d={m.tickPath} stroke={c.wheelLines} strokeWidth={0.3} fill="none" />

        {/* House numbers */}
        {m.houseNumbers.map((h) => (
          <text key={h.house} data-astro-house={h.house} x={h.x} y={h.y} fontSize={T.houseNumber} fill={c.houseNumbers} textAnchor="middle" dominantBaseline="central">
            {h.house}
          </text>
        ))}

        {/* Aspect circle edge, then the aspect lines between true degrees */}
        <circle cx={ASTRO_CX} cy={ASTRO_CY} r={R.aspect} fill="none" stroke={c.wheelLines} strokeWidth={0.5} />
        {m.aspects.map((a, i) => (
          <line
            key={i}
            data-astro-aspect={a.type}
            x1={a.x1}
            y1={a.y1}
            x2={a.x2}
            y2={a.y2}
            stroke={a.color}
            strokeWidth={a.width}
            strokeOpacity={a.opacity}
            strokeDasharray={a.dash}
            strokeLinecap="round"
          />
        ))}

        {/* Angle labels (their axes are drawn under the zodiac band, above) */}
        {m.axes.map((a) => (
          <text key={a.key} data-astro-angle-label={a.key} x={a.label.x} y={a.label.y} fontSize={T.angleLabel} fontWeight={700} fill={c.angles} textAnchor="middle" dominantBaseline="central">
            {a.key}
          </text>
        ))}

        {/* Planets: true-degree tick (+ connector when the glyph moved), bare glyph, retrograde mark */}
        {m.planets.map((p) => (
          <g key={p.body} data-astro-planet={p.body} data-true-angle={p.trueAngle} data-display-angle={p.displayAngle}>
            <line {...p.tick} stroke={c.planets} strokeWidth={0.7} strokeLinecap="round" />
            {p.connector && <line {...p.connector} stroke={c.planets} strokeWidth={0.3} strokeOpacity={0.6} />}
            <text x={p.pos.x} y={p.pos.y} fontSize={T.planetGlyph} fontFamily={ASTRO_GLYPH_FONT} fill={c.planets} textAnchor="middle" dominantBaseline="central">
              {glyphText(p.glyph)}
            </text>
            {p.retrograde && (
              <text x={p.retroPos.x} y={p.retroPos.y} fontSize={T.retrograde} fill={c.planets} textAnchor="middle" dominantBaseline="central">
                {glyphText("℞")}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
