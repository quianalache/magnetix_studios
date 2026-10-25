"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Rocket, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SectionHeader } from "@/components/system/section-header";
import { EmptyState } from "@/components/system/empty-state";
import { Tag } from "@/components/system/status-pill";
import {
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_ROW,
  DATA_TABLE_TD,
  DATA_TABLE_TH,
  DataTableShell,
} from "@/components/system/data-table";
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
    return <PageShellLoading width="data" />;
  }

  if (!isOwner) {
    return (
      <PageShell width="data">
        <EmptyState icon={Rocket} title="Owner only" description="Traffic & signups data is managed by the agency owner." />
      </PageShell>
    );
  }

  return (
    <PageShell width="data">
      <PageHeader
        title="Traffic & Signups"
        description="How people find and buy Magnetix — from your sales page through checkout to a paying customer."
      />

      {summary && !summary.salesPageConfigured && (
        <Alert tone="warning" title="No sales page URL yet">
          The tracking snippet may not be installed anywhere either — visit and visitor numbers below stay at zero
          until both are in place. Set one under{" "}
          <Link href="/agency/settings?section=sales-page" className="font-medium underline underline-offset-2">
            Agency Settings → Sales page
          </Link>
          .
        </Alert>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {!summary ? (
        error ? null : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
        )
      ) : (
        <>
          {/* Top-line metrics */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AcqMetric
              label="Sales-page views"
              value={summary.visits.toLocaleString()}
              hint="Browser-beacon estimate — page loads, not people. Undercounts ad blockers and blocked scripts."
              estimate
            />
            <AcqMetric
              label="Unique-ish visitors"
              value={summary.uniqueVisitors.toLocaleString()}
              hint="Browser-session estimate, not a person count — see the tracking snippet's own notes on what a session is."
              estimate
            />
            <AcqMetric
              label="Checkout starts"
              value={summary.checkoutStarts.toLocaleString()}
              hint="Authoritative — every Stripe Checkout Session Magnetix created, whether or not it was completed."
            />
            <AcqMetric
              label="Purchases"
              value={summary.purchases.toLocaleString()}
              hint="Authoritative — confirmed by the signed Stripe webhook, workspace provisioned."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <AcqMetric
              label="Sales page → purchase"
              value={formatPct(summary.salesPageConversionRate)}
              hint="Purchases ÷ sales-page views. Undefined until at least one view is recorded."
            />
            <AcqMetric
              label="Checkout → purchase"
              value={formatPct(summary.checkoutConversionRate)}
              hint="Purchases ÷ checkout starts — the more reliable of the two conversion rates, since both sides are authoritative."
            />
            <AcqMetric
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
          <section className="flex flex-col gap-3">
            <SectionHeader title="Recent signups" description="New Magnetix customers, most recent first." />
            {summary.recentSignups.length === 0 ? (
              <EmptyState compact icon={Users} title="No signups yet" />
            ) : (
              <DataTableShell minWidth="36rem">
                <thead>
                  <tr className={DATA_TABLE_HEAD_ROW}>
                    <th className={DATA_TABLE_TH}>Business</th>
                    <th className={DATA_TABLE_TH}>Source</th>
                    <th className={`${DATA_TABLE_TH} text-right`}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentSignups.map((s) => (
                    <tr key={s.sessionId} className={DATA_TABLE_ROW}>
                      <td className={DATA_TABLE_TD}>
                        <p className="font-medium text-foreground">{s.businessName}</p>
                        <p className="text-caption text-muted-foreground">{s.buyerEmail}</p>
                      </td>
                      <td className={`${DATA_TABLE_TD} text-muted-foreground`}>{s.utmSource ?? "(direct / untagged)"}</td>
                      <td className={`${DATA_TABLE_TD} text-right whitespace-nowrap text-muted-foreground`}>
                        {s.provisionedAt ? new Date(s.provisionedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTableShell>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}

function AcqMetric({
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
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-caption font-medium text-muted-foreground">{label}</p>
        {estimate && <Tag color="gray">Estimate</Tag>}
      </div>
      <p className="text-title-lg font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      <p className="text-caption text-muted-foreground">{hint}</p>
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
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-sm font-semibold text-foreground">{title}</p>
        {top.length > 0 && (
          <p className="flex gap-3 text-micro font-semibold tracking-wide text-muted-foreground uppercase">
            <span>Visits</span>
            <span>Signups</span>
          </p>
        )}
      </div>
      {top.length === 0 ? (
        <p className="text-caption text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle text-body-sm">
          {top.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-foreground">{r.key}</span>
              <span className="flex shrink-0 gap-3 text-right tabular-nums text-muted-foreground">
                <span className="w-11">{r.visits.toLocaleString()}</span>
                <span className="w-12 font-medium text-foreground">{r.purchases.toLocaleString()}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
