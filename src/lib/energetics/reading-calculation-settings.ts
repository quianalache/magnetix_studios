import type { ChartDesign } from "@/types/chart-design";
import type { ChartDesignSet } from "@/types/chart-design-set";
import { resolveChartDesign } from "./chart-design-resolution";

/**
 * Reading calculation settings (unified Chart Designs, 2026-10). These
 * decide how NEW readings are calculated and live in the reading
 * configuration (`subAccount.energeticDecoderReportConfig`), never on a
 * Chart Design — changing a design, applying a preset or picking a new
 * default design can't change a calculation. Existing readings store the
 * house system they were calculated with (`astrology.houses.system`) and
 * are never recalculated.
 *
 * Pure: shared by reading creation, the settings API and the one-time
 * copy script, so they all agree.
 */

export const ASTROLOGY_HOUSE_SYSTEMS = ["placidus", "whole", "equal"] as const;
export type AstrologyHouseSystem = (typeof ASTROLOGY_HOUSE_SYSTEMS)[number];

export function isAstrologyHouseSystem(value: unknown): value is AstrologyHouseSystem {
  return typeof value === "string" && (ASTROLOGY_HOUSE_SYSTEMS as readonly string[]).includes(value);
}

export type HouseSystemSource = "setting" | "defaultDesign" | "fallback";

/**
 * The house system new readings use:
 *  1. the explicit calculation setting, when saved;
 *  2. otherwise the rule every reading has used until now — the default
 *     Astrology design record's value (only until the one-time copy has
 *     saved it as the setting);
 *  3. otherwise Placidus, the calculator's own default.
 */
export function effectiveAstrologyHouseSystem(input: {
  subAccountId: string;
  config: { astrologyHouseSystem?: unknown } | null | undefined;
  designs: readonly ChartDesign[];
  sets: readonly ChartDesignSet[];
}): { houseSystem: AstrologyHouseSystem; source: HouseSystemSource } {
  const saved = input.config?.astrologyHouseSystem;
  if (isAstrologyHouseSystem(saved)) return { houseSystem: saved, source: "setting" };
  const design = resolveChartDesign(
    { subAccountId: input.subAccountId, designs: input.designs, sets: input.sets, profile: null },
    "astrology",
  ).design;
  if (design && isAstrologyHouseSystem(design.houseSystem)) return { houseSystem: design.houseSystem, source: "defaultDesign" };
  return { houseSystem: "placidus", source: "fallback" };
}
