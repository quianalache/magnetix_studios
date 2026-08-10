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
 * uploaded image, not a color) and Relationship Colors (this app has no
 * Relationship chart at all) don't have a real feature behind them here,
 * so they're not faked as settings that would do nothing. What's below —
 * defined-center color, channel color, gate accent color, background
 * color, Astrology wheel/planet accent color, house system, Mandala as a
 * real third system — are all real, wired into the actual chart-drawing
 * components, verified by rendering.
 *
 * 2026-08-10 addition — Personality/Design activation colors, Variable
 * arrow color/style, and Planet Box color: these 5 fields exist on the
 * model and in this tab ahead of the renderer that will use them (the
 * full Human Design chart layout — Design column + BodyGraph + Personality
 * column + Variable arrows — audited but not yet built). Saving early so
 * the full-chart component has real customization to read from the
 * moment it ships, rather than needing its own follow-up migration. Until
 * that component exists, these 5 fields are inert — saved and reloaded
 * correctly, but nothing on screen changes yet. `human-design-chart.tsx`
 * (the BodyGraph itself) keeps its current hardcoded Personality/Design
 * colors unchanged for now, same as every other "not wired yet" field
 * noted throughout this file.
 */

export type ChartDesignSystem = "humanDesign" | "astrology" | "mandala";

export type VariableArrowStyle = "solid" | "outline";

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
  /**
   * HD only — Personality-side activation marker color, for the full
   * chart layout's Personality column (not built yet — see header
   * comment). `human-design-chart.tsx`'s BodyGraph itself still uses its
   * own hardcoded Personality color, unaffected by this field for now.
   */
  personalityActivationColor: string;
  /** HD only — Design-side activation marker color. Same "not wired to the BodyGraph yet" note as personalityActivationColor above. */
  designActivationColor: string;
  /** HD only — Variable arrow accent color, for the 4 arrows around the full chart layout (not built yet). */
  arrowColor: string;
  /** HD only — Variable arrow visual style, for the same not-yet-built arrows. */
  arrowStyle: VariableArrowStyle;
  /** HD only — background color for each Design/Personality "planet box" row (glyph + Gate.Line) in the full chart layout (not built yet). */
  planetBoxColor: string;
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
