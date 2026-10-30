import type { MetricFormatConfig } from "./model";
import { formatMetricValue } from "./formatting";
import { clampDecimalPlaces, toFiniteNumber } from "./validation";

/** Animated Counter maths (pure). The end value is required; start defaults to 0. */
export function resolveCounter(start: unknown, end: unknown): { start: number; end: number } | null {
  const e = toFiniteNumber(end);
  if (e == null) return null;
  return { start: toFiniteNumber(start) ?? 0, end: e };
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Value at animation progress t (already eased), rounded to the display
 * precision so intermediate frames never show more decimals than the final. */
export function counterValueAt(start: number, end: number, t: number, decimalPlaces?: number): number {
  if (t >= 1) return end;
  if (t <= 0) return start;
  const d = clampDecimalPlaces(decimalPlaces);
  const factor = 10 ** d;
  return Math.round((start + (end - start) * t) * factor) / factor;
}

export type CounterFormat = Exclude<NonNullable<MetricFormatConfig["format"]>, "text">;

export function formatCounterValue(value: number, config: MetricFormatConfig): string {
  const format = config.format && config.format !== "text" ? config.format : "number";
  return formatMetricValue(value, { ...config, format });
}

/** Clamp the customer's duration (seconds) to a sensible range, in ms. */
export function counterDurationMs(seconds: unknown): number {
  const s = toFiniteNumber(seconds);
  if (s == null) return 2000;
  return Math.round(Math.min(10, Math.max(0.5, s)) * 1000);
}
