import type { AstrologyChart, HouseCusp } from "@/lib/energetics/astrology";
import type { AstrologyReadingContent } from "@/types/energetic-decoder";
import type { ChartDesign } from "@/types/chart-design";
import { ASPECT_TYPE_CONTENT } from "@/lib/energetics/astrology-content-data";
import {
  ASPECT_META,
  ASTRO_EDITOR_MARGIN,
  ASTRO_GLYPH_FONT,
  BODY_LABEL,
  HOUSE_SYSTEM_LABEL,
  PLANET_GLYPH,
  ZODIAC_GLYPH,
  glyphText,
  resolveAstrologyColors,
} from "@/lib/energetics/astrology-spec";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { AspectGrid } from "@/components/energetic-decoder/aspect-grid";

/**
 * The practitioner Reading → Astrology page (2026-10 redesign). Same data
 * and interpretation content as before, recomposed: the natal chart beside
 * a Key Placements rail, then Houses, Planetary
 * Placements, then a full-width Aspect Grid and a full-width Aspects list
 * (stacked — never side by side, because the list's height varies with
 * the reading; it grows naturally, no internal scrolling, every aspect
 * shown).
 *
 * Page composition only: the wheel is the shared, approved
 * AstrologyWheelChart and every color comes from the selected Chart Design
 * via resolveAstrologyColors. Nothing here calculates — positions,
 * houses, aspects and text are the reading's own. The public report and
 * the public decoder keep their own layout (AstrologySummary).
 */

type Chart = AstrologyChart & { content?: AstrologyReadingContent };

const fmtDeg = (d: number) => `${d.toFixed(1)}°`;

function Glyph({ children, className, style }: { children: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span aria-hidden="true" className={className} style={{ fontFamily: ASTRO_GLYPH_FONT, ...style }}>
      {glyphText(children)}
    </span>
  );
}

