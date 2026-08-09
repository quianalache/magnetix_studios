import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Chart Designs — list-first replacement for the old single "Design" tab
 * (2026-08-09, her 3rd round of Energetic Decoder feedback: "you have your
 * chart design page, which then gives you a list of the different chart
 * designs, and you can create a new one" — modeled on bodygraph.com's own
 * Chart Design list, not copied exactly).
 *
 * A sub-account can now save multiple named presets per system. Exactly one
 * per system is marked `isDefault` — that's the one actually applied to the
 * public decoder tool, saved readings, and PDFs today. Non-default presets
 * are real, saved, and listed, but there's no per-client/per-embed design
 * selection wired up yet (only one rendering slot exists per system) — that
 * plumbing is future work, called out honestly rather than faked.
 *
 * Backward compatible with the pre-existing single color picker: the
 * default Human Design design's `chartDefinedColor` is write-through synced
 * onto `subAccounts/{id}.energeticDecoderTheme.chartDefinedColor` (the field
 * the 3 existing consumers — the public decoder page, the saved report page,
 * and the internal Readings tab — already read), so none of them needed to
 * change for this to work.
 */

export type ChartDesignSystem = "humanDesign" | "astrology";

export interface ChartDesign {
  id: string;
  subAccountId: string;
  agencyId: string;
  system: ChartDesignSystem;
  name: string;
  isDefault: boolean;
  /** Human Design only — which color a defined center fills with. Ignored for astrology designs. */
  chartDefinedColor: string;
  /** Astrology only — which house system this design's readings use. Ignored for Human Design designs. Matches HouseSystem in astrology.ts exactly. */
  houseSystem: "placidus" | "whole" | "equal";
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function defaultChartDesignColor(): string {
  return "#d4d4d8"; // zinc-300 — same traditional default as defaultEnergeticDecoderTheme()
}
