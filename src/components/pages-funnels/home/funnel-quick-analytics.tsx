"use client";

import { useMemo, useState } from "react";
import { BadgePercent, CircleDollarSign, Eye, Percent, RefreshCw, ShoppingBag, ShoppingCart, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DeltaPill, KpiTile } from "@/components/analytics/analytics-kit";
import { funnelDeltas } from "@/components/analytics/analytics-sheets";
import type { AnalyticsLoadState } from "@/components/analytics/use-page-funnel-analytics";
import {
  formatCount,
  formatPercent,
  formatRevenue,
  funnelConversionRate,
  sumFunnelMetrics,
  type FunnelMetrics,
} from "@/lib/analytics/page-funnel-metrics";
import type { PagesLibraryFunnel } from "@/lib/pages-funnels/library";
import type { FunnelAnalyticsResponse, FunnelReport } from "@/types/page-funnel-analytics";

const ALL = "__all__";

/** Combined view of several funnels: conversion only over the funnels that sell. */
function combine(reports: FunnelReport[]): Pick<FunnelReport, "totals" | "previous" | "sells"> & { selling: FunnelMetrics } {
  const selling = reports.filter((r) => r.sells);
  const totals = sumFunnelMetrics(reports.map((r) => r.totals));
  const allPrev = reports.every((r) => r.previous !== null) && reports.length > 0;
  return {
    totals,
    previous: allPrev ? sumFunnelMetrics(reports.map((r) => r.previous!)) : null,
    sells: selling.length > 0,
    selling: sumFunnelMetrics(selling.map((r) => r.totals)),
  };
}

/**
 * Pages & Funnels → Funnels: compact performance overview (Image 1). Light by
 * design — the full report lives in Reports. Last 30 days, business results
 * only (LIVE money; no test/live switch).
 */
export function FunnelPerformanceSummary({
  funnels,
  analytics,
  onOpenQuick,
}: {
  funnels: PagesLibraryFunnel[];
  analytics: { state: AnalyticsLoadState; data: FunnelAnalyticsResponse | null; reload: () => void };
  onOpenQuick: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string>(ALL);
  const reports = useMemo(() => analytics.data?.funnels ?? [], [analytics.data]);
  const current = selected === ALL ? null : (reports.find((r) => r.id === selected) ?? null);
  const view = useMemo(() => {
    if (current) return { ...current, selling: current.totals };
    return combine(reports);
  }, [current, reports]);
  const d = funnelDeltas(view);
  const rate = current ? funnelConversionRate(current.totals, current.sells) : funnelConversionRate({ purchases: view.selling.purchases, entries: view.selling.entries }, view.sells);
  const revenue = formatRevenue(view.totals.revenueByCurrency);
  const loading = analytics.state === "loading" && !analytics.data;
  const items: Record<string, string> = { [ALL]: "All funnels", ...Object.fromEntries(funnels.map((f) => [f.id, f.name])) };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card xl:flex-row xl:items-stretch" aria-label="Funnel performance">
      <div className="flex min-w-0 flex-col gap-1.5 xl:w-60 xl:shrink-0 xl:border-r xl:border-border xl:pr-4">
        <p className="text-caption font-medium text-muted-foreground">Funnel performance</p>
        <Select value={selected} onValueChange={(v) => v && setSelected(v)} items={items}>
          <SelectTrigger aria-label="Funnel" className="w-full font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(items).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-caption text-muted-foreground">Last 30 days</p>
        {current ? (
          <button type="button" onClick={() => onOpenQuick(current.id)} className="w-fit text-caption font-semibold text-link outline-none hover:underline focus-visible:underline">
            Quick performance
          </button>
        ) : null}
      </div>
      {analytics.state === "error" && !analytics.data ? (
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3 rounded-control bg-surface-sunken px-4 py-3">
          <p className="text-body-sm text-muted-foreground">Performance couldn&apos;t be loaded.</p>
          <Button variant="secondary" size="sm" onClick={analytics.reload}>
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : (
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          <KpiTile loading={loading} icon={Users} label="Entries" value={formatCount(view.totals.entries)} delta={<DeltaPill change={d.entries} />} />
          <KpiTile loading={loading} icon={ShoppingCart} tone="aqua" label="Checkout starts" value={view.sells ? formatCount(view.totals.checkoutStarts) : "—"} delta={<DeltaPill change={d.checkoutStarts} />} />
          <KpiTile loading={loading} icon={ShoppingBag} tone="pink" label="Purchases" value={view.sells ? formatCount(view.totals.purchases) : "—"} delta={<DeltaPill change={d.purchases} />} />
          <KpiTile loading={loading} icon={Percent} tone="blue" label="Conversion rate" value={rate === null ? "—" : formatPercent(rate)} delta={<DeltaPill change={current ? d.rate : null} kind="points" />} />
          <KpiTile loading={loading} icon={CircleDollarSign} tone="green" label="Revenue" value={revenue.text} delta={<DeltaPill change={d.revenue} />} className="col-span-2 md:col-span-1" />
        </div>
      )}
    </section>
  );
}

/** One funnel row's compact performance (table cell / phone card line). */
export function FunnelQuickCell({ report, state, onOpen, name, compact }: { report: FunnelReport | null; state: AnalyticsLoadState; onOpen: () => void; name: string; compact?: boolean }) {
  if (!report) {
    if (state === "loading") return <Skeleton className="h-5 w-40" />;
    return <span className="text-caption text-muted-foreground">—</span>;
  }
  const rate = funnelConversionRate(report.totals, report.sells);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Quick performance for ${name}`}
      className={
        compact
          ? "flex w-fit items-center gap-3 rounded-md text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          : "flex items-center gap-3 rounded-md px-1.5 py-1 text-body-sm whitespace-nowrap text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      }
    >
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <Eye className="size-3.5 text-primary" aria-hidden="true" />
        {formatCount(report.totals.entries)} {report.totals.entries === 1 ? "entry" : "entries"}
      </span>
      <span className="h-3.5 w-px bg-border" aria-hidden="true" />
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <BadgePercent className="size-3.5 text-primary" aria-hidden="true" />
        {rate === null ? (report.sells ? "— conv." : "No checkout") : `${formatPercent(rate)} conv.`}
      </span>
    </button>
  );
}
