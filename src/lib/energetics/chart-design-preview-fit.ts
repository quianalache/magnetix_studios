/**
 * Chart Design editor preview sizing (2026-10) — pure, client-safe.
 *
 * Each chart renders at a fixed natural width (so its own layout never
 * changes — Human Design keeps its Design | BodyGraph | Personality columns)
 * and the whole chart is then scaled uniformly to fit the preview area.
 * Uniform scaling can't distort proportions, and fitting both dimensions
 * means nothing is cropped.
 */

/** Width each renderer is laid out at before scaling. Human Design needs ≥1024px of inner width for its three-column layout. */
export const CHART_PREVIEW_NATURAL_WIDTH = {
  humanDesign: 1080,
  mandala: 640,
  astrology: 640,
} as const;

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
