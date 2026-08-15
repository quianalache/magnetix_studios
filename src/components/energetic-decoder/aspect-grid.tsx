import type { AstrologyAspect, AstrologyBodyName, AspectType, AstrologyPlacement } from "@/lib/energetics/astrology";

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

const BODY_GLYPH: Record<AstrologyBodyName, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  northNode: "☊",
  southNode: "☋",
  lilith: "⚸",
  chiron: "⚷",
};

const BODY_LABEL: Record<AstrologyBodyName, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
  northNode: "North Node",
  southNode: "South Node",
  lilith: "Lilith",
  chiron: "Chiron",
};

const ASPECT_GLYPH: Record<AspectType, string> = {
  Conjunction: "☌",
  Opposition: "☍",
  Square: "□",
  Trine: "△",
  Sextile: "⚹",
};

/** Same 5 hues already used for aspect chords in the wheel (astrology-wheel-chart.tsx) — the grid glyph and the chord it corresponds to should read as the same aspect at a glance, not two unrelated color systems. */
const ASPECT_COLOR: Record<AspectType, string> = {
  Conjunction: "#3f3f46",
  Opposition: "#b3241f",
  Square: "#b3241f",
  Trine: "#14795a",
  Sextile: "#14795a",
};

export function AspectGrid({
  placements,
  aspects,
  accentColor,
}: {
  placements: AstrologyPlacement[];
  aspects: AstrologyAspect[];
  accentColor?: string;
}) {
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
      <table className="border-collapse text-center text-[11px]">
        <thead>
          <tr>
            <th className="w-7" />
            {bodies.slice(0, -1).map((b) => (
              <th key={b} className="w-7 pb-1 font-normal text-muted-foreground" title={BODY_LABEL[b]}>
                {BODY_GLYPH[b]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodies.slice(1).map((rowBody, rowIdx) => (
            <tr key={rowBody}>
              <th className="pr-1.5 text-right font-normal text-muted-foreground" title={BODY_LABEL[rowBody]}>
                {BODY_GLYPH[rowBody]}
              </th>
              {bodies.slice(0, -1).map((colBody, colIdx) => {
                if (colIdx > rowIdx) return <td key={colBody} />;
                const asp = lookup.get(`${rowBody}|${colBody}`);
                return (
                  <td
                    key={colBody}
                    className="h-7 w-7 border border-border/60"
                    title={
                      asp
                        ? `${BODY_LABEL[rowBody]} ${asp.type.toLowerCase()} ${BODY_LABEL[colBody]} (${asp.orb.toFixed(1)}° from exact)`
                        : `${BODY_LABEL[rowBody]} / ${BODY_LABEL[colBody]} — no aspect within orb`
                    }
                  >
                    {asp && (
                      <span style={{ color: asp.type === "Conjunction" ? accentColor || ASPECT_COLOR.Conjunction : ASPECT_COLOR[asp.type] }}>
                        {ASPECT_GLYPH[asp.type]}
                      </span>
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
