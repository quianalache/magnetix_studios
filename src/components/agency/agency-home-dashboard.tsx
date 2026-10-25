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
  Activity,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, DonutChart, FunnelChart } from "@/components/reports/charts";
import { PageHeader } from "@/components/system/page-header";
import { MetricCard } from "@/components/system/metric-card";
import { cn } from "@/lib/utils";
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
 *
 * CANONICAL VISIBILITY RULE (2026-09-16 shell-separation fix): every count
 * on this dashboard comes from a direct `subAccounts` query, never from
 * `memberships` (the per-viewer `userMemberships` index the workspace
 * switcher renders from). That index is scoped to "workspaces THIS viewer
 * belongs to" and can go stale if a sub-account is ever deleted through a
 * path that doesn't prune it — which is exactly what happened to a QA
 * fixture ("QA Acquisition Foundation Test", #1010): its `subAccounts` doc
 * was gone, but a `userMemberships` pointer to it lingered, so the switcher
 * and this dashboard's old "Sub-accounts" tab (since removed — see below)
 * showed 3 workspaces while the dedicated /agency/sub-accounts page,
 * already querying `subAccounts` directly, correctly showed 2. Any new
 * "how many sub-accounts exist" surface must query `subAccounts` by
 * `agencyId`, not read `memberships`.
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
  signup: { Icon: UserPlus, tone: "bg-status-success-bg text-status-success-fg" },
  activated: { Icon: CreditCard, tone: "bg-status-success-bg text-status-success-fg" },
  plan_assigned: { Icon: ArrowRightLeft, tone: "bg-tag-violet-bg text-tag-violet-fg" },
  plan_switched: { Icon: ArrowRightLeft, tone: "bg-tag-violet-bg text-tag-violet-fg" },
  comped: { Icon: Gift, tone: "bg-tag-blue-bg text-tag-blue-fg" },
  payment_failed: { Icon: AlertTriangle, tone: "bg-status-danger-bg text-status-danger-fg" },
  payment_recovered: { Icon: CheckCircle2, tone: "bg-status-success-bg text-status-success-fg" },
  canceled: { Icon: XCircle, tone: "bg-status-danger-bg text-status-danger-fg" },
  reactivated: { Icon: RefreshCcw, tone: "bg-status-success-bg text-status-success-fg" },
  status_changed: { Icon: Info, tone: "bg-status-neutral-bg text-status-neutral-fg" },
  created: { Icon: Plus, tone: "bg-tag-violet-bg text-tag-violet-fg" },
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
  { href: "/agency/acquisition", label: "View traffic & signups", Icon: Radar },
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
    const buckets = new Map<string, { cents: number; currency: string }>();
    for (const s of subs) {
      const state = effectiveBillingState(s.billing);
      if (state !== "active" && state !== "grace") continue;
      if (typeof s.billing?.priceCents !== "number") continue;
      const currency = s.billing.currency || "usd";
      const key = `${s.billing?.planName || "Unnamed plan"}${currency === "usd" ? "" : ` (${currency.toUpperCase()})`}`;
      const cents = monthlyEquivalentCents(
        s.billing.priceCents,
        s.billing.billingInterval,
      );
      const prev = buckets.get(key);
      buckets.set(key, { cents: (prev?.cents ?? 0) + cents, currency });
    }
    return [...buckets.entries()]
      .sort((a, b) => b[1].cents - a[1].cents)
      .map(([label, v]) => ({
        label,
        value: v.cents,
        currency: v.currency,
        tone: "bg-primary",
      }));
  }, [subs]);

  const revenueCurrency = useMemo(() => {
    const set = new Set(revenueByPlan.map((r) => r.currency));
    return set.size === 1 ? [...set][0] : null;
  }, [revenueByPlan]);

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
        tone: "bg-tag-violet-fg",
      }));
  }, [acquisition]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Agency home"
        title={`Hey, ${firstName}.`}
        description={`Here's what's happening with ${agencyName} as a SaaS business.`}
        actions={
          <Button render={<Link href="/agency/sub-accounts/new" />}>
            <Plus />
            Create sub-account
          </Button>
        }
      />

      {/* Top metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={Users}
          tone="violet"
          label="Total customers"
          value={metrics.totalCustomers}
          hint="Including your own workspace"
          href="/agency/sub-accounts"
          loading={subsLoading}
        />
        <MetricCard
          icon={CreditCard}
          tone="aqua"
          label="Monthly recurring revenue"
          value={metrics.mrrLabel}
          hint="Live from Client Billing"
          href="/agency/billing"
          loading={subsLoading}
        />
        <MetricCard
          icon={UserPlus}
          tone="blue"
          label="New signups"
          value={metrics.newSignups}
          hint="Created in the last 30 days"
          loading={subsLoading}
        />
        <MetricCard
          icon={TrendingDown}
          tone="pink"
          label="Canceled subscriptions"
          value={metrics.canceled}
          hint="Current count"
          loading={subsLoading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DashCard icon={BarChart3} tone="aqua" title="Revenue overview" description="Current MRR by plan">
          {revenueByPlan.length === 0 ? (
            <DashEmpty>No active paid plans yet.</DashEmpty>
          ) : (
            <FunnelChart
              data={revenueByPlan.map((row) => ({
                label: row.label,
                value: row.value,
                tone: row.tone,
                // Mixed currencies: show each amount in its own currency.
                secondary: revenueCurrency ? undefined : formatBillingPrice(row.value, row.currency),
              }))}
              formatValue={revenueCurrency ? (v) => formatBillingPrice(v, revenueCurrency) : () => ""}
            />
          )}
        </DashCard>

        <DashCard icon={LineChart} tone="violet" title="Customer growth" description="Cumulative sub-accounts by month">
          {customerGrowth.length === 0 ? (
            <DashEmpty>Not enough history yet.</DashEmpty>
          ) : (
            <AreaChart data={customerGrowth} tone="violet" />
          )}
        </DashCard>

        <DashCard icon={PieChart} tone="pink" title="Plan breakdown" description="Customers by plan" className="md:col-span-2 lg:col-span-1">
          {planBreakdown.length === 0 ? (
            <DashEmpty>No sub-accounts yet.</DashEmpty>
          ) : (
            <DonutChart data={planBreakdown} size={112} />
          )}
        </DashCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DashCard
          icon={Radar}
          tone="blue"
          title="Top sources"
          description={
            <Link href="/agency/acquisition" className="font-medium text-link hover:underline">
              Full traffic &amp; signups report
            </Link>
          }
        >
          {!acquisition ? (
            <Skeleton className="h-20 w-full" />
          ) : topSources.length === 0 ? (
            <DashEmpty>No tracked visits yet.</DashEmpty>
          ) : (
            <FunnelChart data={topSources} />
          )}
        </DashCard>

        <DashCard icon={Activity} tone="violet" title="Recent activity" description="Sign-ups and billing changes">
          {activity === null ? (
            <Skeleton className="h-20 w-full" />
          ) : activityRows.length === 0 ? (
            <DashEmpty>Nothing yet.</DashEmpty>
          ) : (
            <ul className="space-y-3">
              {activityRows.map((row) => (
                <li key={row.id} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-chip ${row.tone}`}>
                    <row.Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium text-foreground">{row.label}</p>
                    <p className="truncate text-caption text-muted-foreground">{row.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-micro text-muted-foreground">
                    {formatRelativeTime(new Date(row.occurredAtMs))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1">
          <DashCard icon={Megaphone} tone="gold" title="Quick actions">
            <ul className="-mx-2 flex flex-col">
              {QUICK_ACTIONS.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-body-sm font-medium text-foreground transition-colors hover:bg-tint-violet"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </DashCard>

          <DashCard icon={CalendarClock} tone="gold" title="Upcoming events">
            <DashEmpty>
              No upcoming events yet. Office hours, customer trainings, and launch events will show up here once
              scheduled.
            </DashEmpty>
          </DashCard>
        </div>
      </div>
    </div>
  );
}

const CHIP: Record<"violet" | "aqua" | "pink" | "blue" | "gold", string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
};

/** One white dashboard card: tinted icon chip, title, helper, content. */
function DashCard({
  icon: Icon,
  tone,
  title,
  description,
  className,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof CHIP;
  title: string;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-card border border-border bg-card p-5 shadow-card", className)}>
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-chip", CHIP[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-section font-semibold text-foreground">{title}</h2>
          {description ? <p className="text-caption text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function DashEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-caption text-muted-foreground">{children}</p>;
}
