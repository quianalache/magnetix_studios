"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgePercent,
  ChevronDown,
  CircleDollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  SquareArrowOutUpRight,
  Tag as TagIcon,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/system/empty-state";
import { SearchField } from "@/components/system/search-field";
import { DATA_TABLE_HEAD_ROW, DATA_TABLE_ROW, DATA_TABLE_TD, DATA_TABLE_TH, DataTableShell } from "@/components/system/data-table";
import { useSubAccount } from "@/context/sub-account-context";
import { buildPublishedPageUrl } from "@/lib/domains/public-url";
import { cn } from "@/lib/utils";
import {
  bucketWeekly,
  DeltaPill,
  exportAnalyticsCsv,
  KpiTile,
  ProgressionChart,
  RangeSelect,
  shortDay,
  TrendChart,
} from "@/components/analytics/analytics-kit";
import { FunnelAnalyticsSheet, PageAnalyticsSheet, TrackingNote } from "@/components/analytics/analytics-sheets";
import { usePageFunnelAnalytics } from "@/components/analytics/use-page-funnel-analytics";
import {
  addFunnelMetrics,
  addPageMetrics,
  comparable,
  EMPTY_FUNNEL_METRICS,
  EMPTY_PAGE_METRICS,
  formatCount,
  formatPercent,
  formatRevenue,
  funnelConversionRate,
  isAnalyticsRangeKey,
  pageConversionRate,
  pageConversions,
  percentChange,
  sumFunnelMetrics,
  sumPageMetrics,
  type AnalyticsRange,
  type AnalyticsRangeKey,
  type FunnelMetrics,
  type PageMetrics,
} from "@/lib/analytics/page-funnel-metrics";
import { PAGE_TYPE_LABELS, type PageType } from "@/types/pages-funnels";
import type { FunnelReport, PageReport } from "@/types/page-funnel-analytics";

type ReportType = "funnels" | "pages";
type Granularity = "daily" | "weekly";

/**
 * Reports → Page & Funnel Analytics (Image 2): the detailed report. Same
 * server report + metric definitions as the light analytics in Pages &
 * Funnels, so numbers always reconcile. State lives in the URL
 * (?tab=analytics&type=funnels|pages&range=30d&funnel=…|page=…) so the
 * "View detailed analytics" deep links open the right selection.
 */
