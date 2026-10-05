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

/** Shortest the side-by-side workspace gets; on short windows the page scrolls rather than squashing the preview. */
export const EDITOR_WORKSPACE_MIN_HEIGHT = 440;

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
 * Height for the side-by-side workspace: from its own top to the bottom of
 * the scrolling page area (as if scrolled to the top), never below the minimum.
 */
export function editorWorkspaceHeight(input: { workspaceTop: number; areaBottom: number; minHeight?: number }): number {
  const { workspaceTop, areaBottom, minHeight = EDITOR_WORKSPACE_MIN_HEIGHT } = input;
  return Math.max(minHeight, Math.floor(areaBottom - workspaceTop));
}

/**
 * Height for the side-by-side workspace when the editor's tab bar is sticky:
 * the page area's visible height, minus the bar, the gap between bar and
 * workspace, and any bottom padding — i.e. exactly the room left once the
 * header above has scrolled out of view. Never below the minimum.
 */
export function editorWorkspaceHeightBelowStickyBar(input: {
  areaHeight: number;
  stickyBarHeight: number;
  gapAbove: number;
  bottomGap: number;
  minHeight?: number;
}): number {
  const { areaHeight, stickyBarHeight, gapAbove, bottomGap, minHeight = EDITOR_WORKSPACE_MIN_HEIGHT } = input;
  return Math.max(minHeight, Math.floor(areaHeight - stickyBarHeight - gapAbove - bottomGap));
}
