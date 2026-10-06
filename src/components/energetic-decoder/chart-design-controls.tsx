"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import type { EditorValue, SystemValues } from "@/lib/energetics/chart-design-editor-state";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { resolveMandalaColors } from "@/lib/energetics/mandala-spec";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";

/**
 * Shared Chart Design controls and previews (unified Chart Designs,
 * 2026-10). The labels, control types and preview wiring are the ones the
 * per-system cards in chart-designs-tab.tsx have always used — grouped
 * into sections for the full-screen editor, never re-implemented. Every
 * preview is one of the real chart renderers (no separate preview engine).
 */

export const CHART_SYSTEM_LABEL: Record<ChartDesignSystem, string> = {
  humanDesign: "Human Design",
  mandala: "Mandala",
  astrology: "Astrology",
};

export const CENTER_COLOR_FIELDS = [
  "headCenterColor",
  "ajnaCenterColor",
  "throatCenterColor",
  "gCenterColor",
  "heartCenterColor",
  "spleenCenterColor",
  "sacralCenterColor",
  "solarPlexusCenterColor",
  "rootCenterColor",
] as const;

const CENTER_FIELD_TO_KEY: Record<(typeof CENTER_COLOR_FIELDS)[number], CenterKey> = {
  headCenterColor: "head",
  ajnaCenterColor: "ajna",
  throatCenterColor: "throat",
  gCenterColor: "g",
  heartCenterColor: "heart",
  spleenCenterColor: "spleen",
  sacralCenterColor: "sacral",
  solarPlexusCenterColor: "solarplexus",
  rootCenterColor: "root",
};

const FIELD_LABEL: Record<string, string> = {
  chartDefinedColor: "Defined centers",
  channelsColor: "Channel network",
  gatesColor: "Gate accent",
  personalityActivationColor: "Personality activation",
  designActivationColor: "Design activation",
  arrowColor: "Variable arrows",
  arrowStyle: "Arrow style",
  planetBoxColor: "Planet box background",
  planetBoxMode: "Planet box style",
  planetBoxBorderRadius: "Corner radius",
  centersMode: "Centers color mode",
  headCenterColor: "Head",
  ajnaCenterColor: "Ajna",
  throatCenterColor: "Throat",
  gCenterColor: "G / Identity",
  heartCenterColor: "Heart / Ego",
  spleenCenterColor: "Spleen",
  sacralCenterColor: "Sacral",
  solarPlexusCenterColor: "Solar Plexus",
  rootCenterColor: "Root",
  backgroundColor: "Background",
  wheelAccentColor: "Wheel / planets",
  mandalaZodiacColor: "Zodiac ring",
  mandalaFireColor: "Fire background",
  mandalaEarthColor: "Earth background",
  mandalaAirColor: "Air background",
  mandalaWaterColor: "Water background",
  mandalaGateRingColor: "Gate lines",
  mandalaHexagramColor: "Hexagrams",
  mandalaGateTextColor: "Gate text",
  mandalaGlowColor: "Center glow",
  mandalaInitiationColor: "Initiation background",
  mandalaInitiationTextColor: "Initiation text",
  mandalaCivilizationColor: "Civilization background",
  mandalaCivilizationTextColor: "Civilization text",
  mandalaDualityColor: "Duality background",
  mandalaDualityTextColor: "Duality text",
  mandalaMutationColor: "Mutation background",
  mandalaMutationTextColor: "Mutation text",
  mandalaFireTextColor: "Fire text",
  mandalaEarthTextColor: "Earth text",
  mandalaAirTextColor: "Air text",
  mandalaWaterTextColor: "Water text",
  mandalaZodiacSymbolColor: "Zodiac symbols",
  mandalaHeadCenterColor: "Head",
  mandalaAjnaCenterColor: "Ajna",
  mandalaThroatCenterColor: "Throat",
  mandalaGCenterColor: "G",
  mandalaHeartCenterColor: "Heart",
  mandalaSplenicCenterColor: "Splenic",
  mandalaSacralCenterColor: "Sacral",
  mandalaSolarPlexusCenterColor: "Solar Plexus",
  mandalaRootCenterColor: "Root",
  mandalaQuadrantColor: "Quarter band",
};

export function chartFieldLabel(system: ChartDesignSystem, key: string): string {
  if (key === "chartDefinedColor" && system === "mandala") return "Activated gate edge";
  return FIELD_LABEL[key] ?? key;
}

const FIELD_HELP: Record<string, string> = {
  channelsColor: "Color of the channel network where nothing is activated. Activated channels use the Personality/Design colors.",
};

