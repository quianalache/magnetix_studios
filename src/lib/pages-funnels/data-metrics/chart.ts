import type { MetricFormatConfig } from "./model";
import { formatMetricValue } from "./formatting";
import { toFiniteNumber } from "./validation";

/**
 * Chart model for the Chart block (pure — no React, no chart library).
 * Manual data only: one series of Label | Value rows that the customer types.
 * The renderers in components/pages-funnels/data-metrics/chart.tsx draw plain
 * SVG from what this module computes.
 */
export type ChartType = "bar" | "horizontalBar" | "line" | "area" | "pie" | "donut";
export type ChartSort = "original" | "desc" | "asc";

export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Bar — compare categories" },
  { value: "horizontalBar", label: "Horizontal bar — compare categories with longer labels" },
  { value: "line", label: "Line — show change over time" },
  { value: "area", label: "Area — show a trend and its volume" },
  { value: "pie", label: "Pie — show parts of a whole" },
  { value: "donut", label: "Donut — parts of a whole, with a center value" },
];

export const CHART_TYPE_NAME: Record<ChartType, string> = {
  bar: "Bar chart",
  horizontalBar: "Horizontal bar chart",
  line: "Line chart",
  area: "Area chart",
  pie: "Pie chart",
  donut: "Donut chart",
};

export function isChartType(value: unknown): value is ChartType {
  return typeof value === "string" && value in CHART_TYPE_NAME;
}

/** Pie and Donut show parts of a whole. */
export function isPartToWhole(type: ChartType): boolean {
  return type === "pie" || type === "donut";
}

/** Line and Area show change in order, so they're never re-sorted. */
export function isSequential(type: ChartType): boolean {
  return type === "line" || type === "area";
}

export interface ChartRowInput {
  label?: unknown;
  value?: unknown;
}

export interface ChartDatum {
  label: string;
  value: number;
  /** Position in the customer's list — keeps colours stable across sorting. */
  index: number;
}

export interface NormalizedChart {
  data: ChartDatum[];
  /** Rows with a label but no usable number. */
  missingValues: number;
  /** Pie/Donut rows below zero (a part of a whole can't be negative). */
  negativeExcluded: number;
}

export const CHART_MAX_ROWS = 24;
export const CHART_LABEL_MAX = 60;

export function normalizeChartRows(rows: unknown, type: ChartType, sort: ChartSort = "original"): NormalizedChart {
  const list = Array.isArray(rows) ? (rows as ChartRowInput[]) : [];
  const data: ChartDatum[] = [];
  let missingValues = 0;
  let negativeExcluded = 0;
  list.slice(0, CHART_MAX_ROWS).forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, CHART_LABEL_MAX) : "";
    const value = toFiniteNumber(row.value);
    if (!label && value == null) return; // an untouched new row
    if (value == null) {
      missingValues++;
      return;
    }
    if (isPartToWhole(type) && value < 0) {
      negativeExcluded++;
      return;
    }
    data.push({ label: label || `Item ${index + 1}`, value, index });
  });
  if (!isSequential(type) && sort !== "original") {
    data.sort((a, b) => (sort === "desc" ? b.value - a.value : a.value - b.value) || a.index - b.index);
  }
  return { data, missingValues, negativeExcluded };
}

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** A "nice" axis (1, 2, 2.5, 5 × 10ⁿ steps) that always includes zero. */
export function niceScale(dataMin: number, dataMax: number, targetTicks = 4): NiceScale {
  let lo = Math.min(0, Number.isFinite(dataMin) ? dataMin : 0);
  let hi = Math.max(0, Number.isFinite(dataMax) ? dataMax : 0);
  if (lo === hi) hi = lo + 1;
  const rough = (hi - lo) / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = nice * magnitude;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { min: lo, max: hi, step, ticks };
}

/** Decimal places needed so axis ticks never round to duplicates. */
export function tickDecimals(step: number): number {
  if (!(step > 0)) return 0;
  for (let d = 0; d <= 6; d++) {
    const scaled = step * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d;
  }
  return 6;
}