function SectionCard({ id, title, children, aside }: { id: string; title: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section data-astro-section={id} aria-labelledby={`astro-${id}`} className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`astro-${id}`} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The house a longitude falls in, read off the reading's own cusps (display only — for the Midheaven's house when the house system doesn't put it on a cusp). */
function houseContaining(cusps: HouseCusp[], longitude: number): number | null {
  if (cusps.length !== 12) return null;
  const lon = ((longitude % 360) + 360) % 360;
  // A point on a cusp (the MC under Placidus) belongs to that cusp's house — the two are computed separately, so allow float noise.
  const onCusp = cusps.find((c) => Math.abs(((c.longitude - lon + 540) % 360) - 180) < 1e-6);
  if (onCusp) return onCusp.house;
  for (let i = 0; i < 12; i++) {
    const start = cusps[i].longitude, end = cusps[(i + 1) % 12].longitude;
    if (start <= end ? lon >= start && lon < end : lon >= start || lon < end) return cusps[i].house;
  }
  return null;
}

export function AstrologyReadingView({ chart, astroDesign }: { chart: Chart; astroDesign?: ChartDesign | null }) {
  const colors = resolveAstrologyColors(astroDesign);
  const content = chart.content;
  const { ascendant, mc } = chart.angles;
  const sun = chart.placements.find((p) => p.body === "sun");
  const moon = chart.placements.find((p) => p.body === "moon");
  const mcHouse = houseContaining(chart.houses.cusps, mc.longitude);
  // The house system actually used for this chart (after the polar fallback, when Placidus was undefined), shown beside the Houses heading.
  const houseSystem = HOUSE_SYSTEM_LABEL[chart.houses.system] ?? chart.houses.system;

  const key: { id: string; label: string; icon: string; isText?: boolean; sign: string; degree: number; house: number | null }[] = [
    ...(sun ? [{ id: "sun", label: "Sun", icon: PLANET_GLYPH.sun, sign: sun.sign, degree: sun.degInSign, house: sun.house }] : []),
    ...(moon ? [{ id: "moon", label: "Moon", icon: PLANET_GLYPH.moon, sign: moon.sign, degree: moon.degInSign, house: moon.house }] : []),
    { id: "rising", label: "Rising (Ascendant)", icon: "AC", isText: true, sign: ascendant.sign, degree: ascendant.degInSign, house: 1 },
    { id: "midheaven", label: "Midheaven (MC)", icon: "MC", isText: true, sign: mc.sign, degree: mc.degInSign, house: mcHouse },
    // the nodes and Chiron, from the reading's own placements (Chiron is absent on readings where it couldn't be calculated)
    ...(["northNode", "southNode", "chiron"] as const).flatMap((body) => {
      const p = chart.placements.find((x) => x.body === body);
      return p ? [{ id: body, label: BODY_LABEL[body], icon: PLANET_GLYPH[body], sign: p.sign, degree: p.degInSign, house: p.house }] : [];
    }),
  ];

  return (
    <div data-astro-reading className="space-y-6">
      {/*
        Top section (2026-10 correction): Natal Chart on the left, Key
        Placements as a right rail, so the whole wheel fits a laptop screen
        (the stacked 840px chart didn't). Same container-query split as the
        Mandala Reading page; below 880px of content width they stack, chart
        first. Everything below this section is unchanged.
      */}
      <div data-astro-top className="@container/astrotop">
        <div className="grid grid-cols-1 items-start gap-6 @min-[880px]/astrotop:grid-cols-[minmax(0,1fr)_clamp(300px,31%,360px)]">
          {/* Natal Chart (its AC/DC/MC/IC are the chart's own axes and labels) */}
          <SectionCard id="natal-chart" title="Natal Chart">
            {/*
              The chart fills its card: as wide as the card allows, and never taller than the screen leaves room for (app
              header 64px + this card's title and padding ≈ 78px + a 16px safety margin = 158px), never below 420px. Drawn
              with no outer margin (the same setting the Chart Designs preview uses), so the wheel uses ~92% of the box
              instead of ~88%; the AC/DC/MC/IC labels stay inside it.
            */}
            <div data-astro-wheel-wrap className="mx-auto w-full max-w-[max(420px,calc(100dvh_-_158px))]">
              <AstrologyWheelChart chart={chart} className="w-full" colors={colors} margin={ASTRO_EDITOR_MARGIN} />
            </div>
          </SectionCard>

          {/* Key Placements — the right rail: one compact row per point, no interpretation text */}
          <SectionCard id="key-placements" title="Key Placements">
            <ul className="space-y-1.5">
              {key.map((k) => (
                <li key={k.id} data-key-placement={k.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border bg-background/60 px-2.5 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {k.isText ? <span className="text-xs font-bold">{k.icon}</span> : <Glyph className="text-lg leading-none">{k.icon}</Glyph>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">{k.label}</p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      <Glyph className="mr-1">{ZODIAC_GLYPH[k.sign as keyof typeof ZODIAC_GLYPH]}</Glyph>
                      {k.sign} {fmtDeg(k.degree)}
                    </p>
                  </div>
                  {k.house !== null && <span className="shrink-0 text-xs text-muted-foreground">House {k.house}</span>}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>

      {/* 3. Houses */}
      <SectionCard id="houses" title={<>Houses <span className="font-normal text-muted-foreground">({houseSystem})</span></>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {chart.houses.cusps.map((c) => (
            <div key={c.house} data-house={c.house} className="rounded-xl border bg-background/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">House {c.house}</p>
              <p className="text-sm font-semibold text-foreground">
                <Glyph className="mr-1">{ZODIAC_GLYPH[c.sign]}</Glyph>
                {c.sign} {fmtDeg(c.degInSign)}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 4. Planetary Placements */}
      <SectionCard id="placements" title="Planetary Placements">
        {/* The four-column table switches on at 600px of the TABLE's own width (container query), not the viewport's md — beside the sidebar on a tablet the card is only ~450px wide, and the four columns' minimums overflowed the page. */}
        <div role="table" aria-label="Planetary placements" className="@container/placements text-sm">
          <div role="row" className="hidden grid-cols-[minmax(130px,170px)_minmax(150px,190px)_72px_minmax(0,1fr)] gap-4 border-b pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground @min-[600px]/placements:grid">
            <span role="columnheader">Planet</span>
            <span role="columnheader">Sign &amp; Degree</span>
            <span role="columnheader">House</span>
            <span role="columnheader">Interpretation</span>
          </div>
          <div className="divide-y">
            {chart.placements.map((p) => (
              <div
                key={p.body}
                role="row"
                data-placement={p.body}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-2.5 @min-[600px]/placements:grid-cols-[minmax(130px,170px)_minmax(150px,190px)_72px_minmax(0,1fr)] @min-[600px]/placements:items-baseline"
              >
                <span role="cell" className="flex items-center gap-2 font-semibold text-foreground">
                  <Glyph className="w-5 text-center text-base">{PLANET_GLYPH[p.body]}</Glyph>
                  {BODY_LABEL[p.body]}
                </span>
                <span role="cell" className="text-right text-foreground @min-[600px]/placements:text-left">
                  <Glyph className="mr-1">{ZODIAC_GLYPH[p.sign]}</Glyph>
                  {p.sign} {fmtDeg(p.degInSign)}
                  {p.retrograde && (
                    <span className="ml-1 font-semibold text-muted-foreground" title="Retrograde">
                      {glyphText("℞")}
                    </span>
                  )}
                </span>
                <span role="cell" className="text-muted-foreground @min-[600px]/placements:text-foreground">
                  House {p.house}
                </span>
                <span role="cell" className="col-span-2 text-xs leading-relaxed text-muted-foreground @min-[600px]/placements:col-span-1 @min-[600px]/placements:text-sm">
                  {content?.signs[p.sign] ?? ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* 5. Aspect Grid — full width, its own row */}
      {chart.aspects.length > 0 && (
        <SectionCard id="aspect-grid" title="Aspect Grid">
          <div className="flex justify-center">
            <AspectGrid placements={chart.placements} aspects={chart.aspects} colors={colors} size="large" />
          </div>
        </SectionCard>
      )}

      {/* 6. Aspects — full width below the grid; grows with the reading, every aspect listed */}
      {chart.aspects.length > 0 && (
        <SectionCard id="aspects" title={`Aspects (${chart.aspects.length})`}>
          <ul className="divide-y">
            {chart.aspects.map((a, i) => (
              <li key={i} data-aspect-row={a.type} className="flex items-start gap-3 py-2.5">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-base"
                  style={{ background: colors.aspectsBackground, color: colors.aspects[a.type], fontFamily: ASTRO_GLYPH_FONT }}
                  aria-hidden="true"
                >
                  {glyphText(ASPECT_META[a.type].glyph)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{BODY_LABEL[a.bodyA]}</span> {a.type.toLowerCase()}{" "}
                    <span className="font-semibold">{BODY_LABEL[a.bodyB]}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">({a.orb.toFixed(1)}° from exact)</span>
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">{content?.aspectTypes[a.type] || ASPECT_TYPE_CONTENT[a.type]}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