export function PageFunnelAnalytics() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { subAccountId } = useSubAccount();

  const type: ReportType = params.get("type") === "pages" ? "pages" : "funnels";
  const rangeParam = params.get("range");
  const range: AnalyticsRangeKey = isAnalyticsRangeKey(rangeParam) ? rangeParam : "30d";
  const detailId = params.get(type === "funnels" ? "funnel" : "page");

  const setParams = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    q.set("tab", "analytics");
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.replace(`${pathname}?${q}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          value={type}
          onChange={(v) => setParams({ type: v, funnel: null, page: null })}
          options={[
            { value: "funnels", label: "Funnel performance" },
            { value: "pages", label: "Page performance" },
          ]}
        />
        <p className="text-caption text-muted-foreground">Business results: LIVE payments and real visitor traffic. Days are UTC.</p>
      </div>
      {type === "funnels" ? (
        <FunnelReportView
          key={`f-${range}`}
          subAccountId={subAccountId}
          range={range}
          onRange={(r) => setParams({ range: r })}
          detailId={detailId}
          onDetail={(id) => setParams({ funnel: id })}
        />
      ) : (
        <PageReportView
          key={`p-${range}`}
          subAccountId={subAccountId}
          range={range}
          onRange={(r) => setParams({ range: r })}
          detailId={detailId}
          onDetail={(id) => setParams({ page: id })}
        />
      )}
    </div>
  );
}

/* ---------------------------------- Shared ---------------------------------- */

function EntityFilter({ noun, options, value, onChange }: { noun: string; options: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const visible = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const all = value.length === 0;
  const label = all ? `All ${noun}s` : value.length === 1 ? (options.find((o) => o.id === value[0])?.name ?? `1 ${noun}`) : `${value.length} ${noun}s`;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="secondary" className="w-full justify-between sm:w-auto sm:min-w-48" aria-label={`Filter ${noun}s`}>
            <span className="flex min-w-0 items-center gap-2">
              {noun === "funnel" ? <Filter aria-hidden="true" /> : <FileText aria-hidden="true" />}
              <span className="truncate">{label}</span>
            </span>
            <ChevronDown className="opacity-70" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 p-2">
        <SearchField value={q} onChange={setQ} placeholder={`Search ${noun}s…`} aria-label={`Search ${noun}s`} />
        <div className="mt-2 max-h-64 overflow-y-auto">
          <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-body-sm", all && "bg-accent font-semibold")}>
            <Checkbox checked={all} onCheckedChange={() => onChange([])} />
            All {noun}s
          </label>
          {visible.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-body-sm hover:bg-muted">
              <Checkbox checked={value.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
              <span className="min-w-0 truncate">{o.name}</span>
            </label>
          ))}
          {visible.length === 0 ? <p className="px-2 py-3 text-caption text-muted-foreground">No {noun}s match.</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExportMenu({ onCsv, disabled }: { onCsv: () => void; disabled: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="secondary" disabled={disabled} className="w-full sm:w-auto" />}>
        <Download aria-hidden="true" /> Export <ChevronDown className="opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onCsv}>
          <FileText aria-hidden="true" /> Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortHeader<K extends string>({ label, k, sort, onSort, className }: { label: string; k: K; sort: { key: K; dir: "asc" | "desc" }; onSort: (k: K) => void; className?: string }) {
  const on = sort.key === k;
  const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn(DATA_TABLE_TH, className)} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 whitespace-nowrap outline-none hover:text-foreground focus-visible:underline">
        {label}
        <Icon className={cn("size-3.5", !on && "opacity-50")} aria-hidden="true" />
      </button>
    </th>
  );
}

function useSort<K extends string>(initial: K) {
  const [sort, setSort] = useState<{ key: K; dir: "asc" | "desc" }>({ key: initial, dir: "desc" });
  const onSort = (k: K) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  return { sort, onSort };
}

function LoadingReport() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading analytics">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
      <Skeleton className="h-56 rounded-card" />
    </div>
  );
}

function ErrorReport({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={RefreshCw}
      title="Analytics couldn't be loaded"
      description="Check your connection and try again."
      action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
    />
  );
}

function Panel({ title, description, actions, children, className }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-body font-semibold">{title}</h2>
          {description ? <p className="text-caption text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function earliest(list: (string | null)[]): string | null {
  const days = list.filter((d): d is string => !!d).sort();
  return days[0] ?? null;
}

/* ---------------------------------- Funnels --------------------------------- */

type FunnelSortKey = "name" | "entries" | "checkoutStarts" | "purchases" | "rate" | "revenue";

function FunnelReportView({ subAccountId, range, onRange, detailId, onDetail }: { subAccountId: string; range: AnalyticsRangeKey; onRange: (r: AnalyticsRangeKey) => void; detailId: string | null; onDetail: (id: string | null) => void }) {
  const { saPath } = useSubAccount();
  const { state, data, reload } = usePageFunnelAnalytics(subAccountId, "funnels", range);
  const [selected, setSelected] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const { sort, onSort } = useSort<FunnelSortKey>("entries");

  const funnels = useMemo(() => data?.funnels ?? [], [data]);
  const scope = useMemo(() => (selected.length ? funnels.filter((f) => selected.includes(f.id)) : funnels), [funnels, selected]);
  const detail = detailId ? (funnels.find((f) => f.id === detailId) ?? null) : null;

  // Keep a deep-linked funnel in the selection so the KPIs match the panel.
  useEffect(() => {
    if (detailId && funnels.some((f) => f.id === detailId) && selected.length === 0) setSelected([detailId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, funnels.length]);

  if (state === "loading" && !data) return <LoadingReport />;
  if (state === "error" && !data) return <ErrorReport onRetry={reload} />;
  if (!data) return null;

  const r = data.range;
  const totals = sumFunnelMetrics(scope.map((f) => f.totals));
  const selling = scope.filter((f) => f.sells);
  const sellingTotals = sumFunnelMetrics(selling.map((f) => f.totals));
  const since = earliest(scope.map((f) => f.trackingSince));
  const canCompare = comparable(since, r) && scope.every((f) => f.previous !== null);
  const prev = canCompare ? sumFunnelMetrics(scope.map((f) => f.previous!)) : null;
  const prevSelling = canCompare ? sumFunnelMetrics(selling.map((f) => f.previous!)) : null;
  const rate = funnelConversionRate(sellingTotals, selling.length > 0);
  const prevRate = prevSelling ? funnelConversionRate(prevSelling, selling.length > 0) : null;
  const delta = (cur: number, p: number | undefined) => percentChange(cur, p ?? null, canCompare);
  const revenue = formatRevenue(totals.revenueByCurrency);

  const daily = r ? mergeFunnelDaily(scope, r) : [];
  const series = granularity === "weekly" ? bucketWeekly(daily, (items) => sumFunnelMetrics(items)) : daily;

  const rateOf = (f: FunnelReport) => funnelConversionRate(f.totals, f.sells);
  const sorted = [...scope].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const v = (f: FunnelReport): number | string =>
      sort.key === "name" ? f.name.toLowerCase() : sort.key === "rate" ? (rateOf(f) ?? -1) : sort.key === "revenue" ? f.totals.revenueCents : f.totals[sort.key];
    const av = v(a);
    const bv = v(b);
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const exportCsv = () =>
    exportAnalyticsCsv(
      `funnel-analytics-${r.from}-to-${r.to}.csv`,
      ["Funnel", "Status", "Entries", "Views", "Checkout starts", "Purchases", "Free trials", "Conversion rate", "Offers accepted", "Offers declined", "Revenue", "Period", "Tracking since"],
      sorted.map((f) => ({
        Funnel: f.name,
        Status: f.status,
        Entries: f.totals.entries,
        Views: f.totals.views,
        "Checkout starts": f.sells ? f.totals.checkoutStarts : "",
        Purchases: f.sells ? f.totals.purchases : "",
        "Free trials": f.totals.trials,
        "Conversion rate": formatPercent(rateOf(f)),
        "Offers accepted": f.totals.offersAccepted,
        "Offers declined": f.totals.offersDeclined,
        Revenue: formatRevenue(f.totals.revenueByCurrency).detail ?? formatRevenue(f.totals.revenueByCurrency).text,
        Period: `${r.from} to ${r.to} (UTC)`,
        "Tracking since": f.trackingSince ?? "not yet",
      })),
    );

  const controls = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <RangeSelect value={range} onChange={onRange} />
      <EntityFilter noun="funnel" options={funnels.map((f) => ({ id: f.id, name: f.name }))} value={selected} onChange={setSelected} />
      <div className="sm:ml-auto">
        <ExportMenu onCsv={exportCsv} disabled={scope.length === 0} />
      </div>
    </div>
  );

  if (funnels.length === 0) {
    return (
      <>
        {controls}
        <EmptyState icon={Filter} sparks title="No funnels yet" description="Create a funnel in Pages & Funnels — its performance will appear here." action={<Button render={<Link href={saPath("/pages-funnels?view=funnels")} />}>Go to Pages &amp; Funnels</Button>} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {controls}
      <TrackingNote since={since} range={r} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={Users} label="Funnel entries" value={formatCount(totals.entries)} delta={<DeltaPill change={delta(totals.entries, prev?.entries)} />} hint="Visitor sessions" />
        <KpiTile icon={ShoppingCart} tone="aqua" label="Checkout starts" value={formatCount(totals.checkoutStarts)} delta={<DeltaPill change={delta(totals.checkoutStarts, prev?.checkoutStarts)} />} />
        <KpiTile icon={ShoppingBag} tone="pink" label="Purchases" value={formatCount(totals.purchases)} delta={<DeltaPill change={delta(totals.purchases, prev?.purchases)} />} hint={totals.trials ? `+ ${formatCount(totals.trials)} free trials` : "Verified, paid"} />
        <KpiTile icon={BadgePercent} tone="blue" label="Conversion rate" value={formatPercent(rate)} delta={<DeltaPill change={rate !== null && prevRate !== null ? rate - prevRate : null} kind="points" />} hint={selling.length ? "Purchases ÷ entries" : "No selected funnel sells"} />
        <KpiTile icon={TagIcon} tone="gold" label="Accepted offers" value={formatCount(totals.offersAccepted)} delta={<DeltaPill change={delta(totals.offersAccepted, prev?.offersAccepted)} />} />
        <KpiTile icon={CircleDollarSign} tone="green" label="Revenue" value={revenue.text} delta={<DeltaPill change={delta(totals.revenueCents, prev?.revenueCents)} />} hint={revenue.detail ?? "Verified, collected"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Funnel performance over time"
          description="Entries, checkout starts and purchases for the selected period."
          actions={
            <Select value={granularity} onValueChange={(v) => v && setGranularity(v as Granularity)} items={{ daily: "Daily", weekly: "Weekly" }}>
              <SelectTrigger aria-label="Granularity" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <TrendChart
            ariaLabel="Funnel entries, checkout starts and purchases over time"
            labels={series.map((d) => shortDay(d.day))}
            series={[
              { label: "Entries", color: "var(--ds-chart-1)", values: series.map((d) => d.entries), area: true },
              { label: "Checkout starts", color: "var(--ds-chart-2)", values: series.map((d) => d.checkoutStarts) },
              { label: "Purchases", color: "var(--ds-chart-4)", values: series.map((d) => d.purchases) },
            ]}
          />
        </Panel>
        <Panel title="Funnel progression (drop-off)" description={selling.length ? "Selling funnels in the selection. Each % is of the previous stage." : undefined}>
          {selling.length ? (
            <ProgressionChart
              stages={[
                { label: "Entries", value: sellingTotals.entries },
                { label: "Checkout starts", value: sellingTotals.checkoutStarts },
                { label: "Purchases", value: sellingTotals.purchases },
                ...(sellingTotals.offersAccepted ? [{ label: "Accepted offers", value: sellingTotals.offersAccepted }] : []),
              ]}
            />
          ) : (
            <p className="rounded-control border border-dashed border-border bg-surface-sunken p-4 text-caption text-muted-foreground">
              None of the selected funnels has a Checkout step, so there&apos;s no purchase drop-off to show. Open a funnel to see visitors per step.
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Funnels" description="Performance for the selected period. Select a funnel for step-by-step detail.">
        <div className="hidden md:block">
          <DataTableShell>
            <thead>
              <tr className={DATA_TABLE_HEAD_ROW}>
                <SortHeader label="Funnel" k="name" sort={sort} onSort={onSort} />
                <SortHeader label="Entries" k="entries" sort={sort} onSort={onSort} className="text-right" />
                <SortHeader label="Starts" k="checkoutStarts" sort={sort} onSort={onSort} className="text-right" />
                <SortHeader label="Purchases" k="purchases" sort={sort} onSort={onSort} className="text-right" />
                <SortHeader label="CVR" k="rate" sort={sort} onSort={onSort} className="text-right" />
                <SortHeader label="Revenue" k="revenue" sort={sort} onSort={onSort} className="text-right" />
                <th className={DATA_TABLE_TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => (
                <tr key={f.id} className={cn(DATA_TABLE_ROW, detailId === f.id && "bg-accent")}>
                  <td className={DATA_TABLE_TD}>
                    <button type="button" onClick={() => onDetail(f.id)} className="flex items-center gap-2.5 text-left font-semibold outline-none hover:underline focus-visible:underline">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-tint-violet text-primary"><Filter className="size-3.5" aria-hidden="true" /></span>
                      <span className="min-w-0 truncate">{f.name}</span>
                    </button>
                  </td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{formatCount(f.totals.entries)}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{f.sells ? formatCount(f.totals.checkoutStarts) : "—"}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{f.sells ? formatCount(f.totals.purchases) : "—"}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{formatPercent(rateOf(f))}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`} title={formatRevenue(f.totals.revenueByCurrency).detail ?? undefined}>{formatRevenue(f.totals.revenueByCurrency).text}</td>
                  <td className={`${DATA_TABLE_TD} w-12 text-right`}><FunnelRowMenu funnel={f} onDetail={onDetail} /></td>
                </tr>
              ))}
            </tbody>
          </DataTableShell>
        </div>
        <ul className="flex flex-col gap-2 md:hidden">
          {sorted.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-card border border-border bg-card p-3">
              <button type="button" onClick={() => onDetail(f.id)} className="flex min-w-0 flex-1 flex-col gap-1 text-left outline-none">
                <span className="truncate font-semibold">{f.name}</span>
                <span className="text-caption text-muted-foreground tabular-nums">
                  {formatCount(f.totals.entries)} entries · {f.sells ? `${formatCount(f.totals.purchases)} purchases · ${formatPercent(rateOf(f))}` : "No checkout"} · {formatRevenue(f.totals.revenueByCurrency).text}
                </span>
              </button>
              <FunnelRowMenu funnel={f} onDetail={onDetail} />
            </li>
          ))}
        </ul>
      </Panel>

      <FunnelAnalyticsSheet
        funnel={detail}
        range={r}
        variant="detail"
        open={!!detail}
        onOpenChange={(o) => !o && onDetail(null)}
        funnelHref={detail ? saPath(`/pages-funnels/funnels/${detail.id}`) : undefined}
      />
    </div>
  );
}

