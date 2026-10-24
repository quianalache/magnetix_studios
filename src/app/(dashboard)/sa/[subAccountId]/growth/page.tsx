"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Trash2,
  DollarSign, Wallet, Activity, Percent, CheckCircle2, Clock, Share2,
  Target, Sparkles, NotebookPen, Gauge, LayoutTemplate, Users, ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToGoals,
  subscribeToMoneyEntries,
  subscribeToPagePerformance,
  subscribeToSocialPlatforms,
} from "@/lib/firestore/growth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { MetricCard } from "@/components/system/metric-card";
import { SectionHeader } from "@/components/system/section-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { cn } from "@/lib/utils";
import { goalProgressPct } from "@/types/growth";
import type { Goal, MoneyEntry, PagePerformance, SocialPlatform } from "@/types/growth";

/**
 * Growth — Magnetix Visual Direction 2 (2026-10-23). Six areas behind one
 * underline tab row: Overview, Social, Money, Goals, Business Pulse and
 * Weekly Review. Same data paths as the MomentumOS port it replaces
 * (Firestore subscriptions + the /growth API group); only the presentation
 * moved onto the shared system (PageShell, PageHeader, MetricCard, Card,
 * SegmentedControl, StatusPill/Tag, EmptyState, useConfirm).
 *
 * The old tile-colour exception (each stat tile on its own tinted
 * background) is kept as MEANING, not as background: every metric keeps a
 * consistent accent on its icon chip (income = green, expenses = pink,
 * MRR = violet, cash flow = aqua, profit = gold), and a negative amount turns
 * the value red — so the scan-by-colour still works on white cards.
 */

type GrowthTab = "overview" | "social" | "money" | "goals" | "pulse" | "review";
const TAB_IDS: GrowthTab[] = ["overview", "social", "money", "goals", "pulse", "review"];

type MoneyStats = {
  incomeThisMonth: number;
  expensesThisMonth: number;
  currentMrr: number;
  mrrRecordCount: number;
  projectedCashFlow: number;
  netProfitLoss: number;
};

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  // Whole amounts stay whole ($97); anything with cents shows both digits ($4,339.50).
  const cents = Math.round(abs * 100) % 100 !== 0;
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}
function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}
function weekStartOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diff);
  return monday;
}

/** fetch + a toast on failure; resolves true only when the server said OK. */
async function send(url: string, init: RequestInit, failMessage: string): Promise<boolean> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(String(res.status));
    return true;
  } catch {
    toast.error(failMessage);
    return false;
  }
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** A money value that turns red when negative (meaning, not decoration). */
function Amount({ value }: { value: number }) {
  return <span className={cn("tabular-nums", value < 0 && "text-destructive")}>{fmtMoney(value)}</span>;
}

