"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgePercent, CircleDollarSign, Eye, FileText, Filter, Pencil, ShoppingBag, ShoppingCart, Tag as TagIcon, Target, Users } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/system/status-pill";
import { DeltaPill, KpiTile, TrendChart, shortDay } from "@/components/analytics/analytics-kit";
import {
  formatCents,
  formatCount,
  formatPercent,
  formatRangeLabel,
  formatRevenue,
  funnelConversionRate,
  pageConversionRate,
  pageConversions,
  percentChange,
  type AnalyticsRange,
} from "@/lib/analytics/page-funnel-metrics";
import { FUNNEL_STATUS_LABELS, FUNNEL_STEP_TYPE_LABELS } from "@/lib/pages-funnels/library";
import { PAGE_TYPE_LABELS, type PageType } from "@/types/pages-funnels";
import type { FunnelReport, PageReport } from "@/types/page-funnel-analytics";

const sinceFmt = (day: string) => new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Tracking since …" so nobody reads an empty period before tracking began as zero activity. */
export function TrackingNote({ since, range }: { since: string | null; range: AnalyticsRange }) {
  if (!since) return <p className="text-caption text-muted-foreground">No activity recorded yet. Analytics are tracked from the first visit after this feature went live.</p>;
  if (since > range.from) return <p className="text-caption text-muted-foreground">Tracking began {sinceFmt(since)} — earlier days in this period have no data.</p>;
  return null;
}

export function funnelDeltas(f: Pick<FunnelReport, "totals" | "previous" | "sells">) {
  const ok = f.previous !== null;
  const p = f.previous;
  const rate = funnelConversionRate(f.totals, f.sells);
  const prevRate = p ? funnelConversionRate(p, f.sells) : null;
  return {
    entries: percentChange(f.totals.entries, p?.entries ?? null, ok),
    views: percentChange(f.totals.views, p?.views ?? null, ok),
    checkoutStarts: percentChange(f.totals.checkoutStarts, p?.checkoutStarts ?? null, ok),
    purchases: percentChange(f.totals.purchases, p?.purchases ?? null, ok),
    offersAccepted: percentChange(f.totals.offersAccepted, p?.offersAccepted ?? null, ok),
    revenue: percentChange(f.totals.revenueCents, p?.revenueCents ?? null, ok),
    rate: rate !== null && prevRate !== null ? rate - prevRate : null,
  };
}

/* --------------------------------- Funnel ---------------------------------- */

