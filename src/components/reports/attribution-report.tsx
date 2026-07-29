"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCurrency, toDate } from "@/lib/format";
import { FunnelChart } from "@/components/reports/charts";
import { SourceBadge, sourceLabel } from "@/components/contacts/source-badge";
import type { Contact } from "@/types/contacts";
import type { Deal } from "@/types/deals";
import type { AttributionVisitRow } from "@/lib/firestore/attribution-visits";
import { cn } from "@/lib/utils";

/**
 * Revenue attribution — first-touch model. Won-deal revenue is credited
 * to the source (and utm_campaign, where captured) that originally
 * created the contact. Leads count contacts CREATED in the selected
 * range; deal + revenue columns count deals created/won in the range
 * regardless of when their contact arrived — a March lead closing in
 * June belongs in June's revenue. That asymmetry means "Lead → won" can
 * exceed 100% in a window where old leads close; it's a window metric,
 * not a cohort metric.
 */

/** Deals whose contact no longer exists still carry revenue — they get
 *  their own row instead of silently vanishing from the totals. */
const UNKNOWN_SOURCE = "__unknown__";
const NO_CAMPAIGN = "__none__";

interface RowStats {
  leads: number;
  dealsCreated: number;
  wonCount: number;
  wonValue: number;
}

interface CampaignRow extends RowStats {
  key: string;
  label: string;
}

interface SourceRow extends RowStats {
  key: string;
  campaigns: CampaignRow[];
}

function emptyStats(): RowStats {
  return { leads: 0, dealsCreated: 0, wonCount: 0, wonValue: 0 };
}