export default function GrowthPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [tab, setTabState] = useState<GrowthTab>("overview");

  // The active tab lives in ?tab= so a refresh or a shared link keeps it.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as GrowthTab | null;
    if (requested && TAB_IDS.includes(requested)) setTabState(requested);
  }, []);
  function setTab(next: GrowthTab) {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [money, setMoney] = useState<MoneyEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pages, setPages] = useState<PagePerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [moneyStats, setMoneyStats] = useState<MoneyStats | null>(null);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    setLoadError(false);
    const scope = { agencyId, subAccountId };
    let a = false, b = false, c = false, d = false;
    const settle = () => {
      if (a && b && c && d) setLoading(false);
    };
    // A failed subscription used to leave the page on its skeleton forever.
    const fail = () => {
      setLoadError(true);
      setLoading(false);
    };
    const u1 = subscribeToSocialPlatforms(scope, (l) => { setPlatforms(l); a = true; settle(); }, fail);
    const u2 = subscribeToMoneyEntries(scope, (l) => { setMoney(l); b = true; settle(); }, fail);
    const u3 = subscribeToGoals(scope, (l) => { setGoals(l); c = true; settle(); }, fail);
    const u4 = subscribeToPagePerformance(scope, (l) => { setPages(l); d = true; settle(); }, fail);
    return () => { u1(); u2(); u3(); u4(); };
  }, [user, agencyId, subAccountId, authLoading, attempt]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/growth/money/stats`)
      .then(async (res) => {
        if (res.ok && !cancelled) setMoneyStats((await res.json()).stats);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [subAccountId, money]);

  const TABS: { id: GrowthTab; label: string; icon: typeof Sparkles }[] = [
    { id: "overview", label: "Overview", icon: Sparkles },
    { id: "social", label: "Social", icon: Share2 },
    { id: "money", label: "Money", icon: DollarSign },
    { id: "goals", label: "Goals", icon: Target },
    { id: "pulse", label: "Business Pulse", icon: Activity },
    { id: "review", label: "Weekly Review", icon: NotebookPen },
  ];

  const activeGoals = useMemo(() => goals.filter((g) => g.status === "active"), [goals]);

  return (
    <PageShell width="data">
      <PageHeader
        title="Growth"
        icon={TrendingUp}
        accent="orbit"
        description="Track platforms, revenue, goals, weekly progress, and what needs your attention."
      />

      {/* Scrolls sideways on phones instead of wrapping into a second row. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as GrowthTab)}>
          <TabsList variant="underline" className="gap-5">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.id} value={t.id}>
                  <Icon aria-hidden="true" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-card" />
        </div>
      ) : loadError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load your Growth data"
          description="Check your connection and try again. If it keeps happening, your access to this workspace may have changed."
          action={<Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
        />
      ) : (
        <>
          {tab === "overview" && (
            <OverviewPanel
              moneyStats={moneyStats}
              platforms={platforms}
              transactions={money.slice(0, 5)}
              activeGoals={activeGoals}
              onGoto={setTab}
            />
          )}
          {tab === "social" && <SocialPanel subAccountId={subAccountId} platforms={platforms} />}
          {tab === "money" && <MoneyPanel subAccountId={subAccountId} entries={money} stats={moneyStats} />}
          {tab === "goals" && <GoalsPanel subAccountId={subAccountId} goals={goals} />}
          {tab === "pulse" && <PulsePanel subAccountId={subAccountId} pages={pages} />}
          {tab === "review" && <WeeklyReviewPanel subAccountId={subAccountId} />}
        </>
      )}
    </PageShell>
  );
}

// ── Overview ────────────────────────────────────────────────────────────

function ViewAll({ onClick, children = "View all" }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-body-sm font-semibold text-link hover:underline">
      {children}
    </button>
  );
}

function OverviewPanel({
  moneyStats,
  platforms,
  transactions,
  activeGoals,
  onGoto,
}: {
  moneyStats: MoneyStats | null;
  platforms: SocialPlatform[];
  transactions: MoneyEntry[];
  activeGoals: Goal[];
  onGoto: (t: GrowthTab) => void;
}) {
  const cashFlow = moneyStats?.projectedCashFlow ?? 0;
  const profit = moneyStats?.netProfitLoss ?? 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard icon={DollarSign} tone="green" label="Income this month" value={fmtMoney(moneyStats?.incomeThisMonth ?? 0)} hint="Paid entries only" />
        <MetricCard icon={TrendingDown} tone="pink" label="Expenses this month" value={fmtMoney(moneyStats?.expensesThisMonth ?? 0)} hint="All logged expenses" />
        <MetricCard icon={Wallet} tone="violet" label="Current MRR" value={fmtMoney(moneyStats?.currentMrr ?? 0)} hint={`${moneyStats?.mrrRecordCount ?? 0} active recurring`} />
        <MetricCard icon={Gauge} tone="aqua" label="Projected cash flow" value={<Amount value={cashFlow} />} hint="MRR − recurring expenses" />
        <MetricCard icon={TrendingUp} tone="gold" label="Net profit / loss" value={<Amount value={profit} />} hint="This month" />
        {/* Same anatomy as MetricCard; the whole tile opens Goals. */}
        <button
          type="button"
          onClick={() => onGoto("goals")}
          className="flex min-w-0 flex-col items-start gap-2 rounded-card border border-border bg-card p-3 text-left shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-3.5 sm:p-4"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag-blue-bg text-tag-blue-fg sm:size-11">
            <Target className="size-4 sm:size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-caption text-muted-foreground">Money goal</span>
            <span className="block truncate text-title-md font-semibold tracking-tight text-foreground sm:text-title-lg">Not set</span>
            <span className="block truncate text-caption font-semibold text-link">Set a goal →</span>
          </span>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="gap-3 p-5">
          <SectionHeader as="h3" icon={Users} title="Social growth" action={<ViewAll onClick={() => onGoto("social")} />} />
          {platforms.length === 0 ? (
            <EmptyState compact icon={Share2} title="No platforms yet" description="Track follower counts for the platforms you grow." action={<Button size="sm" variant="secondary" onClick={() => onGoto("social")}>Add platform</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {platforms.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-body-sm">
                  <span className="truncate font-medium">{p.platform}</span>
                  {toDate(p.startedAt) && <span className="shrink-0 text-caption text-muted-foreground">since {toDate(p.startedAt)!.toLocaleDateString()}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-3 p-5">
          <SectionHeader as="h3" icon={DollarSign} title="Recent transactions" action={<ViewAll onClick={() => onGoto("money")} />} />
          {transactions.length === 0 ? (
            <EmptyState compact icon={Wallet} title="Nothing logged yet" description="Income and expenses you log in Money show up here." action={<Button size="sm" variant="secondary" onClick={() => onGoto("money")}>Log income</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {transactions.map((t) => (
                <TransactionRow key={t.id} entry={t} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="space-y-3">
        <SectionHeader icon={Target} title="Active goals" action={activeGoals.length > 0 ? <ViewAll onClick={() => onGoto("goals")} /> : undefined} />
        {activeGoals.length === 0 ? (
          <EmptyState compact icon={Target} title="No active goals" description="Set a target and track progress toward it." action={<Button size="sm" onClick={() => onGoto("goals")}>New goal</Button>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeGoals.slice(0, 3).map((g) => (
              <GoalCard key={g.id} goal={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TransactionRow({ entry: t, onRemove }: { entry: MoneyEntry; onRemove?: () => void }) {
  const income = t.kind === "income";
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-body-sm font-medium">{t.title}</p>
        <p className="text-caption text-muted-foreground">
          {toDate(t.date)?.toLocaleDateString() ?? "Undated"} · {income ? "Income" : "Expense"}
          {t.recurring ? " · Recurring" : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn("text-body-sm font-semibold tabular-nums", income ? "text-status-success-fg" : "text-destructive")}>
          {income ? "+" : "−"}
          {fmtMoney(Math.abs(t.amount))}
        </span>
        {onRemove && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Delete ${t.title}`} title="Delete">
            <Trash2 className="text-muted-foreground" />
          </Button>
        )}
      </div>
    </li>
  );
}