export function FunnelAnalyticsSheet({
  funnel,
  range,
  variant,
  open,
  onOpenChange,
  reportsHref,
  funnelHref,
}: {
  funnel: FunnelReport | null;
  range: AnalyticsRange;
  variant: "quick" | "detail";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportsHref?: string;
  funnelHref?: string;
}) {
  // Open at the top (focus the header), not scrolled to the last button.
  const topRef = useRef<HTMLDivElement>(null);
  return (
    <Sheet open={open && !!funnel} onOpenChange={onOpenChange}>
      <SheetContent initialFocus={topRef} className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md" aria-describedby={undefined}>
        {funnel ? <FunnelSheetBody topRef={topRef} funnel={funnel} range={range} variant={variant} reportsHref={reportsHref} funnelHref={funnelHref} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function FunnelSheetBody({ topRef, funnel: f, range, variant, reportsHref, funnelHref }: { topRef: React.RefObject<HTMLDivElement | null>; funnel: FunnelReport; range: AnalyticsRange; variant: "quick" | "detail"; reportsHref?: string; funnelHref?: string }) {
  const d = funnelDeltas(f);
  const rate = funnelConversionRate(f.totals, f.sells);
  const revenue = formatRevenue(f.totals.revenueByCurrency);
  const labels = f.daily.map((x) => shortDay(x.day));
  return (
    <>
      <SheetHeader ref={topRef} tabIndex={-1} className="gap-3 border-b border-border p-5 pr-12 outline-none">
        <SheetTitle className="text-title-sm">{variant === "quick" ? "Quick Funnel Performance" : "Funnel Details"}</SheetTitle>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
            <Filter className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-body font-semibold text-foreground">{f.name}</p>
              <StatusPill status={f.status}>{FUNNEL_STATUS_LABELS[f.status]}</StatusPill>
            </div>
            <SheetDescription className="text-caption">{formatRangeLabel(range.from, range.to)}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-4 p-5">
        <TrackingNote since={f.trackingSince} range={range} />
        <div className="grid grid-cols-2 gap-2.5">
          <KpiTile icon={Users} label="Entries" value={formatCount(f.totals.entries)} delta={<DeltaPill change={d.entries} />} hint="Visitor sessions" />
          <KpiTile icon={ShoppingCart} tone="aqua" label="Checkout starts" value={f.sells ? formatCount(f.totals.checkoutStarts) : "—"} delta={f.sells ? <DeltaPill change={d.checkoutStarts} /> : null} hint={f.sells ? undefined : "No checkout step"} />
          <KpiTile icon={ShoppingBag} tone="pink" label="Purchases" value={f.sells ? formatCount(f.totals.purchases) : "—"} delta={f.sells ? <DeltaPill change={d.purchases} /> : null} hint={f.totals.trials ? `+ ${formatCount(f.totals.trials)} free trial${f.totals.trials === 1 ? "" : "s"}` : undefined} />
          <KpiTile icon={BadgePercent} tone="blue" label="Conversion rate" value={rate === null ? "—" : formatPercent(rate)} delta={<DeltaPill change={d.rate} kind="points" />} hint={f.sells ? "Purchases ÷ entries" : "Not applicable — sells nothing"} />
          {variant === "detail" ? (
            <KpiTile icon={TagIcon} tone="gold" label="Accepted offers" value={formatCount(f.totals.offersAccepted)} delta={<DeltaPill change={d.offersAccepted} />} />
          ) : null}
          <KpiTile icon={CircleDollarSign} tone="green" label="Revenue" value={revenue.text} delta={<DeltaPill change={d.revenue} />} hint={revenue.detail ?? "Verified, collected"} className={variant === "quick" ? "col-span-2" : undefined} />
        </div>

        <section className="rounded-card border border-border bg-card p-4 shadow-card" aria-label="Entries over time">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-body-sm font-semibold">{variant === "quick" ? "Entries over time" : "Performance over time"}</h3>
            <span className="text-caption text-muted-foreground tabular-nums">{formatCount(f.totals.entries)} total</span>
          </div>
          <TrendChart
            ariaLabel={`Daily entries for ${f.name}`}
            height={variant === "quick" ? 140 : 180}
            labels={labels}
            series={[
              { label: "Entries", color: "var(--ds-chart-1)", values: f.daily.map((x) => x.entries), area: true },
              ...(variant === "detail" && f.sells
                ? [
                    { label: "Checkout starts", color: "var(--ds-chart-2)", values: f.daily.map((x) => x.checkoutStarts) },
                    { label: "Purchases", color: "var(--ds-chart-4)", values: f.daily.map((x) => x.purchases) },
                  ]
                : []),
            ]}
          />
        </section>

        {variant === "detail" ? <FunnelStepBreakdown funnel={f} /> : null}
        {variant === "detail" && f.sells ? <CheckoutResults funnel={f} /> : null}

        <div className="flex flex-col gap-2">
          {variant === "quick" && reportsHref ? (
            <Button render={<Link href={reportsHref} />} className="w-full">
              View detailed analytics in Reports <ArrowUpRight aria-hidden="true" />
            </Button>
          ) : null}
          {funnelHref ? (
            <Button variant="secondary" render={<Link href={funnelHref} />} className="w-full">
              Open funnel
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function FunnelStepBreakdown({ funnel: f }: { funnel: FunnelReport }) {
  const entries = f.totals.entries;
  return (
    <section className="flex flex-col gap-2.5" aria-label="Step breakdown">
      <h3 className="text-body-sm font-semibold">Step breakdown</h3>
      {f.steps.length === 0 ? <p className="text-caption text-muted-foreground">This funnel has no steps yet.</p> : null}
      <ol className="flex flex-col gap-2">
        {f.steps.map((s, i) => {
          const m = s.metrics;
          let primary: string;
          let rate: number | null;
          let rateLabel: string;
          if (s.type === "checkout") {
            primary = `${formatCount(m.checkoutStarts)} starts · ${formatCount(m.purchases)} purchases`;
            rate = entries > 0 ? m.checkoutStarts / entries : null;
            rateLabel = "of entries started checkout";
          } else if (s.type === "upsell" || s.type === "downsell") {
            const decided = m.offersAccepted + m.offersDeclined;
            primary = `${formatCount(m.offersAccepted)} accepted · ${formatCount(m.offersDeclined)} declined`;
            rate = decided > 0 ? m.offersAccepted / decided : null;
            rateLabel = "acceptance";
          } else {
            primary = `${formatCount(m.visitors)} visitors · ${formatCount(m.views)} views`;
            rate = entries > 0 ? Math.min(1, m.visitors / entries) : null;
            rateLabel = "of entries";
          }
          return (
            <li key={s.id} className="rounded-card border border-border bg-card p-3 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tint-violet text-caption font-semibold text-primary">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-semibold">{s.name}</p>
                      <p className="text-caption text-muted-foreground">{FUNNEL_STEP_TYPE_LABELS[s.type]} · {primary}</p>
                    </div>
                    <span className="shrink-0 text-caption font-semibold tabular-nums" title={rateLabel}>{formatPercent(rate)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${Math.round((rate ?? 0) * 100)}%`, backgroundColor: "var(--ds-chart-1)" }} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-caption text-muted-foreground">Visitors and views count real traffic; checkouts, offers and purchases count LIVE payments only.</p>
    </section>
  );
}

/** An amount in the funnel's one currency (never mixes currencies). */
function moneyIn(cents: number, byCurrency: Record<string, number>): string {
  const currencies = Object.keys(byCurrency).filter((c) => byCurrency[c] > 0);
  if (currencies.length > 1) return "Multiple currencies";
  return formatCents(cents, currencies[0] || "USD");
}

function CheckoutResults({ funnel: f }: { funnel: FunnelReport }) {
  const t = f.totals;
  const rows: [string, string][] = [
    ["Checkout starts", formatCount(t.checkoutStarts)],
    ["Paid purchases", formatCount(t.purchases)],
    ["Free trials started", formatCount(t.trials)],
    ["Free orders", formatCount(t.freeOrders)],
    ["Declined payments", formatCount(t.checkoutFailures)],
    ["Offers accepted / declined", `${formatCount(t.offersAccepted)} / ${formatCount(t.offersDeclined)}`],
    ["Checkout revenue", moneyIn(t.initialRevenueCents, t.revenueByCurrency)],
    ["Offer revenue", moneyIn(t.offerRevenueCents, t.revenueByCurrency)],
  ];
  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-card" aria-label="Checkout and offer results">
      <h3 className="mb-2 text-body-sm font-semibold">Checkout &amp; offer results</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-body-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-caption text-muted-foreground">Free trials and free orders collect $0 and are never counted as purchases or revenue. Renewals aren&apos;t funnel conversions.</p>
    </section>
  );
}

/* ---------------------------------- Page ----------------------------------- */

export function PageAnalyticsSheet({
  page,
  range,
  variant,
  open,
  onOpenChange,
  reportsHref,
  editHref,
  liveUrl,
}: {
  page: PageReport | null;
  range: AnalyticsRange;
  variant: "quick" | "detail";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportsHref?: string;
  editHref?: string;
  liveUrl?: string | null;
}) {
  const topRef = useRef<HTMLDivElement>(null);
  return (
    <Sheet open={open && !!page} onOpenChange={onOpenChange}>
      <SheetContent initialFocus={topRef} className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md" aria-describedby={undefined}>
        {page ? <PageSheetBody topRef={topRef} page={page} range={range} variant={variant} reportsHref={reportsHref} editHref={editHref} liveUrl={liveUrl} /> : null}
      </SheetContent>
    </Sheet>
  );
}

export function pageDeltas(p: Pick<PageReport, "totals" | "previous" | "goal">) {
  const ok = p.previous !== null;
  const conv = pageConversions(p.totals, p.goal);
  const prevConv = p.previous ? pageConversions(p.previous, p.goal) : null;
  const rate = pageConversionRate(p.totals, p.goal);
  const prevRate = p.previous ? pageConversionRate(p.previous, p.goal) : null;
  return {
    views: percentChange(p.totals.views, p.previous?.views ?? null, ok),
    visitors: percentChange(p.totals.visitors, p.previous?.visitors ?? null, ok),
    conversions: conv !== null ? percentChange(conv, prevConv, ok) : null,
    rate: rate !== null && prevRate !== null ? rate - prevRate : null,
  };
}

function PageSheetBody({ topRef, page: p, range, variant, reportsHref, editHref, liveUrl }: { topRef: React.RefObject<HTMLDivElement | null>; page: PageReport; range: AnalyticsRange; variant: "quick" | "detail"; reportsHref?: string; editHref?: string; liveUrl?: string | null }) {
  const d = pageDeltas(p);
  const conversions = pageConversions(p.totals, p.goal);
  const rate = pageConversionRate(p.totals, p.goal);
  const typeLabel = p.pageType ? (PAGE_TYPE_LABELS[p.pageType as PageType] ?? "Page") : "Page";
  return (
    <>
      <SheetHeader ref={topRef} tabIndex={-1} className="gap-3 border-b border-border p-5 pr-12 outline-none">
        <SheetTitle className="text-title-sm">{variant === "quick" ? "Quick Page Performance" : "Page Details"}</SheetTitle>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-body font-semibold text-foreground">{p.name}</p>
              <StatusPill status={p.status === "published" ? "published" : "draft"}>{p.status === "published" ? "Published" : "Draft"}</StatusPill>
            </div>
            <SheetDescription className="text-caption">{typeLabel} · {formatRangeLabel(range.from, range.to)}</SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <div className="flex flex-col gap-4 p-5">
        <TrackingNote since={p.trackingSince} range={range} />
        <div className="grid grid-cols-2 gap-2.5">
          <KpiTile icon={Eye} label="Page views" value={formatCount(p.totals.views)} delta={<DeltaPill change={d.views} />} />
          <KpiTile icon={Users} tone="aqua" label="Visitors" value={formatCount(p.totals.visitors)} delta={<DeltaPill change={d.visitors} />} hint="Daily unique sessions" />
          <KpiTile icon={Target} tone="pink" label={p.goal.kind ? p.goal.label : "Conversions"} value={conversions === null ? "—" : formatCount(conversions)} delta={<DeltaPill change={d.conversions} />} hint={p.goal.kind ? "Goal completions" : p.goal.label} />
          <KpiTile icon={BadgePercent} tone="blue" label="Conversion rate" value={rate === null ? "—" : formatPercent(rate)} delta={<DeltaPill change={d.rate} kind="points" />} hint={p.goal.kind ? "Completions ÷ visitors" : "No conversion goal"} />
          {p.goal.kind === "purchase" ? (
            <KpiTile icon={CircleDollarSign} tone="green" label="Revenue" value={formatRevenue(p.totals.revenueByCurrency).text} hint="Verified, collected" className="col-span-2" />
          ) : null}
        </div>
        {!p.goal.kind && p.goal.reason ? (
          <p className="rounded-control border border-dashed border-border bg-surface-sunken px-3 py-2 text-caption text-muted-foreground">{p.goal.reason}</p>
        ) : null}
        <section className="rounded-card border border-border bg-card p-4 shadow-card" aria-label="Views over time">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-body-sm font-semibold">Views over time</h3>
            <span className="text-caption text-muted-foreground tabular-nums">{formatCount(p.totals.views)} total</span>
          </div>
          <TrendChart
            ariaLabel={`Daily views for ${p.name}`}
            height={variant === "quick" ? 140 : 180}
            labels={p.daily.map((x) => shortDay(x.day))}
            series={[
              { label: "Views", color: "var(--ds-chart-1)", values: p.daily.map((x) => x.views), area: true },
              ...(variant === "detail" && p.goal.kind
                ? [{ label: p.goal.label, color: "var(--ds-chart-4)", values: p.daily.map((x) => pageConversions(x, p.goal) ?? 0) }]
                : []),
            ]}
          />
        </section>
        <div className="flex flex-col gap-2">
          {variant === "quick" && reportsHref ? (
            <Button render={<Link href={reportsHref} />} className="w-full">
              View detailed analytics in Reports <ArrowUpRight aria-hidden="true" />
            </Button>
          ) : null}
          {editHref ? (
            <Button variant="secondary" render={<Link href={editHref} />} className="w-full">
              <Pencil aria-hidden="true" /> Edit page
            </Button>
          ) : null}
          {liveUrl ? (
            <Button variant="ghost" render={<a href={liveUrl} target="_blank" rel="noreferrer" />} className="w-full">
              View live page <ArrowUpRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