export interface PieSlice {
  datum: ChartDatum;
  fraction: number;
  /** Start position as a fraction of the full circle (0 = 12 o'clock). */
  start: number;
}

/** Slices for Pie/Donut. Zero-value rows stay in the legend but draw nothing. */
export function pieSlices(data: ChartDatum[]): { total: number; slices: PieSlice[] } | null {
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  if (!(total > 0)) return null;
  let acc = 0;
  const slices = data.map((datum) => {
    const fraction = Math.max(0, datum.value) / total;
    const slice = { datum, fraction, start: acc };
    acc += fraction;
    return slice;
  });
  return { total, slices };
}

export function formatChartValue(value: number, config: MetricFormatConfig): string {
  const format = config.format && config.format !== "text" ? config.format : "number";
  return formatMetricValue(value, { ...config, format });
}

/** Plain-language summary for screen readers (the visual is aria-described by it). */
export function chartSummary(type: ChartType, data: ChartDatum[], config: MetricFormatConfig): string {
  if (data.length === 0) return `${CHART_TYPE_NAME[type]} with no data.`;
  const fmt = (v: number) => formatChartValue(v, config);
  const count = `${data.length} ${data.length === 1 ? "item" : "items"}`;
  if (isPartToWhole(type)) {
    const pie = pieSlices(data);
    if (!pie) return `${CHART_TYPE_NAME[type]} with ${count}, all zero.`;
    const largest = [...pie.slices].sort((a, b) => b.fraction - a.fraction)[0];
    return `${CHART_TYPE_NAME[type]} with ${count}, totalling ${fmt(pie.total)}. Largest: ${largest.datum.label}, ${fmt(largest.datum.value)} (${Math.round(largest.fraction * 100)}%).`;
  }
  if (isSequential(type)) {
    const first = data[0];
    const last = data[data.length - 1];
    return `${CHART_TYPE_NAME[type]} with ${count}, from ${first.label} (${fmt(first.value)}) to ${last.label} (${fmt(last.value)}).`;
  }
  const byValue = [...data].sort((a, b) => b.value - a.value);
  const top = byValue[0];
  const bottom = byValue[byValue.length - 1];
  return data.length === 1
    ? `${CHART_TYPE_NAME[type]} with 1 item: ${top.label}, ${fmt(top.value)}.`
    : `${CHART_TYPE_NAME[type]} with ${count}. Highest: ${top.label}, ${fmt(top.value)}. Lowest: ${bottom.label}, ${fmt(bottom.value)}.`;
}

/** Show every nth category label so labels never overlap at narrow widths. */
export function labelStride(count: number, availableWidth: number, minLabelWidth = 56): number {
  if (count <= 1) return 1;
  const fits = Math.max(1, Math.floor(availableWidth / minLabelWidth));
  return Math.max(1, Math.ceil(count / fits));
}

/** Trim a label to roughly fit a width (average glyph ≈ 6.5px at 12px). */
export function fitLabel(label: string, width: number, glyph = 6.5): string {
  const max = Math.max(3, Math.floor(width / glyph));
  return label.length <= max ? label : `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Series colours: the Magnetix chart palette, plum first (tokens live on :root). */
export const CHART_PALETTE = [
  "var(--color-plum-700)",
  "var(--ds-chart-3)",
  "var(--color-plum-300)",
  "var(--ds-chart-2)",
  "var(--ds-chart-5)",
  "var(--ds-chart-4)",
  "var(--ds-chart-6)",
  "var(--ds-chart-8)",
] as const;

export function chartColor(index: number): string {
  return CHART_PALETTE[((index % CHART_PALETTE.length) + CHART_PALETTE.length) % CHART_PALETTE.length];
}

export type ChartHeight = "small" | "medium" | "large";
export const CHART_HEIGHT_PX: Record<ChartHeight, number> = { small: 220, medium: 300, large: 380 };
