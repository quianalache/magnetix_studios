"use client";

import { useId } from "react";
import type { PuckAlignment, StyleConfig } from "@/types/pages-funnels-puck";
import type { MetricFormatConfig } from "@/lib/pages-funnels/data-metrics/model";
import { accentColor, accentTrack, type MetricAccent } from "@/lib/pages-funnels/data-metrics/accent";
import {
  BAR_THICKNESS_PX,
  computeProgress,
  formatPercent,
  type ProgressThickness,
} from "@/lib/pages-funnels/data-metrics/progress";
import { BlockEmptyState, BlockShell } from "./block-shell";
import { progressAriaText, progressValueText, type ProgressValueDisplay } from "./progress-text";
import { useEnterAnimation } from "./use-enter-animation";

export interface ProgressBarProps extends MetricFormatConfig {
  id: string;
  currentValue?: number | string;
  targetValue?: number | string;
  label?: string;
  supportingText?: string;
  valueDisplay?: ProgressValueDisplay;
  showPercentage?: boolean;
  thickness?: ProgressThickness;
  direction?: "ltr" | "rtl";
  alignment?: PuckAlignment;
  accent?: MetricAccent;
  animate?: boolean;
  style?: StyleConfig;
  editing?: boolean;
}

const TEXT_ALIGN: Record<PuckAlignment, string> = { left: "text-left", center: "text-center", right: "text-right" };

/** Progress Bar: progress toward one target (75 of 100, $7,500 of $10,000). */
export function ProgressBarRender({
  id,
  currentValue,
  targetValue,
  label = "",
  supportingText = "",
  valueDisplay = "of",
  showPercentage = true,
  thickness = "medium",
  direction = "ltr",
  alignment = "left",
  accent = "plum",
  animate = true,
  format = "number",
  decimalPlaces = 0,
  useThousandsSeparator = true,
  currency = "USD",
  style,
  editing = false,
}: ProgressBarProps) {
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

  const fmt: MetricFormatConfig = { format, decimalPlaces, useThousandsSeparator, currency };
  const valueText = progressValueText(state, valueDisplay, fmt);
  const height = BAR_THICKNESS_PX[thickness] ?? BAR_THICKNESS_PX.medium;
  const width = state.fillPercent * progress;
  const centered = alignment !== "left";

  return (
    <BlockShell id={id} style={style}>
      <div ref={ref} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={state.target}
            aria-valuenow={state.ariaNow}
            aria-valuetext={progressAriaText(state, fmt)}
            {...(label ? { "aria-labelledby": labelId } : { "aria-label": "Progress" })}
            className="relative min-w-0 flex-1 overflow-hidden rounded-full"
            style={{ height, background: accentTrack(accent) }}
          >
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                width: `${width}%`,
                background: accentColor(accent),
                [direction === "rtl" ? "right" : "left"]: 0,
              }}
              data-progress-fill={state.fillPercent}
            />
          </div>
          {showPercentage ? (
            <span aria-hidden="true" className="text-title-md shrink-0 font-semibold tabular-nums">
              {formatPercent(state.percent)}
            </span>
          ) : null}
        </div>
        {valueText || label || supportingText ? (
          <div
            className={
              centered
                ? `flex flex-col gap-1 ${TEXT_ALIGN[alignment]}`
                : "flex flex-wrap items-end justify-between gap-x-6 gap-y-1"
            }
          >
            <div className="min-w-0">
              {valueText ? <p className="text-section font-semibold tabular-nums">{valueText}</p> : null}
              {label ? (
                <p id={labelId} className="text-muted-foreground text-body-sm">
                  {label}
                </p>
              ) : null}
            </div>
            {supportingText ? (
              <p
                className="text-body-sm font-medium"
                style={{ color: accent === "default" ? undefined : accentColor(accent) }}
              >
                {supportingText}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </BlockShell>
  );
}
