"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StyleConfig } from "@/types/pages-funnels-puck";
import type { MetricFormatConfig } from "@/lib/pages-funnels/data-metrics/model";
import {
  CHART_HEIGHT_PX,
  chartColor,
  chartSummary,
  fitLabel,
  formatChartValue,
  isChartType,
  isPartToWhole,
  labelStride,
  niceScale,
  normalizeChartRows,
  pieSlices,
  tickDecimals,
  type ChartDatum,
  type ChartHeight,
  type ChartSort,
  type ChartType,
} from "@/lib/pages-funnels/data-metrics/chart";
import {
  normalizeChartColors,
  resolveChartColors,
  type ChartColorsSetting,
} from "@/lib/pages-funnels/data-metrics/chart-colors";
import { BlockEmptyState, BlockShell } from "./block-shell";

export interface ChartRowProp {
  label?: string;
  value?: number | string;
  /** Custom color for this row (used only in Custom mode). */
  color?: string;
}

export type ChartTitleSize = "small" | "medium" | "large";
const TITLE_SIZE_CLASS: Record<ChartTitleSize, string> = {
  small: "text-body-sm",
  medium: "text-section",
  large: "text-title-md",
};

export interface ChartProps extends MetricFormatConfig {
  id: string;
  chartType?: ChartType;
  title?: string;
  description?: string;
  rows?: ChartRowProp[];
  sort?: ChartSort;
  showValues?: boolean;
  showLegend?: boolean;
  donutCenter?: "total" | "custom" | "none";
  centerText?: string;
  centerLabel?: string;
  height?: ChartHeight;
  /** Colors setting: Magnetix palette, Brand colors, One color, Shades or Custom. */
  colors?: ChartColorsSetting;
  /** The workspace's saved Brand colors (hex, in order) — passed in live, never stored on the chart. */
  brandColors?: string[];
  titleSize?: ChartTitleSize;
  style?: StyleConfig;
  editing?: boolean;
}

/** Renders at the container's real pixel width so text stays 12px on phones. */
function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) >= 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const FONT = 12;
const GRID = "color-mix(in srgb, currentColor 14%, transparent)";

/**
 * Chart: one block, six types (Bar, Horizontal bar, Line, Area, Pie, Donut),
 * manual Label | Value rows only. Plain SVG; no chart library. Every chart has
 * a visible title/description, a plain-language summary and a screen-reader
 * data table, so nothing is conveyed by the picture alone.
 */
export function ChartRender({
  id,
  chartType = "bar",
  title = "",
  description = "",
  rows = [],
  sort = "original",
  showValues = true,
  showLegend = true,
  donutCenter = "total",
  centerText = "",
  centerLabel = "",
  height = "medium",
  colors,
  brandColors,
  titleSize = "medium",
  format = "number",
  decimalPlaces = 0,
  useThousandsSeparator = true,
  currency = "USD",
  style,
  editing = false,
}: ChartProps) {
  const type: ChartType = isChartType(chartType) ? chartType : "bar";
  const { ref, width } = useMeasuredWidth(640);
  const baseId = useId();
  const fmt: MetricFormatConfig = { format, decimalPlaces, useThousandsSeparator, currency };
  const { data, missingValues, negativeExcluded } = normalizeChartRows(rows, type, sort);
  const pie = isPartToWhole(type) ? pieSlices(data) : null;
  const empty = data.length === 0 || (isPartToWhole(type) && !pie);
  const rowList = Array.isArray(rows) ? rows : [];
  const resolved = resolveChartColors({
    type,
    setting: normalizeChartColors(colors),
    data: data.map((d) => ({ index: d.index, color: rowList[d.index]?.color })),
    rowCount: rowList.length,
    brandColors,
  });
  const fills = resolved.colors;

  const notes: string[] = [];
  if (editing && missingValues > 0)
    notes.push(`${missingValues} ${missingValues === 1 ? "row has" : "rows have"} no number and ${missingValues === 1 ? "isn't" : "aren't"} shown.`);
  if (editing && resolved.brandMissing)
    notes.push("No brand colors saved yet, so the Magnetix palette is shown. Add brand colors in Settings → Branding.");
  if (editing && negativeExcluded > 0)
    notes.push(`${negativeExcluded} negative ${negativeExcluded === 1 ? "value is" : "values are"} left out: a ${type === "pie" ? "pie" : "donut"} shows parts of a whole.`);

  if (empty) {
    return editing ? (
      <BlockShell id={id} style={style}>
        <BlockEmptyState>
          <span>Add data to this chart</span>
          <span className="text-caption">
            {isPartToWhole(type) && data.length > 0
              ? "Add at least one value above zero."
              : "Add rows with a label and a number in the block settings."}
          </span>
          {notes.map((n) => (
            <span key={n} className="text-caption">
              {n}
            </span>
          ))}
        </BlockEmptyState>
      </BlockShell>
    ) : null;
  }

  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;
  const summaryId = `${baseId}-summary`;
  const summary = chartSummary(type, data, fmt);

  return (
    <BlockShell id={id} style={style}>
      <figure
        className="m-0 flex flex-col gap-4"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={[description ? descId : "", summaryId].filter(Boolean).join(" ")}
        data-chart-type={type}
      >
        {title || description ? (
          <figcaption className="flex flex-col gap-1">
            {title ? (
              <p
                id={titleId}
                className={TITLE_SIZE_CLASS[titleSize] ?? TITLE_SIZE_CLASS.medium}
                style={{ fontWeight: style?.typography?.fontWeight ?? 600 }}
              >
                {title}
              </p>
            ) : null}
            {description ? (
              <p id={descId} className="text-muted-foreground text-body-sm">
                {description}
              </p>
            ) : null}
          </figcaption>
        ) : null}
        <div ref={ref} className="text-muted-foreground w-full min-w-0">
          {type === "pie" || type === "donut" ? (
            <PartToWhole
              type={type}
              pie={pie!}
              fills={fills}
              labelColor={style?.typography?.color || undefined}
              width={width}
              fmt={fmt}
              showLegend={showLegend}
              donutCenter={donutCenter}
              centerText={centerText}
              centerLabel={centerLabel}
              summaryId={summaryId}
            />
          ) : type === "horizontalBar" ? (
            <HorizontalBars data={data} fills={fills} width={width} fmt={fmt} showValues={showValues} summaryId={summaryId} />
          ) : (
            <Cartesian
              type={type}
              data={data}
              fills={fills}
              width={width}
              height={CHART_HEIGHT_PX[height] ?? CHART_HEIGHT_PX.medium}
              fmt={fmt}
              showValues={showValues}
              summaryId={summaryId}
            />
          )}
        </div>
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
        <DataTable title={title} data={data} fmt={fmt} total={pie?.total ?? null} />
        {notes.map((n) => (
          <p key={n} className="text-muted-foreground text-caption">
            {n}
          </p>
        ))}
      </figure>
    </BlockShell>
  );
}