export function AttributionReport({
  contacts,
  deals,
  visits,
  rangeDays,
  rangeCutoff,
  currency,
}: {
  contacts: Contact[];
  deals: Deal[];
  visits: AttributionVisitRow[];
  rangeDays: number | null;
  rangeCutoff: number;
  currency: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { rows, totals } = useMemo(() => {
    const inRange = (value: Contact["createdAt"]) => {
      if (!rangeDays) return true;
      const d = toDate(value);
      return !!d && d.getTime() >= rangeCutoff;
    };

    const contactById = new Map(contacts.map((c) => [c.id, c]));
    const bySource = new Map<
      string,
      RowStats & { campaigns: Map<string, RowStats> }
    >();

    const bucket = (sourceKey: string, campaignKey: string) => {
      let row = bySource.get(sourceKey);
      if (!row) {
        row = { ...emptyStats(), campaigns: new Map() };
        bySource.set(sourceKey, row);
      }
      let campaign = row.campaigns.get(campaignKey);
      if (!campaign) {
        campaign = emptyStats();
        row.campaigns.set(campaignKey, campaign);
      }
      return { row, campaign };
    };

    const keysFor = (contact: Contact | undefined) => ({
      sourceKey: contact ? contact.source || "" : UNKNOWN_SOURCE,
      campaignKey: contact?.attribution?.utmCampaign || NO_CAMPAIGN,
    });

    for (const c of contacts) {
      if (!inRange(c.createdAt)) continue;
      const { sourceKey, campaignKey } = keysFor(c);
      const { row, campaign } = bucket(sourceKey, campaignKey);
      row.leads += 1;
      campaign.leads += 1;
    }

    for (const d of deals) {
      const { sourceKey, campaignKey } = keysFor(contactById.get(d.contactId));
      const createdInRange = inRange(d.createdAt);
      const wonInRange =
        d.stageId === "won" && inRange(d.stageChangedAt ?? d.createdAt);
      if (!createdInRange && !wonInRange) continue;
      const { row, campaign } = bucket(sourceKey, campaignKey);
      if (createdInRange) {
        row.dealsCreated += 1;
        campaign.dealsCreated += 1;
      }
      if (wonInRange) {
        row.wonCount += 1;
        campaign.wonCount += 1;
        row.wonValue += d.value || 0;
        campaign.wonValue += d.value || 0;
      }
    }

    const byRevenue = (a: RowStats, b: RowStats) =>
      b.wonValue - a.wonValue || b.leads - a.leads;

    const rows: SourceRow[] = Array.from(bySource.entries())
      .map(([key, row]) => ({
        key,
        leads: row.leads,
        dealsCreated: row.dealsCreated,
        wonCount: row.wonCount,
        wonValue: row.wonValue,
        campaigns: Array.from(row.campaigns.entries())
          .map(([ck, stats]) => ({
            key: ck,
            label: ck === NO_CAMPAIGN ? "No campaign" : ck,
            ...stats,
          }))
          .sort(byRevenue),
      }))
      .sort(byRevenue);

    const totals = rows.reduce(
      (acc, r) => ({
        leads: acc.leads + r.leads,
        dealsCreated: acc.dealsCreated + r.dealsCreated,
        wonCount: acc.wonCount + r.wonCount,
        wonValue: acc.wonValue + r.wonValue,
      }),
      emptyStats(),
    );

    return { rows, totals };
  }, [contacts, deals, rangeDays, rangeCutoff]);

  const [visitPageFilter, setVisitPageFilter] = useState<
    "all" | "booking" | "offer"
  >("all");

  // "day" is a UTC "YYYY-MM-DD" string — compare against the same cutoff
  // used for contacts/deals, treating each bucket's day as its own instant.
  const visitRows = useMemo(() => {
    const cutoffDay = rangeDays
      ? new Date(rangeCutoff).toISOString().slice(0, 10)
      : null;
    const filtered = visits.filter((v) => {
      if (visitPageFilter !== "all" && v.pageType !== visitPageFilter) {
        return false;
      }
      return !cutoffDay || v.day >= cutoffDay;
    });
    const byDimensions = new Map<
      string,
      {
        pageType: string;
        source: string;
        medium: string;
        campaign: string;
        content: string;
        term: string;
        visits: number;
        conversions: number;
      }
    >();
    for (const v of filtered) {
      // Explicitly-tagged UTM source wins; an auto-detected referrer is
      // labeled distinctly so it's never confused with real UTM tagging.
      const source = v.utmSource || (v.referrerSource ? `${v.referrerSource} (referrer)` : "");
      const key = [v.pageType, source, v.utmMedium, v.utmCampaign, v.utmContent, v.utmTerm].join(
        "|",
      );
      let row = byDimensions.get(key);
      if (!row) {
        row = {
          pageType: v.pageType,
          source,
          medium: v.utmMedium ?? "",
          campaign: v.utmCampaign ?? "",
          content: v.utmContent ?? "",
          term: v.utmTerm ?? "",
          visits: 0,
          conversions: 0,
        };
        byDimensions.set(key, row);
      }
      row.visits += v.visits ?? 0;
      row.conversions += v.conversions ?? 0;
    }
    return Array.from(byDimensions.values()).sort(
      (a, b) => b.visits - a.visits,
    );
  }, [visits, visitPageFilter, rangeDays, rangeCutoff]);

  const revenueBars = rows
    .filter((r) => r.wonValue > 0)
    .slice(0, 6)
    .map((r) => ({
      label: rowLabel(r.key),
      value: r.wonValue,
      tone: "bg-emerald-500",
    }));

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (rows.length === 0 && visitRows.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-sm text-muted-foreground">
        <p>No leads, deals, or page visits in this range yet.</p>
        <p className="text-xs">
          Attribution builds up as contacts, won deals, and booking/checkout
          visits accumulate.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {revenueBars.length > 0 && (
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Won revenue by source</h2>
            <p className="text-xs text-muted-foreground">
              Deals won in range · credited to the source that created the
              contact
            </p>
          </div>
          <FunnelChart
            data={revenueBars}
            formatValue={(v) => formatCurrency(v, currency)}
          />
        </section>
      )}

      <section className="rounded-2xl border bg-card">
        <div className="border-b p-5 pb-4">
          <h2 className="text-sm font-semibold">Source performance</h2>
          <p className="text-xs text-muted-foreground">
            First-touch attribution. Leads count contacts created in range;
            revenue counts deals won in range. Expand a source to break it
            down by campaign (captured on hosted-form submissions).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                <th className="px-3 py-2.5 text-right font-medium">Deals</th>
                <th className="px-3 py-2.5 text-right font-medium">Won</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Won revenue
                </th>
                <th className="px-5 py-2.5 text-right font-medium">
                  Lead → won
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded.has(row.key);
                // A lone "No campaign" sub-row just repeats the parent —
                // only offer the drill-down when there's real detail.
                const canExpand =
                  row.campaigns.length > 1 ||
                  (row.campaigns.length === 1 &&
                    row.campaigns[0].key !== NO_CAMPAIGN);
                return (
                  <SourceRows
                    key={row.key}
                    row={row}
                    currency={currency}
                    isOpen={isOpen}
                    canExpand={canExpand}
                    onToggle={() => toggle(row.key)}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-5 py-2.5">Total</td>
                <Cells stats={totals} currency={currency} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5 pb-4">
          <div>
            <h2 className="text-sm font-semibold">Page visits &amp; conversions</h2>
            <p className="text-xs text-muted-foreground">
              Every landing on a booking or checkout page, whether or not it
              converted, broken down by UTM tag — or, for untagged traffic, an
              auto-detected referrer.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
            {(["all", "booking", "offer"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setVisitPageFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  visitPageFilter === f
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f === "all" ? "All pages" : f}
              </button>
            ))}
          </div>
        </div>
        {visitRows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No page visits in this range yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">Medium</th>
                  <th className="px-3 py-2.5 font-medium">Campaign</th>
                  <th className="px-3 py-2.5 font-medium">Content</th>
                  <th className="px-3 py-2.5 font-medium">Term</th>
                  <th className="px-3 py-2.5 text-right font-medium">Visits</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Conversions
                  </th>
                  <th className="px-5 py-2.5 text-right font-medium">
                    Conv %
                  </th>
                </tr>
              </thead>
              <tbody>
                {visitRows.map((r, i) => {
                  const convPct =
                    r.visits > 0
                      ? Math.round((r.conversions / r.visits) * 100)
                      : null;
                  return (
                    <tr
                      key={`${r.pageType}|${r.source}|${r.medium}|${r.campaign}|${r.content}|${r.term}|${i}`}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-5 py-2.5">
                        {r.source ? (
                          r.source
                        ) : (
                          <span className="text-muted-foreground">Direct</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.medium || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.campaign || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.content || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.term || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.visits}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.conversions}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {convPct === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          `${convPct}%`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function rowLabel(key: string): string {
  if (key === UNKNOWN_SOURCE) return "Deleted contact";
  return sourceLabel(key);
}

function SourceRows({
  row,
  currency,
  isOpen,
  canExpand,
  onToggle,
}: {
  row: SourceRow;
  currency: string;
  isOpen: boolean;
  canExpand: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          "border-b last:border-b-0",
          canExpand && "cursor-pointer hover:bg-muted/30",
        )}
        onClick={canExpand ? onToggle : undefined}
      >
        <td className="px-5 py-2.5">
          <span className="flex items-center gap-1.5">
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                isOpen && "rotate-90",
                !canExpand && "invisible",
              )}
            />
            {row.key === UNKNOWN_SOURCE || row.key === "" ? (
              <span className="text-muted-foreground">{rowLabel(row.key)}</span>
            ) : (
              <SourceBadge source={row.key as Contact["source"]} />
            )}
          </span>
        </td>
        <Cells stats={row} currency={currency} />
      </tr>
      {isOpen &&
        row.campaigns.map((c) => (
          <tr
            key={c.key}
            className="border-b bg-muted/20 text-xs last:border-b-0"
          >
            <td className="py-2 pl-12 pr-5">
              <span
                className={cn(
                  c.key === NO_CAMPAIGN && "text-muted-foreground",
                )}
              >
                {c.label}
              </span>
            </td>
            <Cells stats={c} currency={currency} />
          </tr>
        ))}
    </>
  );
}

function Cells({ stats, currency }: { stats: RowStats; currency: string }) {
  const conversion =
    stats.leads > 0 ? Math.round((stats.wonCount / stats.leads) * 100) : null;
  return (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums">{stats.leads}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {stats.dealsCreated}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{stats.wonCount}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {stats.wonValue > 0 ? (
          formatCurrency(stats.wonValue, currency)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-5 py-2.5 text-right tabular-nums">
        {conversion === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${conversion}%`
        )}
      </td>
    </>
  );
}
