"use client";

import type { PuckAlignment, StyleConfig } from "@/types/pages-funnels-puck";
import type { MetricFormatConfig } from "@/lib/pages-funnels/data-metrics/model";
import { accentColor, type MetricAccent } from "@/lib/pages-funnels/data-metrics/accent";
import {
  counterDurationMs,
  counterValueAt,
  formatCounterValue,
  resolveCounter,
} from "@/lib/pages-funnels/data-metrics/counter";
import { BlockEmptyState, BlockShell } from "./block-shell";
import { useEnterAnimation, type EnterAnimationMode } from "./use-enter-animation";

const ALIGN: Record<PuckAlignment, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};
const JUSTIFY_ITEMS: Record<PuckAlignment, string> = {
  left: "justify-items-start",
  center: "justify-items-center",
  right: "justify-items-end",
};

export interface AnimatedCounterProps extends MetricFormatConfig {
  id: string;
  startValue?: number | string;
  endValue?: number | string;
  prefix?: string;
  suffix?: string;
  label?: string;
  supportingText?: string;
  durationSeconds?: number;
  animation?: EnterAnimationMode;
  alignment?: PuckAlignment;
  accent?: MetricAccent;
  style?: StyleConfig;
  editing?: boolean;
}

/**
 * Animated Counter: a number that counts up once (0 → 10,000). In the builder
 * it shows the final value, still. Visitors see it count once when it scrolls
 * into view (or on load); reduced-motion visitors and screen readers get the
 * final value only. Width is reserved for the widest value so nothing shifts.
 */
export function AnimatedCounterRender({
  id,
  startValue,
  endValue,
  prefix = "",
  suffix = "",
  label = "",
  supportingText = "",
  format = "number",
  decimalPlaces = 0,
  useThousandsSeparator = true,
  currency = "USD",
  durationSeconds = 2,
  animation = "onScroll",
  alignment = "center",
  accent = "default",
  style,
  editing = false,
}: AnimatedCounterProps) {
  const counter = resolveCounter(startValue, endValue);
  const { ref, progress } = useEnterAnimation<HTMLDivElement>({
    enabled: !editing && !!counter,
    mode: animation,
    durationMs: counterDurationMs(durationSeconds),
  });

  if (!counter) {
    return editing ? (
      <BlockShell id={id} style={style}>
        <BlockEmptyState>Set a start and end value</BlockEmptyState>
      </BlockShell>
    ) : null;
  }

  const fmt: MetricFormatConfig = { format, decimalPlaces, useThousandsSeparator, currency };
  const finalText = `${prefix}${formatCounterValue(counter.end, fmt)}${suffix}`;
  const startText = `${prefix}${formatCounterValue(counter.start, fmt)}${suffix}`;
  const liveText =
    progress >= 1
      ? finalText
      : `${prefix}${formatCounterValue(counterValueAt(counter.start, counter.end, progress, decimalPlaces), fmt)}${suffix}`;

  return (
    <BlockShell id={id} style={style}>
      <div ref={ref} className={`flex flex-col gap-1 ${ALIGN[alignment] ?? ALIGN.center}`}>
        {/* Visual number: the start and final values sit invisibly in the same
            grid cell, so the box is as wide as the widest one and nothing jumps. */}
        <p
          aria-hidden="true"
          className={`text-display-md sm:text-display-lg inline-grid font-semibold tracking-tight tabular-nums ${JUSTIFY_ITEMS[alignment] ?? JUSTIFY_ITEMS.center}`}
          style={{ color: accent === "default" ? undefined : accentColor(accent) }}
          data-counter-final={finalText}
        >
          <span className="invisible col-start-1 row-start-1">{finalText}</span>
          <span className="invisible col-start-1 row-start-1">{startText}</span>
          <span className="col-start-1 row-start-1" data-counter-value="">
            {liveText}
          </span>
        </p>
        <p className="sr-only">
          {finalText}
          {label ? ` ${label}` : ""}
        </p>
        {label ? (
          <p aria-hidden="true" className="text-body font-medium">
            {label}
          </p>
        ) : null}
        {supportingText ? <p className="text-muted-foreground text-body-sm">{supportingText}</p> : null}
      </div>
    </BlockShell>
  );
}
