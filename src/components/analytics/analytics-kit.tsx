"use client";

import { useId, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { serializeCsv, downloadCsv } from "@/lib/csv";
import {
  ANALYTICS_RANGES,
  formatRangeLabel,
  rangeFor,
  type AnalyticsRangeKey,
} from "@/lib/analytics/page-funnel-metrics";

/* ----------------------------------- KPIs ----------------------------------- */

const TONES = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
} as const;
export type KpiTone = keyof typeof TONES;

/**
 * Change vs the previous period. `kind: "points"` = percentage points (for
 * rates). Null = no honest comparison (tracking didn't cover the previous
 * period) → nothing is shown.
 */
export function DeltaPill({ change, kind = "percent", className }: { change: number | null; kind?: "percent" | "points"; className?: string }) {
  if (change === null || !Number.isFinite(change)) return null;
  const flat = Math.abs(change) < (kind === "points" ? 0.0005 : 0.005);
  const up = change > 0;
  const text = kind === "points" ? `${(Math.abs(change) * 100).toFixed(1)} pp` : `${Math.round(Math.abs(change) * 100)}%`;
  const Icon = flat ? ArrowRight : up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-caption font-semibold tabular-nums",
        flat ? "bg-muted text-muted-foreground" : up ? "bg-status-success-bg text-status-success-fg" : "bg-status-danger-bg text-status-danger-fg",
        className,
      )}
      title="Compared with the previous period of the same length"
    >
      <Icon className="size-3" aria-hidden="true" />
      <span className="sr-only">{flat ? "No change" : up ? "Up" : "Down"} </span>
      {flat ? "0%" : `${up ? "+" : "−"}${text}`}
    </span>
  );
}

export function KpiTile({
  icon: Icon,
  label,
  value,
  delta,
  hint,
  tone = "violet",
  loading,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  hint?: ReactNode;
  tone?: KpiTone;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-card border border-border bg-card p-3.5 shadow-card", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="truncate text-caption font-medium text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-title-md font-semibold tracking-tight text-foreground tabular-nums">{value}</span>
          {delta}
        </div>
      )}
      {hint ? <p className="truncate text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------- Range ----------------------------------- */

export function RangeSelect({ value, onChange, className }: { value: AnalyticsRangeKey; onChange: (v: AnalyticsRangeKey) => void; className?: string }) {
  const items = Object.fromEntries(
    ANALYTICS_RANGES.map((r) => {
      const range = rangeFor(r.id);
      return [r.id, `${r.label} (${formatRangeLabel(range.from, range.to)})`];
    }),
  );
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as AnalyticsRangeKey)} items={items}>
      <SelectTrigger aria-label="Date range" className={cn("w-full sm:w-auto sm:min-w-64", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ANALYTICS_RANGES.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {items[r.id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ---------------------------------- Charts ---------------------------------- */

export interface TrendSeries {
  label: string;
  /** A CSS color (design-system variable). */
  color: string;
  values: number[];
  /** Fill the area under this series. */
  area?: boolean;
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** Multi-series line chart (responsive SVG, no chart library). */
export function TrendChart({ series, labels, height = 220, ariaLabel }: { series: TrendSeries[]; labels: string[]; height?: number; ariaLabel: string }) {
  const id = useId().replace(/:/g, "");
  const w = 640;
  const h = height;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const count = labels.length;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => padL + (count > 1 ? (i * (w - padL - padR)) / (count - 1) : (w - padL - padR) / 2);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const labelEvery = Math.max(1, Math.ceil(count / 7));
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`${id}-fill-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="10">
              {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : t}
            </text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          if (!pts.length) return null;
          return (
            <g key={si}>
              {s.area ? <path d={`M ${x(0)},${y(0)} L ${pts.join(" L ")} L ${x(s.values.length - 1)},${y(0)} Z`} fill={`url(#${id}-fill-${si})`} /> : null}
              <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {labels.map((l, i) =>
          i % labelEvery === 0 || i === count - 1 ? (
            <text key={i} x={x(i)} y={h - 8} textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"} className="fill-muted-foreground" fontSize="10">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      {series.length > 1 ? (
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          {series.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Stage-to-stage progression (drop-off). Rates are each stage ÷ the previous one. */
export function ProgressionChart({ stages }: { stages: { label: string; value: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ol className="flex items-end gap-1.5 sm:gap-3" aria-label="Funnel progression">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const rate = prev !== null && prev > 0 ? s.value / prev : null;
        return (
          <li key={s.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className={cn("rounded-full px-1.5 text-caption font-semibold tabular-nums", rate === null ? "invisible" : "bg-tag-violet-bg text-tag-violet-fg")}>
              {rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}
            </span>
            <div className="flex h-36 w-full items-end">
              <div
                className="w-full rounded-t-md"
                style={{ height: `${Math.max(3, (s.value / max) * 100)}%`, backgroundColor: "var(--ds-chart-1)", opacity: 1 - i * 0.22 }}
                aria-hidden="true"
              />
            </div>
            <span className="text-body-sm font-semibold tabular-nums">{s.value.toLocaleString("en-US")}</span>
            <span className="text-center text-caption leading-tight text-muted-foreground">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------------- CSV ------------------------------------ */

/** CSV export (spreadsheet-safe: a cell starting with = + - @ can't run as a formula). */
export function exportAnalyticsCsv(filename: string, headers: string[], rows: Record<string, unknown>[]) {
  const safe = rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v])),
  );
  downloadCsv(filename, serializeCsv(headers, safe));
}

export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Weekly buckets of a daily series (sums), labelled by the week's first day. */
export function bucketWeekly<T extends { day: string }>(daily: T[], sum: (items: T[]) => Omit<T, "day">): Array<Omit<T, "day"> & { day: string }> {
  const out: Array<Omit<T, "day"> & { day: string }> = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    out.push({ ...sum(chunk), day: chunk[0].day });
  }
  return out;
}
