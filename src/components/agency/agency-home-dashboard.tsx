"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  CreditCard,
  UserPlus,
  TrendingDown,
  Plus,
  Wallet,
  Radar,
  ArrowRightLeft,
  Gift,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Info,
  BarChart3,
  LineChart,
  PieChart,
  Megaphone,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { AreaChart, BarChart, DonutChart, FunnelChart } from "@/components/reports/charts";
import {
  effectiveBillingState,
  formatBillingPrice,
  monthlyEquivalentCents,
} from "@/lib/billing/status";
import { formatRelativeTime } from "@/lib/format";
import type { SubAccountDoc } from "@/types";
import type { AcquisitionSummary } from "@/types/billing";

/**
 * Agency Home dashboard (owner-only) — "what is happening with Magnetix as a
 * SaaS business," built from real Agency/platform data only. Every number
 * here traces to a real, already-existing source:
 *
 *   - `subs` — the same `subAccounts` (agencyId ==) query the Sub-accounts
 *     and Client Billing pages already use.
 *   - `/api/agency/activity` — real `billingEvents`, newly exposed (that
 *     collection was write-only before this).
 *   - `/api/agency/acquisition` — the existing, previously-unlinked
 *     Acquisition page's own summary, reused rather than duplicated.
 *
 * "Total Customers" counts every sub-account under the agency, including
 * the owner's own operating workspace — Magnetix doesn't yet have a
 * canonical Agency Customer entity distinct from the workspace itself (see
 * the Agency Architecture audit), so this is the most honest count
 * available without inventing a customer model. Revenue Overview and Plan
 * Breakdown are both point-in-time (not fabricated historical trends) for
 * the same reason: a sub-account's `billing.activatedAt` gets overwritten
 * on reactivation, so reconstructing a monthly MRR history from it would
 * understate real past revenue. Customer Growth IS a real time series,
 * because `createdAt` is set once and never changes.
 */

const AGENCY_DONUT_COLORS = [
  "#5e2574", // --mx-purple
  "#e8b7c8", // --mx-rose-quartz
  "#9edbdd", // --mx-aqua-glow
  "#edd9ec", // --mx-lavender-mist
  "#f3d9d7", // --mx-blush-veil
];
const CANCELED_COLOR = "#e11d48"; // rose-600 — distinct warning tone
const COMPED_COLOR = "#94a3b8"; // slate-400 — neutral, not a "plan"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

interface AgencyActivityApiItem {
  id: string;
  kind: string;
  label: string;
  subAccountId: string;
  subAccountName: string;
  occurredAt: string | null;
}

interface ActivityRow {
  id: string;
  label: string;
  subtitle: string;
  occurredAtMs: number;
  tone: string;
  Icon: LucideIcon;
}

