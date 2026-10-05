/**
 * Chart Design editor preview sizing (2026-10) — pure, client-safe.
 *
 * Each chart renders at a fixed natural width (so its own layout never
 * changes — Human Design keeps its Design | BodyGraph | Personality columns)
 * and the whole chart is then scaled uniformly to fit the preview area.
 * Uniform scaling can't distort proportions, and fitting both dimensions
 * means nothing is cropped.
 */

/**
 * Width each renderer is laid out at before scaling. Human Design: the
 * compact full chart's three columns (170 + 12 + 440 + 12 + 170 = 804px)
 * plus its 16px padding each side = 836px, its natural size.
 */
export const CHART_PREVIEW_NATURAL_WIDTH = {
  humanDesign: 836,
  mandala: 640,
  astrology: 640,
} as const;

/**
 * Human Design "fill" layout (2026-10, decoupled): the Chart Design editor
 * renders the full chart UNSCALED at the preview's real width and height.
 * The two planet rails keep a fixed, readable size (170px, 12px text, all 13
 * rows with full names); the BodyGraph is sized on its own from the center
 * column's width and height (CSS container units in
 * human-design-full-chart.tsx), so making it larger never shrinks the rail
 * text. Only the spacing between rail rows stretches with the height.
 */
export const HD_FILL = {
  /** Rails, each side. */
  railWidth: 170,
  /** Gap between a rail and the BodyGraph column. */
  columnGap: 12,
  /** Canvas padding (each side). */
  padding: 8,
  /** Rail header ("DESIGN"/"PERSONALITY") line + its margin. */
  railHeader: 24,
  /** Tallest planet row (icon-only rows: 20px chip + 2 × 8px padding). */
  rowHeight: 36,
  rows: 13,
  minRowGap: 4,
  maxRowGap: 30,
  /** Narrowest BodyGraph column the fill layout is used for; narrower previews fall back to the scaled 836px chart. */
  minCenterWidth: 300,
  /** BodyGraph width ÷ height (the SVG's 200 × 320 viewBox). */
  bodygraphAspect: 200 / 320,
  /**
   * Empty margin inside that viewBox, measured (getBBox): the drawing spans
   * x 25.6–208.2 of 18–218 and y 4.0–309.8 of −4–316. The fill layout lets
   * this blank margin (only) run into the canvas padding / column gaps, so
   * the drawn BodyGraph fills the center column. Fractions of the viewBox,
   * kept a little under the measured margins.
   */
  bleedX: 0.035,
  bleedTop: 0.02,
  bleedBottom: 0.018,
} as const;

/** Narrowest preview the fill layout is used for. */
export const HD_FILL_MIN_WIDTH = 2 * HD_FILL.padding + 2 * HD_FILL.railWidth + 2 * HD_FILL.columnGap + HD_FILL.minCenterWidth;

/** Shortest the fill layout gets: both rails at the minimum row gap. */
export const HD_FILL_MIN_HEIGHT =
  2 * HD_FILL.padding + HD_FILL.railHeader + HD_FILL.rows * HD_FILL.rowHeight + HD_FILL.rows * HD_FILL.minRowGap;

/**
 * Fill-layout geometry for a preview of the given height: the canvas height
 * (never below the rails' minimum) and the rail row gap that spreads the 13
 * rows over it (clamped, so rows never crowd or drift far apart).
 */
export function humanDesignFillGeometry(height: number): { height: number; railRowGap: number } {
  const h = Math.max(HD_FILL_MIN_HEIGHT, Math.floor(height));
  const free = h - 2 * HD_FILL.padding - HD_FILL.railHeader - HD_FILL.rows * HD_FILL.rowHeight;
  const railRowGap = Math.min(HD_FILL.maxRowGap, Math.max(HD_FILL.minRowGap, Math.floor((free / HD_FILL.rows) * 10) / 10));
  return { height: h, railRowGap };
}

/** Largest scale a preview may grow to (text stays crisp; square charts may grow a little). */
export const CHART_PREVIEW_MAX_SCALE = {
  humanDesign: 1,
  mandala: 1.2,
  astrology: 1.2,
} as const;

/** Below this workspace width the controls and preview stack instead of sitting side by side. */
export const EDITOR_TWO_COLUMN_MIN_WIDTH = 896;

/** Stacked (narrow) layout: the preview never takes more than this much height. */
export const STACKED_PREVIEW_MAX_HEIGHT = 560;

/** Shortest the sticky preview's chart area gets on very short windows. */
export const STICKY_PREVIEW_MIN_HEIGHT = 280;

/**
 * The uniform scale that fits a chart of natural size into a box.
 * A box height of 0 or less means "width only" (the stacked layout, where
 * the caller passes a height cap instead). Returns 0 until sizes are known.
 */
export function previewFitScale(input: {
  boxWidth: number;
  boxHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  maxScale?: number;
}): number {
  const { boxWidth, boxHeight, naturalWidth, naturalHeight, maxScale = 1 } = input;
  if (!(boxWidth > 0) || !(naturalWidth > 0) || !(naturalHeight > 0)) return 0;
  const byWidth = boxWidth / naturalWidth;
  const byHeight = boxHeight > 0 ? boxHeight / naturalHeight : Number.POSITIVE_INFINITY;
  return Math.min(byWidth, byHeight, maxScale);
}

/**
 * Tallest the chart may be inside the sticky preview card: the visible page
 * area (it sticks inside the page's top padding) minus that padding at both
 * ends and the card's own title row/padding — so the whole card always fits
 * on screen while the controls scroll. Never below the minimum.
 */
export function stickyPreviewChartMaxHeight(input: {
  areaHeight: number;
  areaPaddingTop: number;
  areaPaddingBottom: number;
  cardChrome: number;
  minHeight?: number;
}): number {
  const { areaHeight, areaPaddingTop, areaPaddingBottom, cardChrome, minHeight = STICKY_PREVIEW_MIN_HEIGHT } = input;
  return Math.max(minHeight, Math.floor(areaHeight - areaPaddingTop - areaPaddingBottom - cardChrome));
}
