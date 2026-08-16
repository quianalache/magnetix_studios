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
 * column + Variable arrows). `human-design-chart.tsx` (the BodyGraph
 * itself) keeps its current hardcoded Personality/Design colors
 * unchanged, same as every other "not wired to the BodyGraph" field
 * noted throughout this file — these 5 drive `human-design-full-chart.tsx`
 * only.
 *
 * 2026-08-10, same day — Planet Boxes: real behavior confirmed against
 * the live Bodygraph chart-design tool (their actual "Color Planets
 * Only" / "Color Planets and Gates" toggle). `planetBoxMode` picks
 * between them; `planetBoxBorderRadius` only has an effect in fullBox
 * mode (iconOnly has no filled box to round). Real consequence for
 * `planetBoxColor` above: neither accurate mode uses it any more —
 * iconOnly leaves the row genuinely unfilled (matching Bodygraph's own
 * real rendering, confirmed by direct inspection, not a plain white
 * placeholder standing in for "no color set"), and fullBox fills with
 * `personalityActivationColor`/`designActivationColor` instead (also
 * matching Bodygraph, whose "Planets and Gates" mode fills with their
 * own Design/Personality colors, not a separate arbitrary box color).
 * `planetBoxColor` is kept on the model/API/UI rather than deleted —
 * her explicit instruction — but `human-design-full-chart.tsx` no
 * longer reads it for anything. Flagging plainly rather than inventing
 * a use for it just to avoid saying "currently inert."
 *
 * 2026-08-10, same day — Traditional Centers Colors: real behavior
 * confirmed against the live Bodygraph chart-design tool's own "Enable
 * Traditional Centers Colors" toggle. `centersMode: "uniform"` (default)
 * is exactly today's existing behavior, unchanged — every defined center
 * uses `chartDefinedColor`. `"traditional"` gives each of the 9 centers
 * its own real color instead, from the 9 fields below — unlike the
 * Personality/Design/Arrow/Planet-Box fields added earlier today, this
 * one DOES wire into `human-design-chart.tsx` (the actual BodyGraph)
 * directly, not just the not-yet-wired full-chart layout. The 9 default
 * values are the real defaults read directly off Bodygraph's own
 * traditional-mode fields, not invented.
 */

export type ChartDesignSystem = "humanDesign" | "astrology" | "mandala";

export type VariableArrowStyle = "solid" | "outline";

export type PlanetBoxMode = "iconOnly" | "fullBox";

export type CentersMode = "uniform" | "traditional";

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
   * HD and Mandala — Personality-side activation marker color. Originally
   * HD-only (the full chart layout's Personality column); reused as-is by
   * mandala-chart.tsx as of 2026-08-15 (Phase 6) for its own Personality
   * dots/planet-glyphs/line-glyphs instead of adding a second, redundant
   * field for the same concept on the same record shape.
   */
  personalityActivationColor: string;
  /** HD and Mandala — Design-side activation marker color. Same reuse note as personalityActivationColor above. */
  designActivationColor: string;
  /** HD only — Variable arrow accent color, for the 4 arrows around the full chart layout (not built yet). */
  arrowColor: string;
  /** HD only — Variable arrow visual style, for the same not-yet-built arrows. */
  arrowStyle: VariableArrowStyle;
  /** HD only — currently unused by human-design-full-chart.tsx (see header comment) — kept for backward compatibility, not deleted. */
  planetBoxColor: string;
  /** HD only — "iconOnly" colors just the planet glyph with that side's activation color, row stays unfilled. "fullBox" fills the entire Design/Personality row with the activation color, matching Bodygraph's own real "Color Planets and Gates" mode. */
  planetBoxMode: PlanetBoxMode;
  /** HD only — corner rounding (px) for a fullBox row. No effect in iconOnly mode, which has no filled box to round. */
  planetBoxBorderRadius: number;
  /** HD only — "uniform" (existing behavior) uses chartDefinedColor for every defined center. "traditional" uses each center's own color below. */
  centersMode: CentersMode;
  /** HD only, traditional mode — real default confirmed against the live Bodygraph chart-design tool. */
  headCenterColor: string;
  ajnaCenterColor: string;
  throatCenterColor: string;
  gCenterColor: string;
  heartCenterColor: string;
  spleenCenterColor: string;
  sacralCenterColor: string;
  solarPlexusCenterColor: string;
  rootCenterColor: string;
  /** All 3 systems — the chart's background color (every real Bodygraph chart type has this). */
  backgroundColor: string;
  /** Astrology only — which house system this design's readings use. Matches HouseSystem in astrology.ts exactly. */
  houseSystem: "placidus" | "whole" | "equal";
  /** Astrology only — ring/planet-marker accent color. */
  wheelAccentColor: string;
  /** Mandala only, added 2026-08-15 (Phase 6, completing the Mandala rebuild) — the outer zodiac ring's band/label color. */
  mandalaZodiacColor: string;
  /** Mandala only — the structural gate-ring boundary circles and inactive-gate tick color (distinct from chartDefinedColor/gateColor, which is the accent ring around each activated dot). */
  mandalaGateRingColor: string;
  /** Mandala only — the 4 quadrant divider lines and their numbers. */
  mandalaQuadrantColor: string;
  /**
   * ISO string, not a raw Firestore Timestamp — resolved server-side
   * (chart-design-service.ts's `toDesign`) before this ever reaches a
   * caller. Unused by every current consumer's render output, but real
   * Timestamp/FieldValue instances aren't plain-serializable, and this
   * type crosses into Client Components (the public decoder form, the
   * report design viewer) where a non-plain-object prop throws — see
   * 2026-08-11 fix. Null while the write is still in flight (a
   * just-created design hasn't been re-read yet, so the real value isn't
   * known — same "don't fabricate a client-side date" convention as
   * energetic-decoder-service.ts's createEnergeticDecoderReading).
   */
  createdAt: string | null;
  updatedAt: string | null;
}

export function defaultChartDesignColor(): string {
  return "#d4d4d8"; // zinc-300 — same traditional default as defaultEnergeticDecoderTheme()
}
