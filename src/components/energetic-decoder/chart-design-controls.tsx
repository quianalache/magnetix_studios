"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import { CHART_DESIGN_PRESETS } from "@/lib/energetics/chart-design-presets";
import type { EditorValue, SystemValues } from "@/lib/energetics/chart-design-editor-state";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
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
  mandalaGateRingColor: "Gate ring",
  mandalaQuadrantColor: "Quadrant dividers",
};

export function chartFieldLabel(system: ChartDesignSystem, key: string): string {
  if (key === "chartDefinedColor" && system === "mandala") return "Activated gates";
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

/** The editor's sections per chart system — every editable field of that system appears in exactly one section. */
export const CHART_DESIGN_SECTIONS: Record<ChartDesignSystem, { title: string; fields: readonly string[] }[]> = {
  humanDesign: [
    { title: "Centers", fields: ["chartDefinedColor", "centersMode", ...CENTER_COLOR_FIELDS] },
    { title: "Channels and gates", fields: ["channelsColor", "gatesColor"] },
    { title: "Activations", fields: ["personalityActivationColor", "designActivationColor"] },
    { title: "Variables", fields: ["arrowColor", "arrowStyle"] },
    { title: "Planet boxes", fields: ["planetBoxMode", "planetBoxColor", "planetBoxBorderRadius"] },
    { title: "Background", fields: ["backgroundColor"] },
  ],
  mandala: [
    { title: "Gates", fields: ["chartDefinedColor"] },
    { title: "Activations", fields: ["personalityActivationColor", "designActivationColor"] },
    { title: "Rings and quadrants", fields: ["mandalaZodiacColor", "mandalaGateRingColor", "mandalaQuadrantColor"] },
    { title: "Background", fields: ["backgroundColor"] },
  ],
  astrology: [
    { title: "Wheel", fields: ["wheelAccentColor"] },
    { title: "Background", fields: ["backgroundColor"] },
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
          className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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

/** The four existing presets for one chart system. Applying one only changes that system's unsaved values. */
export function ChartDesignPresetChips({
  system,
  disabled,
  onApply,
}: {
  system: ChartDesignSystem;
  disabled?: boolean;
  onApply: (presetName: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHART_DESIGN_PRESETS[system].map((preset) => (
        <button
          key={preset.name}
          type="button"
          disabled={disabled}
          onClick={() => onApply(preset.name)}
          title={`Apply "${preset.name}" to ${CHART_SYSTEM_LABEL[system]} — review the preview, then Save Changes`}
          className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="flex -space-x-1">
            {preset.swatch.map((c, i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-full border border-background" style={{ backgroundColor: c }} />
            ))}
          </span>
          {preset.name}
        </button>
      ))}
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
}: {
  system: ChartDesignSystem;
  design: ChartDesign | null;
  /** Mandala large preview only: the same unified design's Human Design record, for the center chart. */
  hdDesign?: ChartDesign | null;
  sampleHd: HumanDesignProfile | null;
  sampleAstro: AstrologyChart | null;
  size: "thumb" | "large";
  className?: string;
}): ReactNode {
  const placeholderClass = size === "thumb" ? "aspect-square w-full" : "aspect-[4/3] w-full";
  if (!design) return <PreviewPlaceholder className={placeholderClass} />;

  if (system === "humanDesign") {
    if (!sampleHd) return <PreviewPlaceholder className={placeholderClass} />;
    if (size === "large") return <HumanDesignFullChart profile={sampleHd} design={design} className={className} />;
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