function GoalCard({ goal, children }: { goal: Goal; children?: React.ReactNode }) {
  const pct = goalProgressPct(goal);
  const done = goal.status === "completed";
  return (
    <Card size="sm" className="gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-section font-semibold text-foreground" title={goal.name}>{goal.name}</p>
          <p className="truncate text-caption text-muted-foreground">{goal.type}</p>
        </div>
        <StatusPill status={done ? "completed" : "active"}>{done ? "Completed" : "Active"}</StatusPill>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-title-md font-bold tabular-nums">{goal.current.toLocaleString()}</span>
        <span className="text-body-sm text-muted-foreground">of {goal.target.toLocaleString()}</span>
      </div>
      <div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${goal.name} progress`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={cn("h-full rounded-full", done ? "bg-status-success-dot" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-caption text-muted-foreground">
          <span>
            {(goal.startAt || goal.endAt) && (
              <>
                {toDate(goal.startAt)?.toLocaleDateString() ?? "…"} → {toDate(goal.endAt)?.toLocaleDateString() ?? "…"}
              </>
            )}
          </span>
          <span className="font-semibold text-foreground">{pct}%</span>
        </div>
      </div>
      {children}
    </Card>
  );
}

// ── Social ──────────────────────────────────────────────────────────────

function SocialPanel({ subAccountId, platforms }: { subAccountId: string; platforms: SocialPlatform[] }) {
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logCount, setLogCount] = useState("");
  const [latest, setLatest] = useState<Record<string, number>>({});

  useEffect(() => {
    platforms.forEach(async (p) => {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/growth/social/${p.id}/logs`).catch(() => null);
      if (res?.ok) {
        const { logs } = (await res.json()) as { logs: { count: number }[] };
        setLatest((prev) => ({ ...prev, [p.id]: logs[0]?.count ?? 0 }));
      }
    });
  }, [platforms, subAccountId]);

  async function addPlatform() {
    if (!name.trim()) return;
    if (!(await send(`/api/sub-accounts/${subAccountId}/growth/social`, json("POST", { platform: name.trim() }), "Couldn't add the platform."))) return;
    setName("");
    setAdding(false);
    toast.success("Platform added");
  }
  async function removePlatform(p: SocialPlatform) {
    if (!(await confirm({ title: `Remove ${p.platform}?`, description: "Its logged counts are removed too. This can't be undone.", confirmLabel: "Remove", tone: "danger" }))) return;
    if (await send(`/api/sub-accounts/${subAccountId}/growth/social/${p.id}`, { method: "DELETE" }, "Couldn't remove the platform.")) toast.success("Platform removed");
  }
  async function addLog(platformId: string) {
    const count = Number(logCount);
    if (logCount === "" || !Number.isFinite(count)) return;
    if (!(await send(`/api/sub-accounts/${subAccountId}/growth/social/${platformId}/logs`, json("POST", { count }), "Couldn't save the count."))) return;
    setLogFor(null);
    setLogCount("");
    setLatest((prev) => ({ ...prev, [platformId]: count }));
    toast.success("Logged");
  }

  return (
    <div className="space-y-4">
      {dialog}
      <SectionHeader
        title="Social metrics"
        description="Track your platform growth over time."
        action={
          <Button onClick={() => setAdding((v) => !v)}>
            <Plus />
            Add platform
          </Button>
        }
      />

      {adding && (
        <Card size="sm" className="max-w-md p-4">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              addPlatform();
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="growth-platform">Platform</Label>
              <Input id="growth-platform" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. YouTube" autoFocus />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!name.trim()}>Add</Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {platforms.length === 0 && !adding ? (
        <EmptyState icon={Share2} title="No platforms yet" description="Add a platform, then log its follower or subscriber count as it grows." action={<Button onClick={() => setAdding(true)}><Plus />Add platform</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((p) => (
            <Card key={p.id} size="sm" className="gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-section font-semibold">{p.platform}</p>
                  {toDate(p.startedAt) && <p className="text-caption text-muted-foreground">Started {toDate(p.startedAt)!.toLocaleDateString()}</p>}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => removePlatform(p)} aria-label={`Remove ${p.platform}`} title="Remove">
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
              <div>
                <p className="text-title-lg font-bold tabular-nums">{(latest[p.id] ?? 0).toLocaleString()}</p>
                <p className="text-caption text-muted-foreground">followers / subscribers</p>
              </div>
              {logFor === p.id ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addLog(p.id);
                  }}
                >
                  <Input type="number" inputMode="numeric" value={logCount} onChange={(e) => setLogCount(e.target.value)} placeholder="Count" aria-label={`${p.platform} count`} autoFocus />
                  <Button type="submit" disabled={logCount === ""}>Save</Button>
                </form>
              ) : (
                <Button variant="secondary" className="w-full" onClick={() => setLogFor(p.id)}>
                  <Plus />
                  Add daily log
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Money ───────────────────────────────────────────────────────────────

function MoneyPanel({ subAccountId, entries, stats }: { subAccountId: string; entries: MoneyEntry[]; stats: MoneyStats | null }) {
  const { confirm, dialog } = useConfirm();
  const [moneyTab, setMoneyTab] = useState<"income" | "expenses">("income");
  const [formOpen, setFormOpen] = useState<"income" | "expense" | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const incomeCount = entries.filter((e) => e.kind === "income").length;
  const expenseCount = entries.length - incomeCount;
  const shown = entries.filter((e) => (moneyTab === "income" ? e.kind === "income" : e.kind === "expense"));
  const grouped = useMemo(() => {
    const map = new Map<string, MoneyEntry[]>();
    for (const e of shown) {
      const d = toDate(e.date);
      const key = d ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Undated";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()];
  }, [shown]);
  const expanded = openMonth ?? grouped[0]?.[0] ?? null;

  async function submitEntry() {
    if (!formOpen || !title.trim() || !amount) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt)) return;
    const kind = formOpen;
    if (!(await send(`/api/sub-accounts/${subAccountId}/growth/money`, json("POST", { kind, title: title.trim(), amount: amt, recurring }), "Couldn't save the entry."))) return;
    setTitle("");
    setAmount("");
    setRecurring(false);
    setFormOpen(null);
    setMoneyTab(kind === "income" ? "income" : "expenses");
    toast.success(kind === "income" ? "Income logged" : "Expense logged");
  }
  async function removeEntry(e: MoneyEntry) {
    if (!(await confirm({ title: `Delete “${e.title}”?`, description: `${fmtMoney(e.amount)} · this can't be undone.`, confirmLabel: "Delete", tone: "danger" }))) return;
    if (await send(`/api/sub-accounts/${subAccountId}/growth/money/${e.id}`, { method: "DELETE" }, "Couldn't delete the entry.")) toast.success("Entry deleted");
  }

  return (
    <div className="space-y-4">
      {dialog}
      <SectionHeader
        title="Money tracker"
        description="Track income and expenses for your business."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setFormOpen("expense")}>
              <Plus />
              Add expense
            </Button>
            <Button onClick={() => setFormOpen("income")}>
              <Plus />
              Log income
            </Button>
          </div>
        }
      />

      {formOpen && (
        <Card size="sm" className="p-4">
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              submitEntry();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="money-title">{formOpen === "income" ? "Income source" : "Expense"}</Label>
              <Input id="money-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={formOpen === "income" ? "e.g. Client retainer" : "What was it for?"} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="money-amount">Amount</Label>
              <Input id="money-amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <label className="flex h-(--ds-control-md) items-center gap-2 text-body-sm text-foreground">
              <Checkbox checked={recurring} onCheckedChange={(v) => setRecurring(!!v)} />
              Recurring
            </label>
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={!title.trim() || !amount}>{formOpen === "income" ? "Save income" : "Save expense"}</Button>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard className="col-span-2 sm:col-span-1" icon={TrendingUp} tone="gold" label="Net this month" value={<Amount value={stats?.netProfitLoss ?? 0} />} hint="Income − expenses" />
        <MetricCard icon={DollarSign} tone="green" label="Income this month" value={fmtMoney(stats?.incomeThisMonth ?? 0)} hint="Paid entries only" />
        <MetricCard icon={Wallet} tone="violet" label="Current MRR" value={fmtMoney(stats?.currentMrr ?? 0)} hint={`${stats?.mrrRecordCount ?? 0} active recurring`} />
      </div>

      <SegmentedControl
        value={moneyTab}
        onChange={setMoneyTab}
        options={[
          { value: "income", label: `Income (${incomeCount})` },
          { value: "expenses", label: `Expenses (${expenseCount})` },
        ]}
      />

      {grouped.length === 0 ? (
        <EmptyState
          icon={moneyTab === "income" ? DollarSign : TrendingDown}
          title={moneyTab === "income" ? "No income logged yet" : "No expenses logged yet"}
          description="Entries are grouped by month so you can see each month's total at a glance."
          action={<Button onClick={() => setFormOpen(moneyTab === "income" ? "income" : "expense")}><Plus />{moneyTab === "income" ? "Log income" : "Add expense"}</Button>}
        />
      ) : (
        <Card className="gap-0 p-0">
          {grouped.map(([month, list], i) => {
            const total = list.reduce((s, e) => s + e.amount, 0);
            const open = expanded === month;
            return (
              <div key={month} className={cn(i > 0 && "border-t border-border")}>
                <button
                  type="button"
                  onClick={() => setOpenMonth(open ? "" : month)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 text-body-sm font-semibold">
                    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden="true" />
                    {month}
                  </span>
                  <span className="text-body-sm text-muted-foreground">
                    {list.length} {list.length === 1 ? "entry" : "entries"} · <span className="font-semibold text-foreground tabular-nums">{fmtMoney(total)}</span>
                  </span>
                </button>
                {open && (
                  <ul className="divide-y divide-border border-t border-border px-4">
                    {list.map((e) => (
                      <TransactionRow key={e.id} entry={e} onRemove={() => removeEntry(e)} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ── Goals ───────────────────────────────────────────────────────────────

function GoalsPanel({ subAccountId, goals }: { subAccountId: string; goals: Goal[] }) {
  const [goalsTab, setGoalsTab] = useState<"active" | "history">("active");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const active = goals.filter((g) => g.status === "active");
  const history = goals.filter((g) => g.status === "completed");

  async function createGoal() {
    if (!name.trim() || !target) return;
    const ok = await send(
      `/api/sub-accounts/${subAccountId}/growth/goals`,
      json("POST", { name: name.trim(), type: type.trim() || "Custom", target: Number(target), current: Number(current) || 0 }),
      "Couldn't create the goal.",
    );
    if (!ok) return;
    setName(""); setType(""); setTarget(""); setCurrent("");
    setOpen(false);
    setGoalsTab("active");
    toast.success("Goal created");
  }
  async function saveProgress(g: Goal) {
    const value = Number(progress);
    if (progress === "" || !Number.isFinite(value)) return;
    if (!(await send(`/api/sub-accounts/${subAccountId}/growth/goals/${g.id}`, json("PATCH", { current: value }), "Couldn't update progress."))) return;
    setUpdating(null);
    setProgress("");
    toast.success("Progress updated");
  }
  async function markDone(g: Goal) {
    if (await send(`/api/sub-accounts/${subAccountId}/growth/goals/${g.id}`, json("PATCH", { status: "completed" }), "Couldn't complete the goal.")) toast.success("Goal completed");
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Goals + progress"
        description="Set and track your business and growth goals."
        action={
          <Button onClick={() => setOpen((v) => !v)}>
            <Plus />
            New goal
          </Button>
        }
      />

      {open && (
        <Card size="sm" className="max-w-xl p-4">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createGoal();
            }}
          >
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="goal-name">Goal name</Label>
              <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 10k YouTube subscribers" autoFocus />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="goal-type">Type</Label>
              <Input id="goal-type" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Followers / Subscribers (optional)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input id="goal-target" value={target} onChange={(e) => setTarget(e.target.value)} type="number" inputMode="decimal" placeholder="10000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-current">Current</Label>
              <Input id="goal-current" value={current} onChange={(e) => setCurrent(e.target.value)} type="number" inputMode="decimal" placeholder="0 (optional)" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={!name.trim() || !target}>Create goal</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <SegmentedControl
        value={goalsTab}
        onChange={setGoalsTab}
        options={[
          { value: "active", label: `Active (${active.length})` },
          { value: "history", label: `Completed (${history.length})` },
        ]}
      />

      {goalsTab === "active" ? (
        active.length === 0 ? (
          <EmptyState icon={Target} title="No active goals" description="Set a target — followers, revenue, launches — and update progress as you go." action={<Button onClick={() => setOpen(true)}><Plus />New goal</Button>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((g) => (
              <GoalCard key={g.id} goal={g}>
                {updating === g.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveProgress(g);
                    }}
                  >
                    <Input type="number" inputMode="decimal" value={progress} onChange={(e) => setProgress(e.target.value)} aria-label={`${g.name} current value`} autoFocus />
                    <Button type="submit" disabled={progress === ""}>Save</Button>
                    <Button type="button" variant="ghost" onClick={() => setUpdating(null)}>Cancel</Button>
                  </form>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setUpdating(g.id); setProgress(String(g.current)); }}>
                      Update progress
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => markDone(g)}>
                      <CheckCircle2 />
                      Complete
                    </Button>
                  </div>
                )}
              </GoalCard>
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No completed goals yet" description="Goals you complete are kept here as a record of what you've achieved." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {history.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  );
}

// ── Business Pulse ──────────────────────────────────────────────────────

function PulsePanel({ subAccountId, pages }: { subAccountId: string; pages: PagePerformance[] }) {
  const { confirm, dialog } = useConfirm();
  const [pulseTab, setPulseTab] = useState<"pages" | "funnels">("pages");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const { saPath } = useSubAccount();

  async function addPage() {
    if (!title.trim()) return;
    if (!(await send(`/api/sub-accounts/${subAccountId}/growth/pages`, json("POST", { title: title.trim(), url: url.trim(), pageType: "Sales Page" }), "Couldn't add the page."))) return;
    setTitle(""); setUrl(""); setOpen(false);
    toast.success("Page added");
  }
  async function removePage(p: PagePerformance) {
    if (!(await confirm({ title: `Stop tracking “${p.title}”?`, description: "It's removed from Business Pulse. Your actual page isn't affected.", confirmLabel: "Remove", tone: "danger" }))) return;
    if (await send(`/api/sub-accounts/${subAccountId}/growth/pages/${p.id}`, { method: "DELETE" }, "Couldn't remove the page.")) toast.success("Page removed");
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Nothing records impressions or conversions for pages tracked here
            (rows are hand-entered links, not tied to a Magnetix page), so
            these show "—", never a measured-looking 0. */}
        <MetricCard className="col-span-2 sm:col-span-1" icon={Activity} tone="violet" label="Total impressions" value="—" hint="Not tracked yet" />
        <MetricCard icon={TrendingUp} tone="green" label="Total conversions" value="—" hint="Not tracked yet" />
        <MetricCard icon={Percent} tone="aqua" label="Avg. conversion rate" value="—" hint="Not tracked yet" />
      </div>
      <p className="text-caption text-muted-foreground">
        Impressions and conversions aren&apos;t measured for pages added here yet. Measured visits and conversions for booking pages, Offers and Reading Tools are in{" "}
        <Link href={saPath("/reports")} className="font-medium text-link hover:underline">
          Reports → Attribution
        </Link>
        .
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={pulseTab}
          onChange={setPulseTab}
          options={[
            { value: "pages", label: "Page performance" },
            { value: "funnels", label: "Funnel performance" },
          ]}
        />
        {pulseTab === "pages" && (
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            <Plus />
            Add page
          </Button>
        )}
      </div>

      {pulseTab === "pages" ? (
        <div className="space-y-3">
          {open && (
            <Card size="sm" className="p-4">
              <form
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  addPage();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="pulse-title">Page title</Label>
                  <Input id="pulse-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Free guide landing" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pulse-url">URL</Label>
                  <Input id="pulse-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={!title.trim()}>Save</Button>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}
          {pages.length === 0 ? (
            <EmptyState icon={LayoutTemplate} title="No pages tracked yet" description="Add the pages you want to keep an eye on here." />
          ) : (
            <Card className="gap-0 p-0">
              <ul className="divide-y divide-border">
                {pages.map((p) => {
                  return (
                    <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-semibold">{p.title}</p>
                        <p className="text-caption text-muted-foreground">{p.pageType}</p>
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noreferrer" className="block truncate text-caption text-link hover:underline">
                            {p.url}
                          </a>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <dl className="flex gap-4 text-caption">
                          <div><dt className="text-muted-foreground">Impressions</dt><dd className="font-semibold text-muted-foreground" title="Not tracked yet">—</dd></div>
                          <div><dt className="text-muted-foreground">Conversions</dt><dd className="font-semibold text-muted-foreground" title="Not tracked yet">—</dd></div>
                          <div><dt className="text-muted-foreground">Rate</dt><dd className="font-semibold text-muted-foreground" title="Not tracked yet">—</dd></div>
                        </dl>
                        <Button variant="ghost" size="icon-sm" onClick={() => removePage(p)} aria-label={`Stop tracking ${p.title}`} title="Remove">
                          <Trash2 className="text-muted-foreground" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      ) : (
        <EmptyState icon={Activity} title="Funnel performance is coming soon" description="Funnel results will appear here once funnels are available in Pages & Funnels." />
      )}
    </div>
  );
}

// ── Weekly Review ───────────────────────────────────────────────────────

function WeeklyReviewPanel({ subAccountId }: { subAccountId: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekStats, setWeekStats] = useState<{ tasksCompleted: number; incomeThisWeek: number; momentumScorePct: number | null } | null>(null);
  const [review, setReview] = useState({
    hoursTracked: "0",
    biggestWin: "",
    lessonLearned: "",
    needsAttention: "",
    priority1: "",
    priority2: "",
    priority3: "",
    revenueGoal: "",
  });
  const [saving, setSaving] = useState(false);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return weekStartOf(d);
  }, [weekOffset]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const iso = weekStart.toISOString();
      const [statsRes, reviewRes] = await Promise.all([
        fetch(`/api/sub-accounts/${subAccountId}/growth/week-stats?weekStart=${encodeURIComponent(iso)}`),
        fetch(`/api/sub-accounts/${subAccountId}/growth/weekly-review?weekStart=${encodeURIComponent(iso)}`),
      ]);
      if (cancelled) return;
      if (statsRes.ok) setWeekStats((await statsRes.json()).stats);
      if (reviewRes.ok) {
        const { review: r } = (await reviewRes.json()) as { review: Record<string, unknown> | null };
        setReview({
          hoursTracked: r ? String(r.hoursTracked ?? 0) : "0",
          biggestWin: (r?.biggestWin as string) ?? "",
          lessonLearned: (r?.lessonLearned as string) ?? "",
          needsAttention: (r?.needsAttention as string) ?? "",
          priority1: (r?.priority1 as string) ?? "",
          priority2: (r?.priority2 as string) ?? "",
          priority3: (r?.priority3 as string) ?? "",
          revenueGoal: r?.revenueGoal != null ? String(r.revenueGoal) : "",
        });
      } else {
        setReview({ hoursTracked: "0", biggestWin: "", lessonLearned: "", needsAttention: "", priority1: "", priority2: "", priority3: "", revenueGoal: "" });
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [subAccountId, weekStart]);

  async function save() {
    setSaving(true);
    try {
      const ok = await send(
        `/api/sub-accounts/${subAccountId}/growth/weekly-review`,
        json("PUT", {
          weekStart: weekStart.toISOString(),
          hoursTracked: Number(review.hoursTracked) || 0,
          biggestWin: review.biggestWin,
          lessonLearned: review.lessonLearned,
          needsAttention: review.needsAttention,
          priority1: review.priority1,
          priority2: review.priority2,
          priority3: review.priority3,
          revenueGoal: review.revenueGoal ? Number(review.revenueGoal) : null,
        }),
        "Couldn't save the weekly review.",
      );
      if (ok) toast.success("Weekly review saved");
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof typeof review) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setReview((r) => ({ ...r, [key]: e.target.value }));
  const range = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Weekly review"
        description="Review your business performance and plan your next moves."
        action={
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset((v) => v - 1)} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <span className="whitespace-nowrap px-1 text-body-sm font-semibold tabular-nums">{range}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset((v) => v + 1)} aria-label="Next week">
              <ChevronRight />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                This week
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={CheckCircle2} tone="green" label="Tasks completed" value={String(weekStats?.tasksCompleted ?? 0)} />
        <MetricCard icon={Clock} tone="blue" label="Hours tracked" value={`${Number(review.hoursTracked || 0).toFixed(1)}h`} hint="Logged below" />
        <MetricCard icon={DollarSign} tone="gold" label="Income this week" value={fmtMoney(weekStats?.incomeThisWeek ?? 0)} />
        <MetricCard
          icon={Gauge}
          tone="violet"
          label="Momentum score"
          value={weekStats?.momentumScorePct != null ? `${weekStats.momentumScorePct}%` : "—"}
          hint={weekStats?.momentumScorePct != null ? "Due tasks completed" : "No tasks due this week"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-4 p-5">
          <SectionHeader as="h3" icon={NotebookPen} title="Reflection" />
          <Field id="wr-win" label="Biggest win this week">
            <Textarea id="wr-win" value={review.biggestWin} onChange={set("biggestWin")} placeholder="What went well?" rows={3} />
          </Field>
          <Field id="wr-lesson" label="Lesson learned">
            <Textarea id="wr-lesson" value={review.lessonLearned} onChange={set("lessonLearned")} placeholder="What did you learn?" rows={3} />
          </Field>
          <Field id="wr-attention" label="What needs your attention">
            <Textarea id="wr-attention" value={review.needsAttention} onChange={set("needsAttention")} placeholder="What's pulling focus?" rows={3} />
          </Field>
        </Card>

        <Card className="gap-4 p-5">
          <SectionHeader as="h3" icon={Target} title="Next week planning" />
          <Field id="wr-p1" label="Top priority 1">
            <Input id="wr-p1" value={review.priority1} onChange={set("priority1")} placeholder="e.g. Finish the funnel build" />
          </Field>
          <Field id="wr-p2" label="Top priority 2">
            <Input id="wr-p2" value={review.priority2} onChange={set("priority2")} />
          </Field>
          <Field id="wr-p3" label="Top priority 3">
            <Input id="wr-p3" value={review.priority3} onChange={set("priority3")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="wr-revenue" label="Revenue goal for next week">
              <Input id="wr-revenue" type="number" inputMode="decimal" value={review.revenueGoal} onChange={set("revenueGoal")} placeholder="$" />
            </Field>
            <Field id="wr-hours" label="Hours tracked this week">
              <Input id="wr-hours" type="number" inputMode="decimal" value={review.hoursTracked} onChange={set("hoursTracked")} placeholder="0" />
            </Field>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save weekly review"}
        </Button>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