function FunnelRowMenu({ funnel, onDetail }: { funnel: FunnelReport; onDetail: (id: string) => void }) {
  const { saPath } = useSubAccount();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" aria-label={`Actions for ${funnel.name}`} className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted">
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onDetail(funnel.id)}>
          <Eye aria-hidden="true" /> View details
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={saPath(`/pages-funnels/funnels/${funnel.id}`)} />}>
          <SquareArrowOutUpRight aria-hidden="true" /> Open funnel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function mergeFunnelDaily(scope: FunnelReport[], range: AnalyticsRange): Array<FunnelMetrics & { day: string }> {
  const days = scope[0]?.daily.map((d) => d.day) ?? [];
  if (!days.length) return [];
  return days.map((day, i) => ({ day, ...scope.reduce<FunnelMetrics>((acc, f) => addFunnelMetrics(acc, f.daily[i] ?? EMPTY_FUNNEL_METRICS), { ...EMPTY_FUNNEL_METRICS, revenueByCurrency: {} }) })).filter((d) => d.day >= range.from);
}

/* ----------------------------------- Pages ---------------------------------- */

type PageSortKey = "name" | "views" | "visitors" | "conversions" | "rate";

function PageReportView({ subAccountId, range, onRange, detailId, onDetail }: { subAccountId: string; range: AnalyticsRangeKey; onRange: (r: AnalyticsRangeKey) => void; detailId: string | null; onDetail: (id: string | null) => void }) {
  const { saPath, subAccount } = useSubAccount();
  const { state, data, reload } = usePageFunnelAnalytics(subAccountId, "pages", range);
  const [selected, setSelected] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const { sort, onSort } = useSort<PageSortKey>("views");

  const pages = useMemo(() => data?.pages ?? [], [data]);
  const scope = useMemo(() => (selected.length ? pages.filter((p) => selected.includes(p.id)) : pages), [pages, selected]);
  const detail = detailId ? (pages.find((p) => p.id === detailId) ?? null) : null;

  useEffect(() => {
    if (detailId && pages.some((p) => p.id === detailId) && selected.length === 0) setSelected([detailId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, pages.length]);

  if (state === "loading" && !data) return <LoadingReport />;
  if (state === "error" && !data) return <ErrorReport onRetry={reload} />;
  if (!data) return null;

  const r = data.range;
  const totals = sumPageMetrics(scope.map((p) => p.totals));
  const goalPages = scope.filter((p) => p.goal.kind);
  const goalTotals = sumPageMetrics(goalPages.map((p) => p.totals));
  const completions = goalPages.reduce((s, p) => s + (pageConversions(p.totals, p.goal) ?? 0), 0);
  const goalRate = goalTotals.visitors > 0 && goalPages.length ? completions / goalTotals.visitors : null;
  const since = earliest(scope.map((p) => p.trackingSince));
  const canCompare = comparable(since, r) && scope.every((p) => p.previous !== null);
  const prev = canCompare ? sumPageMetrics(scope.map((p) => p.previous!)) : null;
  const prevCompletions = canCompare ? goalPages.reduce((s, p) => s + (pageConversions(p.previous!, p.goal) ?? 0), 0) : null;
  const delta = (cur: number, p: number | null | undefined) => percentChange(cur, p ?? null, canCompare);

  const daily = mergePageDaily(scope);
  const goalDaily = goalPages.length ? scope[0].daily.map((d, i) => goalPages.reduce((s, p) => s + (pageConversions(p.daily[i] ?? EMPTY_PAGE_METRICS, p.goal) ?? 0), 0)) : [];
  const series = granularity === "weekly" ? bucketWeekly(daily, (items) => sumPageMetrics(items)) : daily;
  const goalSeries = granularity === "weekly" ? chunkSums(goalDaily, 7) : goalDaily;

  const rateOf = (p: PageReport) => pageConversionRate(p.totals, p.goal);
  const sorted = [...scope].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const v = (p: PageReport): number | string =>
      sort.key === "name" ? p.name.toLowerCase() : sort.key === "rate" ? (rateOf(p) ?? -1) : sort.key === "conversions" ? (pageConversions(p.totals, p.goal) ?? -1) : p.totals[sort.key];
    const av = v(a);
    const bv = v(b);
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const typeLabel = (p: PageReport) => (p.pageType ? (PAGE_TYPE_LABELS[p.pageType as PageType] ?? "Page") : "Page");
  const exportCsv = () =>
    exportAnalyticsCsv(
      `page-analytics-${r.from}-to-${r.to}.csv`,
      ["Page", "Type", "Status", "Views", "Visitors", "Conversion goal", "Goal completions", "Conversion rate", "Revenue", "Period", "Tracking since"],
      sorted.map((p) => ({
        Page: p.name,
        Type: typeLabel(p),
        Status: p.status,
        Views: p.totals.views,
        Visitors: p.totals.visitors,
        "Conversion goal": p.goal.label,
        "Goal completions": pageConversions(p.totals, p.goal) ?? "",
        "Conversion rate": formatPercent(rateOf(p)),
        Revenue: p.goal.kind === "purchase" ? formatRevenue(p.totals.revenueByCurrency).text : "",
        Period: `${r.from} to ${r.to} (UTC)`,
        "Tracking since": p.trackingSince ?? "not yet",
      })),
    );

  const controls = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <RangeSelect value={range} onChange={onRange} />
      <EntityFilter noun="page" options={pages.map((p) => ({ id: p.id, name: p.name }))} value={selected} onChange={setSelected} />
      <div className="sm:ml-auto">
        <ExportMenu onCsv={exportCsv} disabled={scope.length === 0} />
      </div>
    </div>
  );

  if (pages.length === 0) {
    return (
      <>
        {controls}
        <EmptyState icon={FileText} sparks title="No pages yet" description="Publish a page in Pages & Funnels — its views and goal completions will appear here." action={<Button render={<Link href={saPath("/pages-funnels")} />}>Go to Pages &amp; Funnels</Button>} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {controls}
      <TrackingNote since={since} range={r} />
      {data.truncated ? <p className="text-caption text-muted-foreground">Showing the 250 most recently updated pages.</p> : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile icon={Eye} label="Page views" value={formatCount(totals.views)} delta={<DeltaPill change={delta(totals.views, prev?.views)} />} />
        <KpiTile icon={Users} tone="aqua" label="Visitors" value={formatCount(totals.visitors)} delta={<DeltaPill change={delta(totals.visitors, prev?.visitors)} />} hint="Daily unique sessions" />
        <KpiTile icon={Target} tone="pink" label="Goal completions" value={goalPages.length ? formatCount(completions) : "—"} delta={<DeltaPill change={goalPages.length ? delta(completions, prevCompletions) : null} />} hint={`${goalPages.length} page${goalPages.length === 1 ? "" : "s"} with a measurable goal`} />
        <KpiTile icon={BadgePercent} tone="blue" label="Conversion rate" value={formatPercent(goalRate)} hint={goalPages.length ? "Pages with goals: completions ÷ visitors" : "No selected page has a goal"} />
      </div>

      <Panel
        title="Page performance over time"
        description="Views and goal completions for the selected pages."
        actions={
          <Select value={granularity} onValueChange={(v) => v && setGranularity(v as Granularity)} items={{ daily: "Daily", weekly: "Weekly" }}>
            <SelectTrigger aria-label="Granularity" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        <TrendChart
          ariaLabel="Page views and goal completions over time"
          labels={series.map((d) => shortDay(d.day))}
          series={[
            { label: "Views", color: "var(--ds-chart-1)", values: series.map((d) => d.views), area: true },
            { label: "Visitors", color: "var(--ds-chart-2)", values: series.map((d) => d.visitors) },
            ...(goalPages.length ? [{ label: "Goal completions", color: "var(--ds-chart-4)", values: goalSeries }] : []),
          ]}
        />
      </Panel>

      <Panel title="Pages" description="Views, visitors and goal completions. Select a page for detail.">
        <div className="hidden md:block">
          <DataTableShell>
            <thead>
              <tr className={DATA_TABLE_HEAD_ROW}>
                <SortHeader label="Page" k="name" sort={sort} onSort={onSort} />
                <th className={DATA_TABLE_TH}>Goal</th>
                <SortHeader label="Views" k="views" sort={sort} onSort={onSort} className="text-right" />
                <SortHeader label="Visitors" k="visitors" sort={sort} onSort={onSort} className="text-right" />
                <SortHeader label="Completions" k="conversions" sort={sort} onSort={onSort} className="text-right" />
                <SortHeader label="CVR" k="rate" sort={sort} onSort={onSort} className="text-right" />
                <th className={DATA_TABLE_TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className={cn(DATA_TABLE_ROW, detailId === p.id && "bg-accent")}>
                  <td className={DATA_TABLE_TD}>
                    <button type="button" onClick={() => onDetail(p.id)} className="flex min-w-0 flex-col items-start text-left outline-none">
                      <span className="max-w-72 truncate font-semibold hover:underline">{p.name}</span>
                      <span className="text-caption text-muted-foreground">{typeLabel(p)}{p.status !== "published" ? " · Draft" : ""}</span>
                    </button>
                  </td>
                  <td className={`${DATA_TABLE_TD} text-caption text-muted-foreground`} title={p.goal.reason ?? undefined}>{p.goal.label}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{formatCount(p.totals.views)}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{formatCount(p.totals.visitors)}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{p.goal.kind ? formatCount(pageConversions(p.totals, p.goal) ?? 0) : "—"}</td>
                  <td className={`${DATA_TABLE_TD} text-right tabular-nums`}>{formatPercent(rateOf(p))}</td>
                  <td className={`${DATA_TABLE_TD} w-12 text-right`}><PageRowMenu page={p} onDetail={onDetail} liveUrl={p.status === "published" ? buildPublishedPageUrl({ subAccount, pageId: p.id }) : null} /></td>
                </tr>
              ))}
            </tbody>
          </DataTableShell>
        </div>
        <ul className="flex flex-col gap-2 md:hidden">
          {sorted.map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-card border border-border bg-card p-3">
              <button type="button" onClick={() => onDetail(p.id)} className="flex min-w-0 flex-1 flex-col gap-1 text-left outline-none">
                <span className="truncate font-semibold">{p.name}</span>
                <span className="text-caption text-muted-foreground tabular-nums">
                  {formatCount(p.totals.views)} views · {formatCount(p.totals.visitors)} visitors · {p.goal.kind ? `${formatPercent(rateOf(p))} conv.` : p.goal.label}
                </span>
              </button>
              <PageRowMenu page={p} onDetail={onDetail} liveUrl={p.status === "published" ? buildPublishedPageUrl({ subAccount, pageId: p.id }) : null} />
            </li>
          ))}
        </ul>
      </Panel>

      <PageAnalyticsSheet
        page={detail}
        range={r}
        variant="detail"
        open={!!detail}
        onOpenChange={(o) => !o && onDetail(null)}
        editHref={detail ? saPath(`/pages-funnels/${detail.id}/new-builder`) : undefined}
        liveUrl={detail && detail.status === "published" ? buildPublishedPageUrl({ subAccount, pageId: detail.id }) : null}
      />
    </div>
  );
}

function PageRowMenu({ page, onDetail, liveUrl }: { page: PageReport; onDetail: (id: string) => void; liveUrl: string | null }) {
  const { saPath } = useSubAccount();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" aria-label={`Actions for ${page.name}`} className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted">
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onDetail(page.id)}>
          <Eye aria-hidden="true" /> View details
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={saPath(`/pages-funnels/${page.id}/new-builder`)} />}>
          <Pencil aria-hidden="true" /> Edit page
        </DropdownMenuItem>
        {liveUrl ? (
          <DropdownMenuItem render={<a href={liveUrl} target="_blank" rel="noreferrer" />}>
            <SquareArrowOutUpRight aria-hidden="true" /> View live page
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function mergePageDaily(scope: PageReport[]): Array<PageMetrics & { day: string }> {
  const days = scope[0]?.daily.map((d) => d.day) ?? [];
  return days.map((day, i) => ({ day, ...scope.reduce<PageMetrics>((acc, p) => addPageMetrics(acc, p.daily[i] ?? EMPTY_PAGE_METRICS), { ...EMPTY_PAGE_METRICS, revenueByCurrency: {} }) }));
}

function chunkSums(values: number[], size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size).reduce((s, v) => s + v, 0));
  return out;
}