const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  arrowStyle: [
    { value: "solid", label: "Solid arrows" },
    { value: "outline", label: "Outline arrows" },
  ],
  planetBoxMode: [
    { value: "iconOnly", label: "Icon only — glyph colored, row plain" },
    { value: "fullBox", label: "Full box — entire row colored" },
  ],
  centersMode: [
    { value: "uniform", label: "Uniform — one color, every defined center" },
    { value: "traditional", label: "Traditional — each center its own color" },
  ],
};

/**
 * The editor's sections per chart system — every editable field of that
 * system appears in exactly one section. Each system lists only the options
 * it supports; the systems share the editor's layout, not its controls.
 */
export const CHART_DESIGN_SECTIONS: Record<ChartDesignSystem, { title: string; description: string; fields: readonly string[] }[]> = {
  humanDesign: [
    { title: "Centers", description: "Defined center color and how centers are colored.", fields: ["chartDefinedColor", "centersMode", ...CENTER_COLOR_FIELDS] },
    { title: "Channels and gates", description: "Channel network and gate accent colors.", fields: ["channelsColor", "gatesColor"] },
    { title: "Activations", description: "Personality and Design colors.", fields: ["personalityActivationColor", "designActivationColor"] },
    { title: "Variables", description: "Variable arrow color and style.", fields: ["arrowColor", "arrowStyle"] },
    { title: "Planet boxes", description: "Style, color and corners of the planet columns.", fields: ["planetBoxMode", "planetBoxColor", "planetBoxBorderRadius"] },
    { title: "Background", description: "Chart background color.", fields: ["backgroundColor"] },
  ],
  mandala: [
    { title: "Basic colors", description: "Hexagrams, gate numbers, the background, the center glow and the gate field's lines.", fields: ["mandalaHexagramColor", "mandalaGateTextColor", "backgroundColor", "mandalaGlowColor", "mandalaGateRingColor"] },
    { title: "Quarters", description: "Background and label color of each Human Design Quarter.", fields: ["mandalaInitiationColor", "mandalaInitiationTextColor", "mandalaCivilizationColor", "mandalaCivilizationTextColor", "mandalaDualityColor", "mandalaDualityTextColor", "mandalaMutationColor", "mandalaMutationTextColor"] },
    { title: "Zodiac", description: "Background and text per element: Fire (Aries, Leo, Sagittarius), Earth (Taurus, Virgo, Capricorn), Air (Gemini, Libra, Aquarius), Water (Cancer, Scorpio, Pisces). Zodiac symbols applies when signs are shown as symbols.", fields: ["mandalaFireColor", "mandalaFireTextColor", "mandalaEarthColor", "mandalaEarthTextColor", "mandalaAirColor", "mandalaAirTextColor", "mandalaWaterColor", "mandalaWaterTextColor", "mandalaZodiacSymbolColor"] },
    { title: "Center colors", description: "An activated gate's wedge takes the color of the Human Design center that gate belongs to.", fields: ["mandalaHeadCenterColor", "mandalaAjnaCenterColor", "mandalaThroatCenterColor", "mandalaGCenterColor", "mandalaHeartCenterColor", "mandalaSplenicCenterColor", "mandalaSacralCenterColor", "mandalaSolarPlexusCenterColor", "mandalaRootCenterColor"] },
    { title: "Activations", description: "Personality and Design colors (planet symbols and the center BodyGraph's activations), and the edge marking each activated gate.", fields: ["personalityActivationColor", "designActivationColor", "chartDefinedColor"] },
  ],
  astrology: [
    { title: "Wheel", description: "Wheel and planet accent color.", fields: ["wheelAccentColor"] },
    { title: "Background", description: "Chart background color.", fields: ["backgroundColor"] },
  ],
};