const ACTIVITY_ICONS: Record<string, { Icon: LucideIcon; tone: string }> = {
  signup: { Icon: UserPlus, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  activated: { Icon: CreditCard, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  plan_assigned: { Icon: ArrowRightLeft, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  plan_switched: { Icon: ArrowRightLeft, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  comped: { Icon: Gift, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  payment_failed: { Icon: AlertTriangle, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  payment_recovered: { Icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  canceled: { Icon: XCircle, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  reactivated: { Icon: RefreshCcw, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  status_changed: { Icon: Info, tone: "bg-muted text-muted-foreground" },
  created: { Icon: Plus, tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
};

interface QuickAction {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/agency/sub-accounts/new", label: "Create sub-account", Icon: Plus },
  { href: "/agency/billing", label: "Manage plans & billing", Icon: Wallet },
  { href: "/agency/sub-accounts", label: "View sub-accounts", Icon: Users },
  { href: "/agency/acquisition", label: "View acquisition", Icon: Radar },
];

export function AgencyHomeDashboard({
  firstName,
  agencyName,
  subs,
  subsLoading,
}: {
  firstName: string;
  agencyName: string;
  subs: SubAccountDoc[];
  subsLoading: boolean;
}) {
  const [activity, setActivity] = useState<AgencyActivityApiItem[] | null>(null);
  const [acquisition, setAcquisition] = useState<AcquisitionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/agency/activity")
      .then((r) => r.json())
      .then((d: { items?: AgencyActivityApiItem[] }) => {
        if (!cancelled) setActivity(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    void fetch("/api/agency/acquisition")
      .then((r) => r.json())
      .then((d: AcquisitionSummary | { error?: string }) => {
        if (!cancelled && !("error" in d)) {
          setAcquisition(d as AcquisitionSummary);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Top metrics ----------------------------------------------------
  const metrics = useMemo(() => {
    const now = Date.now();
    const mrrCentsByCurrency = new Map<string, number>();
    let newSignups = 0;
    let canceled = 0;
    for (const s of subs) {
      const state = effectiveBillingState(s.billing);
      if (
        (state === "active" || state === "grace") &&
        typeof s.billing?.priceCents === "number" &&
        s.billing.currency
      ) {
        const cents = monthlyEquivalentCents(
          s.billing.priceCents,
          s.billing.billingInterval,
        );
        mrrCentsByCurrency.set(
          s.billing.currency,
          (mrrCentsByCurrency.get(s.billing.currency) ?? 0) + cents,
        );
      }
      if (s.billing?.status === "canceled") canceled++;
      const createdMs = toMillis(s.createdAt);
      if (createdMs !== null && now - createdMs <= THIRTY_DAYS_MS) newSignups++;
    }
    const mrrLabel =
      mrrCentsByCurrency.size === 0
        ? formatBillingPrice(0, "usd")
        : [...mrrCentsByCurrency.entries()]
            .map(([currency, cents]) => formatBillingPrice(cents, currency))
            .join(" + ");
    return {
      totalCustomers: subs.length,
      mrrLabel,
      newSignups,
      canceled,
    };
  }, [subs]);

  // ---- Plan breakdown (customer count by plan / comped / canceled) ----
  const planBreakdown = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const s of subs) {
      const status = s.billing?.status ?? "comped";
      const key =
        status === "comped"
          ? "Comped"
          : status === "canceled"
            ? "Canceled"
            : s.billing?.planName || "Unnamed plan";
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let colorIdx = 0;
    return [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => {
        const color =
          label === "Comped"
            ? COMPED_COLOR
            : label === "Canceled"
              ? CANCELED_COLOR
              : AGENCY_DONUT_COLORS[colorIdx++ % AGENCY_DONUT_COLORS.length];
        return { label, value, color };
      });
  }, [subs]);

  // ---- Revenue overview (current MRR by plan) --------------------------
  const revenueByPlan = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const s of subs) {
      const state = effectiveBillingState(s.billing);
      if (state !== "active" && state !== "grace") continue;
      if (typeof s.billing?.priceCents !== "number") continue;
      const key = s.billing?.planName || "Unnamed plan";
      const cents = monthlyEquivalentCents(
        s.billing.priceCents,
        s.billing.billingInterval,
      );
      buckets.set(key, (buckets.get(key) ?? 0) + cents);
    }
    return [...buckets.entries()].map(([x, cents]) => ({ x, y: cents / 100 }));
  }, [subs]);

  // ---- Customer growth (real, cumulative by month of createdAt) -------
  const customerGrowth = useMemo(() => {
    const createdMsList = subs
      .map((s) => toMillis(s.createdAt))
      .filter((ms): ms is number => ms !== null)
      .sort((a, b) => a - b);
    if (createdMsList.length === 0) return [];

    const first = new Date(createdMsList[0]);
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    const now = new Date();
    const monthStarts: { label: string; startMs: number }[] = [];
    while (cursor <= now) {
      monthStarts.push({
        label: cursor.toLocaleString("en-US", { month: "short" }),
        startMs: cursor.getTime(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    // Cap to the trailing 12 months so a long-lived agency's chart stays legible.
    const trimmed = monthStarts.slice(-12);
    return trimmed.map((m, i) => {
      const nextStartMs =
        i < trimmed.length - 1 ? trimmed[i + 1].startMs : Infinity;
      const count = createdMsList.filter((ms) => ms < nextStartMs).length;
      return { x: m.label, y: count };
    });
  }, [subs]);

  // ---- Recent activity: merge real sub-account creations with real
  //      billing lifecycle events, sorted, most recent first. ------------
  const activityRows: ActivityRow[] = useMemo(() => {
    const createdRows: ActivityRow[] = subs
      .map((s) => {
        const ms = toMillis(s.createdAt);
        if (ms === null) return null;
        return {
          id: `created-${s.id}`,
          label: "New sub-account created",
          subtitle: s.name,
          occurredAtMs: ms,
          tone: ACTIVITY_ICONS.created.tone,
          Icon: ACTIVITY_ICONS.created.Icon,
        };
      })
      .filter((r): r is ActivityRow => r !== null);

    const eventRows: ActivityRow[] = (activity ?? [])
      .map((a) => {
        const ms = a.occurredAt ? new Date(a.occurredAt).getTime() : null;
        if (ms === null) return null;
        const iconDef = ACTIVITY_ICONS[a.kind] ?? ACTIVITY_ICONS.status_changed;
        return {
          id: a.id,
          label: a.label,
          subtitle: a.subAccountName,
          occurredAtMs: ms,
          tone: iconDef.tone,
          Icon: iconDef.Icon,
        };
      })
      .filter((r): r is ActivityRow => r !== null);

    return [...createdRows, ...eventRows]
      .sort((a, b) => b.occurredAtMs - a.occurredAtMs)
      .slice(0, 8);
  }, [subs, activity]);

  // ---- Top sources (compact reuse of the Acquisition summary) ---------
  const topSources = useMemo(() => {
    if (!acquisition) return [];
    return [...acquisition.bySource]
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5)
      .map((row) => ({
        label: row.key || "(direct)",
        value: row.visits,
        secondary: `${row.purchases} signup${row.purchases === 1 ? "" : "s"}`,
      }));
  }, [acquisition]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hey, {firstName}.
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with {agencyName} as a SaaS
            business.
          </p>
        </div>
        <Link
          href="/agency/sub-accounts/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create sub-account
        </Link>
      </div>

      {/* Top metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-violet-500/10"
          tone="text-violet-600 dark:text-violet-400"
          label="Total customers"
          value={metrics.totalCustomers}
          hint="Every sub-account under Magnetix, including your own workspace"
          loading={subsLoading}
        />
        <StatCard
          icon={<CreditCard className="h-4 w-4" />}
          iconBg="bg-emerald-500/10"
          tone="text-emerald-600 dark:text-emerald-400"
          label="Monthly recurring revenue"
          value={metrics.mrrLabel}
          hint="Live from Client Billing"
          loading={subsLoading}
        />
        <StatCard
          icon={<UserPlus className="h-4 w-4" />}
          iconBg="bg-sky-500/10"
          tone="text-sky-600 dark:text-sky-400"
          label="New signups"
          value={metrics.newSignups}
          hint="Sub-accounts created in the last 30 days"
          loading={subsLoading}
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          iconBg="bg-rose-500/10"
          tone="text-rose-600 dark:text-rose-400"
          label="Canceled subscriptions"
          value={metrics.canceled}
          hint="Current count, not yet a trailing rate"
          loading={subsLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Revenue overview</h2>
                  <p className="text-xs text-muted-foreground">
                    Current MRR by plan
                  </p>
                </div>
              </div>
              {revenueByPlan.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No active paid plans yet.
                </p>
              ) : (
                <BarChart data={revenueByPlan} tone="emerald" />
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <LineChart className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Customer growth</h2>
                  <p className="text-xs text-muted-foreground">
                    Cumulative sub-accounts by month
                  </p>
                </div>
              </div>
              {customerGrowth.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Not enough history yet.
                </p>
              ) : (
                <AreaChart data={customerGrowth} tone="violet" />
              )}
            </section>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
                  <PieChart className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-semibold">Plan breakdown</h2>
              </div>
              {planBreakdown.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No sub-accounts yet.
                </p>
              ) : (
                <DonutChart data={planBreakdown} size={140} />
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Radar className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Top sources</h2>
                  <p className="text-xs text-muted-foreground">
                    <Link href="/agency/acquisition" className="underline">
                      Full acquisition report
                    </Link>
                  </p>
                </div>
              </div>
              {!acquisition ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Loading…
                </p>
              ) : topSources.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No tracked visits yet.
                </p>
              ) : (
                <FunnelChart data={topSources} />
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Megaphone className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-semibold">Quick actions</h2>
              </div>
              <ul className="space-y-1">
                {QUICK_ACTIONS.map(({ href, label, Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Recent activity</h2>
            </div>
            {activity === null ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            ) : activityRows.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nothing yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {activityRows.map((row) => (
                  <li key={row.id} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${row.tone}`}
                    >
                      <row.Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {row.label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.subtitle}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(new Date(row.occurredAtMs))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold">Upcoming events</h2>
            </div>
            <p className="py-4 text-center text-xs text-muted-foreground">
              No upcoming events yet. Office hours, customer trainings, and
              launch events will show up here once scheduled.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
