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
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { chartDefinedColor: "#7c3aed", personalityActivationColor: "#7c3aed", designActivationColor: "#f59e0b", mandalaZodiacColor: "#8b5cf6", mandalaGateRingColor: "#a78bfa", mandalaQuadrantColor: "#71717a", mandalaFireColor: "#c026d3", mandalaEarthColor: "#7c3aed", mandalaAirColor: "#a78bfa", mandalaWaterColor: "#4f46e5", mandalaHexagramColor: "#27272a", mandalaGateTextColor: "#27272a", mandalaGlowColor: "#ffffff", mandalaInitiationColor: "#60608b", mandalaInitiationTextColor: "#ffffff", mandalaCivilizationColor: "#7e6997", mandalaCivilizationTextColor: "#ffffff", mandalaDualityColor: "#546579", mandalaDualityTextColor: "#ffffff", mandalaMutationColor: "#99759f", mandalaMutationTextColor: "#ffffff", mandalaFireTextColor: "#ffffff", mandalaEarthTextColor: "#ffffff", mandalaAirTextColor: "#27272a", mandalaWaterTextColor: "#ffffff", mandalaHeadCenterColor: "#f0abfc", mandalaAjnaCenterColor: "#a78bfa", mandalaThroatCenterColor: "#c084fc", mandalaGCenterColor: "#e879f9", mandalaHeartCenterColor: "#be185d", mandalaSplenicCenterColor: "#6366f1", mandalaSacralCenterColor: "#db2777", mandalaSolarPlexusCenterColor: "#9333ea", mandalaRootCenterColor: "#7c3aed", mandalaZodiacSymbolColor: "#ffffff", backgroundColor: "#ffffff" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { chartDefinedColor: "#27272a", personalityActivationColor: "#27272a", designActivationColor: "#a1a1aa", mandalaZodiacColor: "#52525b", mandalaGateRingColor: "#a1a1aa", mandalaQuadrantColor: "#d4d4d8", mandalaFireColor: "#3f3f46", mandalaEarthColor: "#52525b", mandalaAirColor: "#a1a1aa", mandalaWaterColor: "#71717a", mandalaHexagramColor: "#27272a", mandalaGateTextColor: "#27272a", mandalaGlowColor: "#ffffff", mandalaInitiationColor: "#cfcfdd", mandalaInitiationTextColor: "#27272a", mandalaCivilizationColor: "#dbd5e2", mandalaCivilizationTextColor: "#27272a", mandalaDualityColor: "#bdc6d1", mandalaDualityTextColor: "#27272a", mandalaMutationColor: "#e0d5e2", mandalaMutationTextColor: "#27272a", mandalaFireTextColor: "#ffffff", mandalaEarthTextColor: "#ffffff", mandalaAirTextColor: "#27272a", mandalaWaterTextColor: "#ffffff", mandalaHeadCenterColor: "#d4d4d8", mandalaAjnaCenterColor: "#a1a1aa", mandalaThroatCenterColor: "#71717a", mandalaGCenterColor: "#e4e4e7", mandalaHeartCenterColor: "#3f3f46", mandalaSplenicCenterColor: "#52525b", mandalaSacralCenterColor: "#27272a", mandalaSolarPlexusCenterColor: "#8a8a93", mandalaRootCenterColor: "#5f5f68", mandalaZodiacSymbolColor: "#ffffff", backgroundColor: "#ffffff" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { chartDefinedColor: "#c2410c", personalityActivationColor: "#c2410c", designActivationColor: "#f59e0b", mandalaZodiacColor: "#ea580c", mandalaGateRingColor: "#fb923c", mandalaQuadrantColor: "#d6a373", mandalaFireColor: "#c2410c", mandalaEarthColor: "#a16207", mandalaAirColor: "#f59e0b", mandalaWaterColor: "#b45309", mandalaHexagramColor: "#27272a", mandalaGateTextColor: "#27272a", mandalaGlowColor: "#fffcf9", mandalaInitiationColor: "#d6a373", mandalaInitiationTextColor: "#27272a", mandalaCivilizationColor: "#dbd683", mandalaCivilizationTextColor: "#27272a", mandalaDualityColor: "#cf5d5b", mandalaDualityTextColor: "#ffffff", mandalaMutationColor: "#c4df93", mandalaMutationTextColor: "#27272a", mandalaFireTextColor: "#ffffff", mandalaEarthTextColor: "#ffffff", mandalaAirTextColor: "#27272a", mandalaWaterTextColor: "#ffffff", mandalaHeadCenterColor: "#fcd34d", mandalaAjnaCenterColor: "#d6a373", mandalaThroatCenterColor: "#fb923c", mandalaGCenterColor: "#f59e0b", mandalaHeartCenterColor: "#b91c1c", mandalaSplenicCenterColor: "#a16207", mandalaSacralCenterColor: "#dc2626", mandalaSolarPlexusCenterColor: "#ea580c", mandalaRootCenterColor: "#92400e", mandalaZodiacSymbolColor: "#ffffff", backgroundColor: "#fff7ed" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { chartDefinedColor: "#818cf8", personalityActivationColor: "#818cf8", designActivationColor: "#38bdf8", mandalaZodiacColor: "#a78bfa", mandalaGateRingColor: "#4b5563", mandalaQuadrantColor: "#374151", mandalaFireColor: "#f472b6", mandalaEarthColor: "#a78bfa", mandalaAirColor: "#38bdf8", mandalaWaterColor: "#6366f1", mandalaHexagramColor: "#e4e4e7", mandalaGateTextColor: "#e4e4e7", mandalaGlowColor: "#0f1115", mandalaInitiationColor: "#374151", mandalaInitiationTextColor: "#ffffff", mandalaCivilizationColor: "#423f5d", mandalaCivilizationTextColor: "#ffffff", mandalaDualityColor: "#2b3c3f", mandalaDualityTextColor: "#ffffff", mandalaMutationColor: "#584869", mandalaMutationTextColor: "#ffffff", mandalaFireTextColor: "#27272a", mandalaEarthTextColor: "#27272a", mandalaAirTextColor: "#27272a", mandalaWaterTextColor: "#ffffff", mandalaHeadCenterColor: "#fde68a", mandalaAjnaCenterColor: "#86efac", mandalaThroatCenterColor: "#67e8f9", mandalaGCenterColor: "#fcd34d", mandalaHeartCenterColor: "#f87171", mandalaSplenicCenterColor: "#34d399", mandalaSacralCenterColor: "#fb7185", mandalaSolarPlexusCenterColor: "#fb923c", mandalaRootCenterColor: "#a78bfa", mandalaZodiacSymbolColor: "#ffffff", backgroundColor: "#0f1115" } },
  ],
  astrology: [
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { wheelAccentColor: "#7c3aed", backgroundColor: "#ffffff", astroHousesBackgroundColor: "#faf7ff", astroAspectsBackgroundColor: "#ffffff", astroWheelLineColor: "#a78bfa", astroHouseLineColor: "#ddd6fe", astroHouseNumberColor: "#5b21b6", astroAngleColor: "#5b21b6", astroFireColor: "#c026d3", astroEarthColor: "#7c3aed", astroAirColor: "#8b5cf6", astroWaterColor: "#4f46e5", astroZodiacSymbolColor: "#ffffff", astroConjunctionColor: "#4c1d95", astroSextileColor: "#0891b2", astroSquareColor: "#db2777", astroTrineColor: "#7c3aed", astroOppositionColor: "#be185d" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { wheelAccentColor: "#27272a", backgroundColor: "#ffffff", astroHousesBackgroundColor: "#fafafa", astroAspectsBackgroundColor: "#ffffff", astroWheelLineColor: "#71717a", astroHouseLineColor: "#d4d4d8", astroHouseNumberColor: "#3f3f46", astroAngleColor: "#18181b", astroFireColor: "#3f3f46", astroEarthColor: "#66666f", astroAirColor: "#85858e", astroWaterColor: "#52525b", astroZodiacSymbolColor: "#ffffff", astroConjunctionColor: "#18181b", astroSextileColor: "#71717a", astroSquareColor: "#27272a", astroTrineColor: "#52525b", astroOppositionColor: "#27272a" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { wheelAccentColor: "#c2410c", backgroundColor: "#fff7ed", astroHousesBackgroundColor: "#fffbf5", astroAspectsBackgroundColor: "#ffffff", astroWheelLineColor: "#d6a373", astroHouseLineColor: "#f1d5b8", astroHouseNumberColor: "#7c2d12", astroAngleColor: "#9a3412", astroFireColor: "#c2410c", astroEarthColor: "#a16207", astroAirColor: "#d97706", astroWaterColor: "#b45309", astroZodiacSymbolColor: "#ffffff", astroConjunctionColor: "#7c2d12", astroSextileColor: "#a16207", astroSquareColor: "#b91c1c", astroTrineColor: "#ea580c", astroOppositionColor: "#9a3412" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { wheelAccentColor: "#818cf8", backgroundColor: "#0f1115", astroHousesBackgroundColor: "#171a21", astroAspectsBackgroundColor: "#0f1115", astroWheelLineColor: "#4b5563", astroHouseLineColor: "#374151", astroHouseNumberColor: "#cbd5e1", astroAngleColor: "#e0e7ff", astroFireColor: "#f472b6", astroEarthColor: "#a78bfa", astroAirColor: "#38bdf8", astroWaterColor: "#6366f1", astroZodiacSymbolColor: "#0f1115", astroConjunctionColor: "#e5e7eb", astroSextileColor: "#2dd4bf", astroSquareColor: "#fb7185", astroTrineColor: "#60a5fa", astroOppositionColor: "#f472b6" } },
  ],
};
