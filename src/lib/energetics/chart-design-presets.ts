import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignEditableField } from "./chart-design-fields";

/*
 * The four established color looks (values unchanged since chart-designs-
 * tab.tsx, 2026-08). Since 2026-10 they are no longer editor presets: they
 * build the ready-made Chart Designs (chart-design-starters.ts), and the
 * legacy per-system cards (shown only to a workspace not yet migrated to
 * unified designs) still offer them. Keep the values here while either
 * needs them.
 */

/**
 * Named color presets — Phase 7 (2026-08-15), the one item from the
 * parity audit's Phase 7 scope ("richer named presets," "reusable saved
 * presets") that's genuinely bounded: no new data model, no new page,
 * just a one-click shortcut that fills in the exact same fields the
 * pickers below already edit. Clicking a preset only updates local
 * `fields` state — same "dirty until Save" flow as editing any field by
 * hand, so a practitioner sees the live preview update and can still
 * back out before it's persisted.
 *
 * Deliberately aesthetic, not "authoritative" — these are curated color
 * combinations, not a claim about a traditional/standard Human Design
 * center-color convention. That distinction matters after the Mandala
 * hexagram-glyph decision earlier this session (mandala-chart.tsx's
 * header comment): shipping a specific 9-color "this is what Head/Ajna/
 * Throat/etc. are supposed to be" convention from memory carries the
 * same unverified-domain-fact risk, so presets never touch the 9
 * traditional per-center colors — only the fields every system already
 * shares (defined/gate accent, Personality/Design activation, ring
 * colors, background).
 */
export interface ChartDesignPreset {
  name: string;
  swatch: readonly [string, string, string];
  values: Partial<Pick<ChartDesign, ChartDesignEditableField<ChartDesignSystem>>>;
}

export const CHART_DESIGN_PRESETS: Record<ChartDesignSystem, readonly ChartDesignPreset[]> = {
  humanDesign: [
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { chartDefinedColor: "#7c3aed", channelsColor: "#a78bfa", gatesColor: "#c4b5fd", personalityActivationColor: "#7c3aed", designActivationColor: "#f59e0b", backgroundColor: "#ffffff" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { chartDefinedColor: "#27272a", channelsColor: "#71717a", gatesColor: "#a1a1aa", personalityActivationColor: "#27272a", designActivationColor: "#a1a1aa", backgroundColor: "#ffffff" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { chartDefinedColor: "#c2410c", channelsColor: "#f59e0b", gatesColor: "#fb923c", personalityActivationColor: "#c2410c", designActivationColor: "#f59e0b", backgroundColor: "#fff7ed" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { chartDefinedColor: "#818cf8", channelsColor: "#38bdf8", gatesColor: "#c4b5fd", personalityActivationColor: "#818cf8", designActivationColor: "#38bdf8", backgroundColor: "#0f1115" } },
  ],
  mandala: [
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { chartDefinedColor: "#7c3aed", personalityActivationColor: "#7c3aed", designActivationColor: "#f59e0b", mandalaZodiacColor: "#8b5cf6", mandalaGateRingColor: "#a78bfa", mandalaQuadrantColor: "#71717a", backgroundColor: "#ffffff" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { chartDefinedColor: "#27272a", personalityActivationColor: "#27272a", designActivationColor: "#a1a1aa", mandalaZodiacColor: "#52525b", mandalaGateRingColor: "#a1a1aa", mandalaQuadrantColor: "#d4d4d8", backgroundColor: "#ffffff" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { chartDefinedColor: "#c2410c", personalityActivationColor: "#c2410c", designActivationColor: "#f59e0b", mandalaZodiacColor: "#ea580c", mandalaGateRingColor: "#fb923c", mandalaQuadrantColor: "#d6a373", backgroundColor: "#fff7ed" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { chartDefinedColor: "#818cf8", personalityActivationColor: "#818cf8", designActivationColor: "#38bdf8", mandalaZodiacColor: "#a78bfa", mandalaGateRingColor: "#4b5563", mandalaQuadrantColor: "#374151", backgroundColor: "#0f1115" } },
  ],
  astrology: [
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { wheelAccentColor: "#7c3aed", backgroundColor: "#ffffff" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { wheelAccentColor: "#27272a", backgroundColor: "#ffffff" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { wheelAccentColor: "#c2410c", backgroundColor: "#fff7ed" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { wheelAccentColor: "#818cf8", backgroundColor: "#0f1115" } },
  ],
};
