import type { AstrologyAspect, AstrologyPlacement } from "@/lib/energetics/astrology";
import {
  ASPECT_META,
  ASTRO_GLYPH_FONT,
  BODY_LABEL,
  PLANET_GLYPH,
  glyphText,
  resolveAstrologyColors,
  type ResolvedAstrologyColors,
} from "@/lib/energetics/astrology-spec";

/**
 * The planet-by-planet aspect grid — added 2026-08-15, Phase 4 of the
 * Energetic Decoder / Bodygraph parity audit. The wheel already drew
 * aspect chords (astrology-wheel-chart.tsx) and reading-summary.tsx
 * already listed the tightest 12 as sentences ("Sun conjunction Moon…"),
 * but neither is the matrix/grid view Bodygraph's own Astrology chart
 * shows alongside its wheel — real gap, not a wired-but-hidden feature.
 * No new calculation: `chart.aspects`/`chart.placements` already carry
 * every pair, computed in full by astrology.ts's own computeAspects; this
 * is a presentation-only addition over data that already existed.
 *
 * Triangular, not a full square — bodyA/bodyB pairs are unordered
 * (computeAspects only ever pushes i<j once), so a full matrix would just
 * mirror itself across the diagonal for no extra information, the same
 * convention real astrology software and Bodygraph's own grid use.
 */

/**
 * Glyphs, labels and aspect colors come from astrology-spec.ts — the same
 * values the wheel draws (2026-10: the grid kept its own colors before and
 * had drifted from the wheel's). Each aspect cell sits on the design's
 * aspect-circle background, so a dark design's light aspect colors read
 * here exactly as they do in the wheel.
 */
export function AspectGrid({
  placements,
  aspects,
  colors,
  size = "default",
}: {
  placements: AstrologyPlacement[];
  aspects: AstrologyAspect[];
  /** The design's resolved Astrology colors (resolveAstrologyColors(design)). */
  colors?: ResolvedAstrologyColors;
  /** "large": bigger cells and glyphs on wider screens (the practitioner Reading page); "default" is unchanged for every other caller. */
  size?: "default" | "large";
}) {
  const c = colors ?? resolveAstrologyColors(null);
  const large = size === "large";
  const cellSize = large ? "h-6 w-6 sm:h-9 sm:w-9 lg:h-10 lg:w-10" : "h-7 w-7";
  const headSize = large ? "w-6 sm:w-9 lg:w-10" : "w-7";
  if (placements.length < 2) return null;

  const lookup = new Map<string, AstrologyAspect>();
  for (const a of aspects) {
    lookup.set(`${a.bodyA}|${a.bodyB}`, a);
    lookup.set(`${a.bodyB}|${a.bodyA}`, a);
  }

  // Triangular grid: column i only goes down to row i (bodies after it),
  // row i only shows cells for columns before it — one cell per unordered
  // pair, no mirrored duplicate half.
  const bodies = placements.map((p) => p.body);

  return (
    <div className="overflow-x-auto">
      <table data-aspect-grid-size={size} className={large ? "border-collapse text-center text-[11px] sm:text-sm lg:text-base" : "border-collapse text-center text-[11px]"}>
        <thead>
          <tr>
            <th className={headSize} />
            {bodies.slice(0, -1).map((b) => (
              <th key={b} className={`${headSize} pb-1 font-normal text-muted-foreground`} title={BODY_LABEL[b]}>
                <span style={{ fontFamily: ASTRO_GLYPH_FONT }}>{glyphText(PLANET_GLYPH[b])}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodies.slice(1).map((rowBody, rowIdx) => (
            <tr key={rowBody}>
              <th className="pr-1.5 text-right font-normal text-muted-foreground" title={BODY_LABEL[rowBody]}>
                <span style={{ fontFamily: ASTRO_GLYPH_FONT }}>{glyphText(PLANET_GLYPH[rowBody])}</span>
              </th>
              {bodies.slice(0, -1).map((colBody, colIdx) => {
                if (colIdx > rowIdx) return <td key={colBody} />;
                const asp = lookup.get(`${rowBody}|${colBody}`);
                return (
                  <td
                    key={colBody}
                    className={`${cellSize} border border-border/60`}
                    data-aspect-cell={asp?.type}
                    style={asp ? { background: c.aspectsBackground } : undefined}
                    title={
                      asp
                        ? `${BODY_LABEL[rowBody]} ${asp.type.toLowerCase()} ${BODY_LABEL[colBody]} (${asp.orb.toFixed(1)}° from exact)`
                        : `${BODY_LABEL[rowBody]} / ${BODY_LABEL[colBody]} — no aspect within orb`
                    }
                  >
                    {asp && (
                      <span style={{ color: c.aspects[asp.type], fontFamily: ASTRO_GLYPH_FONT }}>{glyphText(ASPECT_META[asp.type].glyph)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