function DataTable({
  title,
  data,
  fmt,
  total,
}: {
  title: string;
  data: ChartDatum[];
  fmt: MetricFormatConfig;
  total: number | null;
}) {
  return (
    <table className="sr-only">
      <caption>{title ? `${title}: data` : "Chart data"}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">Value</th>
          {total ? <th scope="col">Share</th> : null}
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={`${d.index}-${d.label}`}>
            <th scope="row">{d.label}</th>
            <td>{formatChartValue(d.value, fmt)}</td>
            {total ? <td>{Math.round((Math.max(0, d.value) / total) * 100)}%</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function tickText(v: number, step: number, fmt: MetricFormatConfig) {
  const d = tickDecimals(step);
  return formatChartValue(v, { ...fmt, decimalPlaces: Math.max(d, 0) });
}

/** Bar, Line and Area: a value axis on the left, categories along the bottom. */
function Cartesian({
  type,
  data,
  fills,
  width,
  height,
  fmt,
  showValues,
  summaryId,
}: {
  type: ChartType;
  data: ChartDatum[];
  fills: string[];
  width: number;
  height: number;
  fmt: MetricFormatConfig;
  showValues: boolean;
  summaryId: string;
}) {
  const W = Math.max(200, width);
  const H = height;
  const values = data.map((d) => d.value);
  const scale = niceScale(Math.min(...values), Math.max(...values));
  const tickLabels = scale.ticks.map((t) => tickText(t, scale.step, fmt));
  const axisW = Math.min(W * 0.3, Math.max(...tickLabels.map((t) => t.length)) * 7 + 10);
  const left = axisW;
  const right = W - 8;
  const top = showValues ? 22 : 10;
  const bottom = H - 28;
  const plotW = Math.max(1, right - left);
  const y = (v: number) => bottom - ((v - scale.min) / (scale.max - scale.min)) * (bottom - top);
  const zeroY = y(0);
  const n = data.length;
  const slot = plotW / n;
  const isBar = type === "bar";
  const xAt = (i: number) =>
    isBar ? left + slot * i + slot / 2 : n === 1 ? left + plotW / 2 : left + 12 + ((plotW - 24) / (n - 1)) * i;
  const stride = labelStride(n, plotW, 64);
  const labelWidth = isBar ? slot * stride - 6 : (plotW / Math.max(1, n - 1)) * stride - 6;
  const lineColor = fills[0] ?? chartColor(0);
  const points = data.map((d, i) => [xAt(i), y(d.value)] as const);
  const valueEvery = labelStride(n, plotW, 44);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: H, display: "block" }}
      role="img"
      aria-labelledby={summaryId}
      fontSize={FONT}
    >
      {scale.ticks.map((t, i) => (
        <g key={t}>
          <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={t === 0 ? 1.25 : 1} />
          <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end" fill="currentColor">
            {tickLabels[i]}
          </text>
        </g>
      ))}
      {isBar
        ? data.map((d, i) => {
            const barW = Math.min(56, slot * 0.62);
            const x = xAt(i) - barW / 2;
            const yv = y(d.value);
            const yTop = Math.min(yv, zeroY);
            const h = Math.max(1, Math.abs(zeroY - yv));
            return (
              <g key={`${d.index}-${d.label}`}>
                <rect x={x} y={yTop} width={barW} height={h} rx={Math.min(5, barW / 4)} fill={fills[i] ?? chartColor(d.index)}>
                  <title>{`${d.label}: ${formatChartValue(d.value, fmt)}`}</title>
                </rect>
                {showValues && i % valueEvery === 0 ? (
                  <text
                    x={xAt(i)}
                    y={d.value >= 0 ? yTop - 6 : yTop + h + 14}
                    textAnchor="middle"
                    fill="var(--foreground, currentColor)"
                    fontWeight={600}
                  >
                    {formatChartValue(d.value, fmt)}
                  </text>
                ) : null}
              </g>
            );
          })
        : (
            <g>
              {type === "area" && points.length > 1 ? (
                <path
                  d={`M ${points[0][0]},${zeroY} ${points.map(([px, py]) => `L ${px},${py}`).join(" ")} L ${points[points.length - 1][0]},${zeroY} Z`}
                  fill={`color-mix(in srgb, ${lineColor} 18%, transparent)`}
                />
              ) : null}
              {points.length > 1 ? (
                <polyline
                  points={points.map(([px, py]) => `${px},${py}`).join(" ")}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {points.map(([px, py], i) => (
                <g key={`${data[i].index}-${data[i].label}`}>
                  <circle cx={px} cy={py} r={4} fill="var(--background)" stroke={lineColor} strokeWidth={2}>
                    <title>{`${data[i].label}: ${formatChartValue(data[i].value, fmt)}`}</title>
                  </circle>
                  {showValues && i % valueEvery === 0 ? (
                    <text x={px} y={py - 10} textAnchor="middle" fill="var(--foreground, currentColor)" fontWeight={600}>
                      {formatChartValue(data[i].value, fmt)}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          )}
      {data.map((d, i) =>
        i % stride === 0 ? (
          <text key={`x-${d.index}-${d.label}`} x={xAt(i)} y={H - 8} textAnchor="middle" fill="currentColor">
            {fitLabel(d.label, labelWidth)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Horizontal bar: labels on the left, so long category names stay readable. */
function HorizontalBars({
  data,
  fills,
  width,
  fmt,
  showValues,
  summaryId,
}: {
  data: ChartDatum[];
  fills: string[];
  width: number;
  fmt: MetricFormatConfig;
  showValues: boolean;
  summaryId: string;
}) {
  const W = Math.max(200, width);
  const rowH = 36;
  const H = data.length * rowH + 8;
  const values = data.map((d) => d.value);
  const scale = niceScale(Math.min(...values), Math.max(...values));
  const labelW = Math.min(W * 0.38, Math.max(...data.map((d) => d.label.length)) * 6.8 + 12);
  const valueTexts = data.map((d) => formatChartValue(d.value, fmt));
  const valueW = showValues ? Math.max(...valueTexts.map((t) => t.length)) * 7.2 + 12 : 8;
  const left = labelW;
  const right = W - valueW;
  const x = (v: number) => left + ((v - scale.min) / (scale.max - scale.min)) * Math.max(1, right - left);
  const zeroX = x(0);
  const barH = rowH * 0.56;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: H, display: "block" }}
      role="img"
      aria-labelledby={summaryId}
      fontSize={FONT}
    >
      <line x1={zeroX} x2={zeroX} y1={2} y2={H - 4} stroke={GRID} strokeWidth={1.25} />
      {data.map((d, i) => {
        const cy = i * rowH + rowH / 2 + 4;
        const xv = x(d.value);
        const x0 = Math.min(xv, zeroX);
        const w = Math.max(1, Math.abs(xv - zeroX));
        return (
          <g key={`${d.index}-${d.label}`}>
            <text x={left - 10} y={cy} dy="0.35em" textAnchor="end" fill="currentColor">
              {fitLabel(d.label, labelW - 14)}
            </text>
            <rect x={x0} y={cy - barH / 2} width={w} height={barH} rx={Math.min(5, barH / 3)} fill={fills[i] ?? chartColor(d.index)}>
              <title>{`${d.label}: ${valueTexts[i]}`}</title>
            </rect>
            {showValues ? (
              <text
                x={d.value >= 0 ? x0 + w + 8 : x0 - 8}
                y={cy}
                dy="0.35em"
                textAnchor={d.value >= 0 ? "start" : "end"}
                fill="var(--foreground, currentColor)"
                fontWeight={600}
              >
                {valueTexts[i]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Pie and Donut, with an HTML legend (wraps cleanly at any width). */
function PartToWhole({
  type,
  pie,
  fills,
  labelColor,
  width,
  fmt,
  showLegend,
  donutCenter,
  centerText,
  centerLabel,
  summaryId,
}: {
  type: "pie" | "donut";
  pie: NonNullable<ReturnType<typeof pieSlices>>;
  fills: string[];
  /** Styles → Typography color, applied to legend labels. */
  labelColor?: string;
  width: number;
  fmt: MetricFormatConfig;
  showLegend: boolean;
  donutCenter: "total" | "custom" | "none";
  centerText: string;
  centerLabel: string;
  summaryId: string;
}) {
  const sideBySide = showLegend && width >= 480;
  const size = Math.max(140, Math.min(sideBySide ? 260 : 240, width));
  const V = 200;
  const R = V / 2 - 2;
  const donut = type === "donut";
  const stroke = donut ? R * 0.34 : R;
  const r = donut ? R - stroke / 2 : R / 2;
  const C = 2 * Math.PI * r;
  const visibleSlices = pie.slices.filter((s) => s.fraction > 0).length;
  const center =
    donut && donutCenter !== "none"
      ? donutCenter === "custom"
        ? centerText.trim()
        : formatChartValue(pie.total, fmt)
      : "";
  return (
    <div className={sideBySide ? "flex items-center gap-8" : "flex flex-col items-center gap-5"}>
      <div className="relative shrink-0" style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1" }}>
        <svg
          viewBox={`0 0 ${V} ${V}`}
          className="block h-full w-full -rotate-90"
          role="img"
          aria-labelledby={summaryId}
        >
          {pie.slices.map((s, i) =>
            s.fraction > 0 ? (
              <circle
                key={`${s.datum.index}-${s.datum.label}`}
                cx={V / 2}
                cy={V / 2}
                r={r}
                fill="none"
                stroke={fills[i] ?? chartColor(s.datum.index)}
                strokeWidth={stroke}
                strokeDasharray={`${s.fraction * C} ${C}`}
                strokeDashoffset={-s.start * C}
              >
                <title>{`${s.datum.label}: ${formatChartValue(s.datum.value, fmt)} (${Math.round(s.fraction * 100)}%)`}</title>
              </circle>
            ) : null,
          )}
          {/* Thin white dividers between slices, so neighbors stay distinct
              even when their colors are close. */}
          {visibleSlices > 1
            ? pie.slices
                .filter((s) => s.fraction > 0)
                .map((s) => {
                  const a = s.start * 2 * Math.PI;
                  const rin = donut ? R - stroke : 0;
                  return (
                    <line
                      key={`gap-${s.datum.index}-${s.datum.label}`}
                      x1={V / 2 + rin * Math.cos(a)}
                      y1={V / 2 + rin * Math.sin(a)}
                      x2={V / 2 + (R + 1) * Math.cos(a)}
                      y2={V / 2 + (R + 1) * Math.sin(a)}
                      stroke="white"
                      strokeWidth={2}
                      data-slice-gap=""
                    />
                  );
                })
            : null}
        </svg>
        {center || (donut && centerLabel && donutCenter !== "none") ? (
          <div
            aria-hidden="true"
            className="text-foreground absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
          >
            {center ? <span className="text-title-lg font-semibold tabular-nums">{center}</span> : null}
            {centerLabel && donutCenter !== "none" ? (
              <span className="text-muted-foreground text-caption">{centerLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      {showLegend ? (
        <ul aria-hidden="true" className="text-body-sm m-0 flex w-full min-w-0 list-none flex-col gap-2 p-0" style={{ maxWidth: 360 }}>
          {pie.slices.map((s, i) => (
            <li key={`${s.datum.index}-${s.datum.label}`} className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: fills[i] ?? chartColor(s.datum.index) }} />
              <span className="text-foreground min-w-0 flex-1 truncate" style={labelColor ? { color: labelColor } : undefined}>
                {s.datum.label}
              </span>
              <span className="tabular-nums">{formatChartValue(s.datum.value, fmt)}</span>
              <span className="w-10 text-right tabular-nums">{Math.round(s.fraction * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
