"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Rocket, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { AcquisitionSummary } from "@/types/billing";

/**
 * Agency → Acquisition (Agency Acquisition Foundation, 2026-08-31) — the
 * smallest useful acquisition view for selling Magnetix itself, per the
 * Sales & Affiliate Infrastructure audit's Part 12. Deliberately NOT an
 * elaborate analytics suite: visits, unique-ish visitors, checkout starts,
 * purchases, two conversion rates, source/campaign/referrer breakdowns,
 * abandoned checkouts, and recent signups — one screen, one fetch.
 *
 * Every browser-beacon-sourced number is explicitly labeled as an
 * estimate — see `formatEstimate` below — per the audit's instruction not
 * to present tracking estimates as exact people counts.
 */

function formatPct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function AgencyAcquisitionPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [summary, setSummary] = useState<AcquisitionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/agency/acquisition")
      .then((r) => r.json())
      .then((d: AcquisitionSummary | { error?: string }) => {
        if ("error" in d && d.error) {
          setError(d.error);
          return;
        }
        setSummary(d as AcquisitionSummary);
      })
      .catch(() => setError("Couldn't load acquisition data."));
  }, [isOwner]);

  if (authLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
          <Rocket className="mx-auto mb-2 h-6 w-6" />
          Acquisition data is managed by the agency owner.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Acquisition</h1>
        <p className="text-sm text-muted-foreground">
          How people find and buy Magnetix — from your sales page through
          checkout to a paying customer.
        </p>
      </div>

      {!summary?.salesPageConfigured && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            No sales page URL is set yet, and the tracking snippet may not be
            installed anywhere — visit/visitor numbers below will stay at
            zero until both are in place. Set one under{" "}
            <Link href="/agency/settings" className="underline">
              Agency → Settings → Sales page
            </Link>
            .
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
      ) : (
        <>
          {/* Top-line metrics */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Sales-page views"
              value={summary.visits.toLocaleString()}
              hint="Browser-beacon estimate — page loads, not people. Undercounts ad blockers and blocked scripts."
              estimate
            />
            <MetricCard
              label="Unique-ish visitors"
              value={summary.uniqueVisitors.toLocaleString()}
              hint="Browser-session estimate, not a person count — see the tracking snippet's own notes on what a session is."
              estimate
            />
            <MetricCard
              label="Checkout starts"
              value={summary.checkoutStarts.toLocaleString()}
              hint="Authoritative — every Stripe Checkout Session Magnetix created, whether or not it was completed."
            />
            <MetricCard
              label="Purchases"
              value={summary.purchases.toLocaleString()}
              hint="Authoritative — confirmed by the signed Stripe webhook, workspace provisioned."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Sales page → purchase"
              value={formatPct(summary.salesPageConversionRate)}
              hint="Purchases ÷ sales-page views. Undefined until at least one view is recorded."
            />
            <MetricCard
              label="Checkout → purchase"
              value={formatPct(summary.checkoutConversionRate)}
              hint="Purchases ÷ checkout starts — the more reliable of the two conversion rates, since both sides are authoritative."
            />
            <MetricCard
              label="Abandoned checkouts"
              value={summary.abandonedCheckouts.toLocaleString()}
              hint="Checkout started, no purchase, more than 24h ago. No recovery email is sent for these yet."
            />
          </div>

          {/* Breakdowns */}
          <div className="grid gap-3 lg:grid-cols-3">
            <BreakdownCard title="By source" rows={summary.bySource} />
            <BreakdownCard title="By campaign" rows={summary.byCampaign} />
            <BreakdownCard title="By referrer" rows={summary.byReferrer} />
          </div>

          {/* Recent signups */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent signups
            </h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
              {summary.recentSignups.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No signups yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Business</th>
                      <th className="px-4 py-2.5 text-left font-medium">Source</th>
                      <th className="px-4 py-2.5 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentSignups.map((s) => (
                      <tr key={s.sessionId} className="border-t">
                        <td className="px-4 py-3 font-medium">
                          {s.businessName}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {s.buyerEmail}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.utmSource ?? "(direct / untagged)"}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {s.provisionedAt
                            ? new Date(s.provisionedAt).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  estimate,
}: {
  label: string;
  value: string;
  hint: string;
  estimate?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {estimate && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Estimate
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: AcquisitionSummary["bySource"];
}) {
  const top = rows.slice(0, 6);
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {top.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{r.key}</span>
              <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                {r.visits} <ArrowUpRight className="h-3 w-3" /> {r.purchases}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
