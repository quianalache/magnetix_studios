"use client";

import { useId } from "react";
import type { StyleConfig } from "@/types/pages-funnels-puck";
import type { MetricFormatConfig } from "@/lib/pages-funnels/data-metrics/model";
import type { MetricAccent } from "@/lib/pages-funnels/data-metrics/accent";
import { PROGRESS_COLOR_NOTICE_TEXT, resolveProgressColor } from "@/lib/pages-funnels/data-metrics/progress-color";
import type { BrandColor } from "@/types/brand-kit";
import { formatChartValue } from "@/lib/pages-funnels/data-metrics/chart";
import {
  RING_SIZE_PX,
  RING_VIEWBOX,
  computeProgress,
  formatPercent,
  ringGeometry,
  type ProgressThickness,
  type RingSize,
} from "@/lib/pages-funnels/data-metrics/progress";
import { BlockEmptyState, BlockShell } from "./block-shell";
import { progressAriaText } from "./progress-text";
import { useEnterAnimation } from "./use-enter-animation";

export interface ProgressRingProps extends MetricFormatConfig {
  id: string;
  currentValue?: number | string;
  targetValue?: number | string;
  centerDisplay?: "percentage" | "value" | "none";
  label?: string;
  supportingText?: string;
  size?: RingSize;
  thickness?: ProgressThickness;
  alignment?: "left" | "center";
  accent?: MetricAccent;
  /** Color source (Magnetix / Brand color / Custom). Absent = Magnetix (`accent`). */
  color?: unknown;
  /** This page's workspace Brand colors, live from page metadata. */
  brandKit?: readonly Pick<BrandColor, "id" | "hex">[];
  animate?: boolean;
  style?: StyleConfig;
  editing?: boolean;
}

/**
 * Progress Ring: circular progress toward one target. A neutral, tenant-safe
 * primitive (geometry shared with nothing Decoder-specific). The SVG is
 * decorative; the wrapper is the accessible progressbar.
 */
export function ProgressRingRender({
  id,
  currentValue,
  targetValue,
  centerDisplay = "percentage",
  label = "",
  supportingText = "",
  size = "medium",
  thickness = "medium",
  alignment = "left",
  accent = "plum",
  color,
  brandKit,
  animate = true,
  format = "number",
  decimalPlaces = 0,
  useThousandsSeparator = true,
  currency = "USD",
  style,
  editing = false,
}: ProgressRingProps) {
  const state = computeProgress(currentValue, targetValue);
  const { ref, progress } = useEnterAnimation<HTMLDivElement>({
    enabled: !editing && animate && !!state,
    mode: "onScroll",
    durationMs: 1200,
  });
  const labelId = useId();

  if (!state) {
    return editing ? (
      <BlockShell id={id} style={style}>
        <BlockEmptyState>
          <span>Add progress values</span>
          <span className="text-caption">Enter a current value and a target above zero.</span>
        </BlockEmptyState>
      </BlockShell>
    ) : null;
  }

  const paint = resolveProgressColor({ accent, color, brandKit });
  const fmt: MetricFormatConfig = { format, decimalPlaces, useThousandsSeparator, currency };
  const geo = ringGeometry(thickness, state.fillPercent * progress);
  const px = RING_SIZE_PX[size] ?? RING_SIZE_PX.medium;
  const center =
    centerDisplay === "none"
      ? null
      : centerDisplay === "value"
        ? `${formatChartValue(state.current, fmt)} of ${formatChartValue(state.target, fmt)}`
        : formatPercent(state.percent);
  const c = RING_VIEWBOX / 2;
  const stacked = alignment === "center";

  return (
    <BlockShell id={id} style={style}>
      <div
        ref={ref}
        className={
          stacked
            ? "flex flex-col items-center gap-4 text-center"
            : "flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6"
        }
      >
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={state.target}
          aria-valuenow={state.ariaNow}
          aria-valuetext={progressAriaText(state, fmt)}
          {...(label ? { "aria-labelledby": labelId } : { "aria-label": "Progress" })}
          className="relative shrink-0"
          style={{ width: px, maxWidth: "100%", aspectRatio: "1 / 1" }}
        >
          <svg viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`} className="block h-full w-full -rotate-90" aria-hidden="true">
            <circle cx={c} cy={c} r={geo.r} fill="none" stroke={paint.track} strokeWidth={geo.stroke} />
            {geo.filled > 0 ? (
              <circle
                cx={c}
                cy={c}
                r={geo.r}
                fill="none"
                stroke={paint.fill}
                strokeWidth={geo.stroke}
                strokeLinecap="round"
                strokeDasharray={geo.dashArray}
                data-progress-fill={state.fillPercent}
              />
            ) : null}
          </svg>
          {center ? (
            <span
              aria-hidden="true"
              className={`absolute inset-0 flex items-center justify-center px-3 text-center font-semibold tabular-nums ${
                centerDisplay === "value" || size === "small" ? "text-section" : "text-title-lg"
              }`}
            >
              {center}
            </span>
          ) : null}
        </div>
        {label || supportingText ? (
          <div className="min-w-0">
            {label ? (
              <p id={labelId} className="text-title-md font-semibold">
                {label}
              </p>
            ) : null}
            {supportingText ? <p className="text-muted-foreground text-body mt-1">{supportingText}</p> : null}
          </div>
        ) : null}
      </div>
      {editing && paint.notice ? (
        <p className="text-caption text-muted-foreground mt-2" data-progress-color-notice={paint.notice}>
          {PROGRESS_COLOR_NOTICE_TEXT[paint.notice]}
        </p>
      ) : null}
    </BlockShell>
  );
}
