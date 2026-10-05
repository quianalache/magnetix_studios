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
 * Human Design full chart, fixed horizontal parts (human-design-full-chart.tsx):
 * 16px padding each side, two 170px rails, two 12px gaps — 396px. The center
 * (BodyGraph + Variables) gets everything else.
 */
export const HD_FULL_CHART_FIXED_WIDTH = 2 * 16 + 2 * 170 + 2 * 12;
/** The BodyGraph is never laid out smaller than Option B's 360px or (when the width allows) narrower than 440px of center. */
export const HD_MIN_BODYGRAPH = 360;
export const HD_MIN_CENTER = 440;

/**
 * Human Design preview layout that USES the preview's whole width.
 *
 * The chart is laid out exactly as wide as the preview box (÷ scale), so the
 * cream canvas always fills it and the rails sit at its edges. The scale is
 * the largest that keeps the rails at least as legible as at the minimum
 * 836px width, keeps the rails within the visible height, and still fits a
 * 360px BodyGraph. The BodyGraph then takes the largest size that fits both
 * the center width and the visible height — the chart never grows taller
 * than the preview and never makes the whole composition scale down.
 *
 * `railsHeight` / `centerFixedHeight` (padding + Variables above the
 * BodyGraph, at natural size) and `bodygraphAspect` (height ÷ width of the
 * BodyGraph box) are measured from the rendered chart.
 */
export function humanDesignFillLayout(input: {
  boxWidth: number;
  maxHeight: number;
  railsHeight: number;
  centerFixedHeight: number;
  bodygraphAspect: number;
  maxScale?: number;
}): { scale: number; naturalWidth: number; bodygraphMax: number } | null {
  const { boxWidth, maxHeight, railsHeight, centerFixedHeight, bodygraphAspect, maxScale = 1 } = input;
  if (!(boxWidth > 0) || !(maxHeight > 0) || !(railsHeight > 0) || !(bodygraphAspect > 0)) return null;
  const minNatural = HD_FULL_CHART_FIXED_WIDTH + HD_MIN_CENTER;
  const scale = Math.min(
    maxScale,
    boxWidth / minNatural,
    maxHeight / railsHeight,
    maxHeight / (centerFixedHeight + bodygraphAspect * HD_MIN_BODYGRAPH),
  );
  const naturalWidth = boxWidth / scale;
  const centerWidth = naturalWidth - HD_FULL_CHART_FIXED_WIDTH;
  const byHeight = (maxHeight / scale - centerFixedHeight) / bodygraphAspect;
  const bodygraphMax = Math.floor(Math.max(HD_MIN_BODYGRAPH, Math.min(centerWidth, byHeight)));
  return { scale, naturalWidth, bodygraphMax };
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
