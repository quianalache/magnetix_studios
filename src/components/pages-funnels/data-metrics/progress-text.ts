import type { MetricFormatConfig } from "@/lib/pages-funnels/data-metrics/model";
import { formatChartValue } from "@/lib/pages-funnels/data-metrics/chart";
import { formatPercent, type ProgressState } from "@/lib/pages-funnels/data-metrics/progress";

export type ProgressValueDisplay = "of" | "remaining" | "none";

/** "750 of 1,000" / "250 to go" (the readable value line for progress blocks). */
export function progressValueText(state: ProgressState, display: ProgressValueDisplay, fmt: MetricFormatConfig): string | null {
  if (display === "none") return null;
  if (display === "remaining") {
    const left = state.target - state.current;
    return left > 0 ? `${formatChartValue(left, fmt)} to go` : "Goal reached";
  }
  return `${formatChartValue(state.current, fmt)} of ${formatChartValue(state.target, fmt)}`;
}

/** Full spoken value: "750 of 1,000 (75%)". */
export function progressAriaText(state: ProgressState, fmt: MetricFormatConfig): string {
  return `${formatChartValue(state.current, fmt)} of ${formatChartValue(state.target, fmt)} (${formatPercent(state.percent)})`;
}
