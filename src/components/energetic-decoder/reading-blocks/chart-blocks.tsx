"use client";

import { DESIGN_FILL, PERSONALITY_FILL } from "@/lib/energetics/human-design-chart-constants";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { AspectGrid } from "@/components/energetic-decoder/aspect-grid";
import { SphereList } from "@/components/energetic-decoder/reading-summary";
import { BlockSection, CARD } from "@/components/energetic-decoder/reading-blocks/block-section";
import { HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
import { ASPECT_TYPE_CONTENT } from "@/lib/energetics/astrology-content-data";
import { HOUSE_SYSTEM_LABEL, resolveAstrologyColors } from "@/lib/energetics/astrology-spec";
import { resolveMandalaColors } from "@/lib/energetics/mandala-spec";
import { WHEEL_SIZE_CLASS, type WheelSize } from "@/lib/energetic-decoder/reading-block-settings";
import { defaultChartDesignColor, type ChartDesign } from "@/types/chart-design";
import { cn } from "@/lib/utils";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { ReadingBlockContext } from "@/types/reading-blocks";

/**
 * Mandala, Astrology and Gene Keys Reading blocks (2026-10-21). Charts are
 * the existing renderers; colors are the Chart Design; text is the
 * Reading's saved content.
 */

// ── Mandala ────────────────────────────────────────────────────────────

export function MandalaBlock({ ctx, heading, size = "large" }: { ctx: ReadingBlockContext; heading?: string; size?: WheelSize }) {
  const profile = ctx.reading.humanDesign;
  if (!profile) return null;
  const d = ctx.designs.mandalaDesign;
  return (
    <BlockSection kind="mandala" heading={heading}>
      <div className="rounded-2xl border bg-card p-2 sm:p-4">
        <MandalaChart
          profile={profile}
          className={WHEEL_SIZE_CLASS[size]}
          gateColor={d?.chartDefinedColor ?? defaultChartDesignColor()}
          backgroundColor={d?.backgroundColor ?? "white"}
          personalityColor={d?.personalityActivationColor}
          designColor={d?.designActivationColor}
          zodiacColor={d?.mandalaZodiacColor}
          mandalaColors={d ? resolveMandalaColors(d) : undefined}
          gateRingColor={d?.mandalaGateRingColor}
          quadrantColor={d?.mandalaQuadrantColor}
          hdDesign={ctx.designs.hdDesign}
        />
      </div>
    </BlockSection>
  );
}

/** Both sides of every activation in one compact list (shared with the staff Mandala view). */
export function ActivationsList({ profile, design }: { profile: HumanDesignProfile; design: ChartDesign | null | undefined }) {
  const byP = new Map<string, (typeof profile.personality)[number]>(profile.personality.map((a) => [a.body, a]));
  const byD = new Map<string, (typeof profile.design)[number]>(profile.design.map((a) => [a.body, a]));
  const pColor = design?.personalityActivationColor || PERSONALITY_FILL;
  const dColor = design?.designActivationColor || DESIGN_FILL;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-end gap-4 text-overline font-semibold uppercase tracking-wide">
        <span style={{ color: pColor }}>Personality</span>
        <span style={{ color: dColor }}>Design</span>
      </div>
      <div className="divide-y">
        {HD_BODY_LABELS.map(({ body, label, symbol }) => {
          const p = byP.get(body);
          const d = byD.get(body);
          return (
            <div key={body} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                <span aria-hidden="true">{symbol}</span>
                <span className="truncate">{label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-4 font-semibold tabular-nums">
                <span style={{ color: pColor }}>{p ? `${p.gate}.${p.line}` : "—"}</span>
                <span style={{ color: dColor }}>{d ? `${d.gate}.${d.line}` : "—"}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MandalaActivationsBlock({ ctx, heading }: { ctx: ReadingBlockContext; heading?: string }) {
  const profile = ctx.reading.humanDesign;
  if (!profile) return null;
  return (
    <BlockSection kind="mandala-activations" heading={heading}>
      <div className={cn(CARD, "mx-auto max-w-xl")}>
        <ActivationsList profile={profile} design={ctx.designs.mandalaDesign ?? ctx.designs.hdDesign} />
      </div>
    </BlockSection>
  );
}

// ── Astrology ──────────────────────────────────────────────────────────

const deg = (n: number) => `${n.toFixed(1)}°`;

export function AstrologyChartBlock({ ctx, heading, size = "large" }: { ctx: ReadingBlockContext; heading?: string; size?: WheelSize }) {
  const chart = ctx.reading.astrology;
  if (!chart) return null;
  return (
    <BlockSection kind="astrology-chart" heading={heading}>
      <div className="rounded-2xl border bg-card p-2 sm:p-4">
        <AstrologyWheelChart chart={chart} className={WHEEL_SIZE_CLASS[size]} colors={resolveAstrologyColors(ctx.designs.astroDesign)} />
      </div>
    </BlockSection>
  );
}

export function AstrologyKeyFactsBlock({
  ctx,
  heading,
  angles = true,
  descriptions = true,
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  /** Also show Descendant, Midheaven and IC. */
  angles?: boolean;
  descriptions?: boolean;
}) {
  const chart = ctx.reading.astrology;
  if (!chart) return null;
  const sun = chart.placements.find((p) => p.body === "sun");
  const moon = chart.placements.find((p) => p.body === "moon");
  const signs = chart.content?.signs;
  const rows: { label: string; sign: string; deg: number; text?: string }[] = [];
  if (sun) rows.push({ label: "Sun", sign: sun.sign, deg: sun.degInSign, text: signs?.[sun.sign] });
  if (moon) rows.push({ label: "Moon", sign: moon.sign, deg: moon.degInSign, text: signs?.[moon.sign] });
  rows.push({ label: "Rising (Ascendant)", sign: chart.angles.ascendant.sign, deg: chart.angles.ascendant.degInSign, text: signs?.[chart.angles.ascendant.sign] });
  if (angles) {
    rows.push({ label: "Descendant", sign: chart.angles.descendant.sign, deg: chart.angles.descendant.degInSign });
    rows.push({ label: "Midheaven (MC)", sign: chart.angles.mc.sign, deg: chart.angles.mc.degInSign });
    rows.push({ label: "Imum Coeli (IC)", sign: chart.angles.ic.sign, deg: chart.angles.ic.degInSign });
  }
  return (
    <BlockSection kind="astrology-key-facts" heading={heading}>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="text-base font-semibold text-foreground">
              {r.sign} <span className="text-sm font-medium text-muted-foreground">{deg(r.deg)}</span>
            </p>
            {descriptions && r.text && <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{r.text}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Western tropical zodiac · {HOUSE_SYSTEM_LABEL[chart.houses.system] ?? chart.houses.system} houses
        {chart.houses.fallbackReason ? ` · ${chart.houses.fallbackReason}` : ""}
      </p>
    </BlockSection>
  );
}

export function AstrologyHousesBlock({ ctx, heading, descriptions = true }: { ctx: ReadingBlockContext; heading?: string; descriptions?: boolean }) {
  const chart = ctx.reading.astrology;
  if (!chart) return null;
  const houses = chart.content?.houses;
  return (
    <BlockSection kind="astrology-houses" heading={heading}>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
        {chart.houses.cusps.map((c) => {
          const h = houses?.[String(c.house)];
          return (
            <div key={c.house} className="rounded-2xl border bg-card p-4">
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">House {c.house}</span>
                <span className="text-sm text-muted-foreground">
                  {c.sign} {deg(c.degInSign)}
                </span>
              </p>
              {h?.theme && <p className="mt-0.5 text-xs font-medium text-foreground/80">{h.theme}</p>}
              {descriptions && h?.description && <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{h.description}</p>}
            </div>
          );
        })}
      </div>
    </BlockSection>
  );
}

export function AstrologyPlacementsBlock({ ctx, heading, descriptions = true }: { ctx: ReadingBlockContext; heading?: string; descriptions?: boolean }) {
  const chart = ctx.reading.astrology;
  if (!chart) return null;
  const signs = chart.content?.signs;
  return (
    <BlockSection kind="astrology-placements" heading={heading}>
      <div className={cn(CARD, "divide-y p-0 sm:p-0")}>
        {chart.placements.map((p) => (
          <div key={p.body} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <p className="text-sm font-semibold capitalize text-foreground">
                {p.body.replace(/([A-Z])/g, " $1")} in {p.sign}
                {p.retrograde ? <span className="ml-1 text-xs font-medium text-muted-foreground">℞ retrograde</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {deg(p.degInSign)} · House {p.house}
              </p>
            </div>
            {descriptions && signs?.[p.sign] && <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{signs[p.sign]}</p>}
          </div>
        ))}
      </div>
    </BlockSection>
  );
}

export function AstrologyAspectsBlock({
  ctx,
  heading,
  showGrid = true,
  descriptions = true,
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  showGrid?: boolean;
  descriptions?: boolean;
}) {
  const chart = ctx.reading.astrology;
  if (!chart || chart.aspects.length === 0) return null;
  const types = chart.content?.aspectTypes;
  const sorted = [...chart.aspects].sort((a, b) => a.orb - b.orb);
  return (
    <BlockSection kind="astrology-aspects" heading={heading}>
      {showGrid && (
        <div className={cn(CARD, "overflow-x-auto")}>
          <AspectGrid placements={chart.placements} aspects={chart.aspects} colors={resolveAstrologyColors(ctx.designs.astroDesign)} />
        </div>
      )}
      <div className={cn(CARD, "divide-y p-0 sm:p-0")}>
        {sorted.map((a, i) => (
          <div key={i} className="px-4 py-2.5 sm:px-5">
            <p className="text-sm text-foreground">
              <span className="font-semibold capitalize">{a.bodyA}</span> {a.type.toLowerCase()} <span className="font-semibold capitalize">{a.bodyB}</span>
              <span className="text-xs text-muted-foreground"> · {a.orb.toFixed(1)}° from exact</span>
            </p>
            {descriptions && (types?.[a.type] || ASPECT_TYPE_CONTENT[a.type]) && (
              <p className="mt-0.5 text-body-sm leading-relaxed text-muted-foreground">{types?.[a.type] || ASPECT_TYPE_CONTENT[a.type]}</p>
            )}
          </div>
        ))}
      </div>
    </BlockSection>
  );
}

// ── Gene Keys ──────────────────────────────────────────────────────────

export function GeneKeysBlock({ ctx, heading }: { ctx: ReadingBlockContext; heading?: string }) {
  if (ctx.reading.spheres.length === 0) return null;
  return (
    <BlockSection kind="gene-keys" heading={heading}>
      <SphereList spheres={ctx.reading.spheres} />
    </BlockSection>
  );
}