/** One field's control: a color picker + hex input, a select, or the corner-radius number — the same controls the cards always had. */
export function ChartDesignFieldControl({
  system,
  field,
  values,
  disabled,
  onChange,
}: {
  system: ChartDesignSystem;
  field: string;
  values: SystemValues;
  disabled?: boolean;
  onChange: (field: string, value: EditorValue) => void;
}) {
  const label = chartFieldLabel(system, field);
  const value = values[field];
  const id = `cd-${system}-${field}`;

  // The 9 per-center colors only appear once "Traditional" is chosen, matching Bodygraph's own toggle.
  if ((CENTER_COLOR_FIELDS as readonly string[]).includes(field) && values.centersMode !== "traditional") return null;

  if (SELECT_OPTIONS[field]) {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(e) => onChange(field, e.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
        >
          {SELECT_OPTIONS[field].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field === "planetBoxBorderRadius") {
    const inactive = values.planetBoxMode !== "fullBox";
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          min={0}
          max={64}
          value={Number(value ?? 0)}
          onChange={(e) => onChange(field, Math.max(0, Math.min(64, Number(e.target.value) || 0)))}
          disabled={disabled || inactive}
          className="h-9 w-20 text-sm"
        />
        <label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
          {inactive && " (full box style only)"}
        </label>
      </div>
    );
  }

  const color = String(value ?? "");
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000"}
          onChange={(e) => onChange(field, e.target.value)}
          disabled={disabled}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border disabled:cursor-not-allowed"
          aria-label={label}
        />
        <Input
          id={id}
          value={color}
          onChange={(e) => onChange(field, e.target.value)}
          disabled={disabled}
          className="h-9 w-28 font-mono text-xs"
        />
        <label htmlFor={id} className="min-w-0 text-xs text-muted-foreground">
          {label}
        </label>
      </div>
      {FIELD_HELP[field] && <p className="pl-11 text-[11px] leading-snug text-muted-foreground/80">{FIELD_HELP[field]}</p>}
    </div>
  );
}

function centerColorsOf(design: ChartDesign): Partial<Record<CenterKey, string>> {
  const out: Partial<Record<CenterKey, string>> = {};
  for (const field of CENTER_COLOR_FIELDS) out[CENTER_FIELD_TO_KEY[field]] = design[field];
  return out;
}

function PreviewPlaceholder({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted/40", className)} />;
}

/**
 * One chart system rendered with a design, through the real renderers.
 * "thumb" = library thumbnails (BodyGraph / Mandala rings only);
 * "large" = the editor preview (Human Design as the full chart layout with
 * both activation columns, Variable arrows and planet boxes; Mandala with
 * its center chart drawn in this design's own Human Design colors).
 */
export function ChartDesignPreview({
  system,
  design,
  hdDesign,
  sampleHd,
  sampleAstro,
  size,
  className,
  hdFill,
}: {
  system: ChartDesignSystem;
  design: ChartDesign | null;
  /** Mandala large preview only: the same unified design's Human Design record, for the center chart. */
  hdDesign?: ChartDesign | null;
  sampleHd: HumanDesignProfile | null;
  sampleAstro: AstrologyChart | null;
  size: "thumb" | "large";
  className?: string;
  /** Human Design large preview only: the editor's unscaled fill layout (see HumanDesignFullChart `fill`). */
  hdFill?: { height: number };
}): ReactNode {
  const placeholderClass = size === "thumb" ? "aspect-square w-full" : "aspect-[4/3] w-full";
  if (!design) return <PreviewPlaceholder className={placeholderClass} />;

  if (system === "humanDesign") {
    if (!sampleHd) return <PreviewPlaceholder className={placeholderClass} />;
    if (size === "large") return <HumanDesignFullChart profile={sampleHd} design={design} className={className} fill={hdFill} />;
    return (
      <HumanDesignChart
        profile={sampleHd}
        className={className}
        definedColor={design.chartDefinedColor}
        channelsColor={design.channelsColor}
        gatesColor={design.gatesColor}
        personalityColor={design.personalityActivationColor}
        designColor={design.designActivationColor}
        backgroundColor={design.backgroundColor}
        centersMode={design.centersMode}
        centerColors={centerColorsOf(design)}
      />
    );
  }

  if (system === "mandala") {
    if (!sampleHd) return <PreviewPlaceholder className={placeholderClass} />;
    return (
      <MandalaChart
        profile={sampleHd}
        className={className}
        gateColor={design.chartDefinedColor}
        backgroundColor={design.backgroundColor}
        personalityColor={design.personalityActivationColor}
        designColor={design.designActivationColor}
        zodiacColor={design.mandalaZodiacColor}
            mandalaColors={resolveMandalaColors(design)}
        gateRingColor={design.mandalaGateRingColor}
        quadrantColor={design.mandalaQuadrantColor}
        hdDesign={size === "large" ? (hdDesign ?? null) : null}
        showCenterChart={size === "large"}
      />
    );
  }

  if (!sampleAstro) return <PreviewPlaceholder className={placeholderClass} />;
  return (
    <AstrologyWheelChart
      chart={sampleAstro}
      className={className}
      wheelAccentColor={design.wheelAccentColor}
      backgroundColor={design.backgroundColor}
    />
  );
}
