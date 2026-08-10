import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Chart Designs — list-first replacement for the old single "Design" tab
 * (2026-08-09). Expanded to real parity after actually opening one of her
 * real saved Bodygraph chart designs (she has 8: Copy of HHD, Default,
 * HHD, Luna, Leo, Chloe, Rory, Karen Curry Parker) — the v1 here shipped
 * with exactly one color field, which she correctly called "a whole hell
 * of a lot missing" once she saw the real tool has 5 chart types × ~11
 * style categories each (background image, arrow/planet-icon style,
 * 5 separate color categories, per chart type).
 *
 * Honest scope note on the rebuild: this maps to every real, controllable
 * visual element THIS app's own chart renderers actually have — it is not
 * a literal 1:1 clone of every Bodygraph toggle. Background Image (an
 * uploaded image, not a color), Arrow/Planet Icon style variants, the
 * Planet Boxes toggle, and Relationship Colors (this app has no
 * Relationship chart at all) don't have a real feature behind them here,
 * so they're not faked as settings that would do nothing. What's below —
 * defined-center color, channel color, gate accent color, background
 * color, Astrology wheel/planet accent color, house system, and (new)
 * Mandala as a real third system — are all real, wired into the actual
 * chart-drawing components, verified by rendering.
 */

export type ChartDesignSystem = "humanDesign" | "astrology" | "mandala";

export interface ChartDesign {
  id: string;
  subAccountId: string;
  agencyId: string;
  system: ChartDesignSystem;
  name: string;
  isDefault: boolean;
  /** HD: defined-center fill. Mandala: activated-gate ring color. Ignored for astrology. */
  chartDefinedColor: string;
  /** HD only — defined-channel line color. */
  channelsColor: string;
  /** HD only — activated-gate number/dot accent color. */
  gatesColor: string;
  /** All 3 systems — the chart's background color (every real Bodygraph chart type has this). */
  backgroundColor: string;
  /** Astrology only — which house system this design's readings use. Matches HouseSystem in astrology.ts exactly. */
  houseSystem: "placidus" | "whole" | "equal";
  /** Astrology only — ring/planet-marker accent color. */
  wheelAccentColor: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function defaultChartDesignColor(): string {
  return "#d4d4d8"; // zinc-300 — same traditional default as defaultEnergeticDecoderTheme()
}
