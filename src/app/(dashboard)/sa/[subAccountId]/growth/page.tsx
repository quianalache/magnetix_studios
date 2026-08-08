"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Trash2,
  DollarSign, Wallet, Activity, Percent, CheckCircle2, Clock, Share2,
  Target, Sparkles, NotebookPen,
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
import { cn } from "@/lib/utils";
import { goalProgressPct } from "@/types/growth";
import type { Goal, MoneyEntry, PagePerformance, SocialPlatform } from "@/types/growth";
/**
 * Corrected 2026-08-08, for real this time — she sent an actual screenshot
 * of the real MomentumOS Growth Overview page, and — this time — the
 * actual real markup: she has a saved "complete webpage" export of the
 * real live app sitting on her own Desktop (GHL Tools Export folder),
 * whose bundled CSS filename (index-Datw-w0K.css) matches exactly what
 * showed up in her earlier DevTools screenshot, confirming it's the same
 * build. Read the real HTML directly instead of inferring from a
 * screenshot a third time:
 *
 *   <div class="rounded-lg border text-card-foreground border-none
 *     shadow-sm bg-secondary">
 *     <div class="... flex flex-row items-center justify-between pb-2
 *       pt-4 px-4">
 *       <h3 class="tracking-tight text-xs font-medium text-muted-foreground">Label</h3>
 *       <svg class="... h-3.5 w-3.5 text-primary">
 *     </div>
 *     <div class="p-6 pt-0 px-4 pb-4">
 *       <div class="text-2xl font-bold text-foreground">Value</div>
 *       <p class="text-xs text-muted-foreground mt-0.5">Hint</p>
 *
 * Real, confirmed details that change the previous guess: the ICON is
 * always plain `text-primary`, never tinted to match the card — only the
 * card's own background rotates (bg-card / bg-accent/30 / bg-muted /
 * bg-secondary, several of them far lighter than assumed, not a uniform
 * full-strength wash). A negative change shows as red TEXT
 * (text-destructive) on the value/hint line, not a different icon or a
 * down arrow — confirmed from a real "-100% from last month" example.
 * Grid is `grid-cols-2 md:grid-cols-5` — 5 per row, not 3, which is
 * exactly why the cards were reading as too long/wrapping wrong.
 */
const GROWTH_BG = ["bg-card", "bg-accent/30", "bg-muted", "bg-secondary", "bg-card", "bg-accent/30"] as const;

function GrowthStat({
  icon: Icon,
  label,
  value,
  hint,
  bg,
  negative,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
  bg: (typeof GROWTH_BG)[number];
  negative?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border-none shadow-sm", bg)}>
      <div className="flex flex-row items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h3 className="text-xs font-medium tracking-tight text-muted-foreground">{label}</h3>
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      </div>
      <div className="px-4 pb-4 pt-0">
        <div className={cn("text-2xl font-bold tabular-nums", negative ? "text-destructive" : "text-foreground")}>
          {value}
        </div>
        {hint && (
          <p className={cn("mt-0.5 text-xs", negative ? "font-medium text-destructive" : "text-muted-foreground")}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Growth — full port of MomentumOS's Growth tab. See src/types/growth.ts
 * for the honest-substitute notes (Hours Tracked/Momentum Score/Funnel
 * Performance). Structure/copy cloned from the real artifact; none of her
 * personal example entries carried over, only the mechanism.
 */

type GrowthTab = "overview" | "social" | "money" | "goals" | "pulse" | "review";

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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

export default function GrowthPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [tab, setTab] = useState<GrowthTab>("overview");

  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [money, setMoney] = useState<MoneyEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pages, setPages] = useState<PagePerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const [moneyStats, setMoneyStats] = useState<{
    incomeThisMonth: number;
    expensesThisMonth: number;
    currentMrr: number;
    mrrRecordCount: number;
    projectedCashFlow: number;
    netProfitLoss: number;
  } | null>(null);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let a = false, b = false, c = false, d = false;
    const settle = () => {
      if (a && b && c && d) setLoading(false);
    };
    const u1 = subscribeToSocialPlatforms(scope, (l) => { setPlatforms(l); a = true; settle(); });
    const u2 = subscribeToMoneyEntries(scope, (l) => { setMoney(l); b = true; settle(); });
    const u3 = subscribeToGoals(scope, (l) => { setGoals(l); c = true; settle(); });
    const u4 = subscribeToPagePerformance(scope, (l) => { setPages(l); d = true; settle(); });
    return () => { u1(); u2(); u3(); u4(); };
  }, [user, agencyId, subAccountId, authLoading]);

  async function refreshMoneyStats() {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/growth/money/stats`);
    if (res.ok) setMoneyStats((await res.json()).stats);
  }
  useEffect(() => {
    refreshMoneyStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId, money.length]);

  // Icon per tab, plain text-primary when active — matches the confirmed
  // real convention (icons don't carry per-item hue, only card/pill
  // backgrounds do), resolved through momentum-scope so it's MomentumOS's
  // actual purple, not a hand-picked hex.
  const TABS: { id: GrowthTab; label: string; icon: typeof Sparkles }[] = [
    { id: "overview", label: "Overview", icon: Sparkles },
    { id: "social", label: "Social", icon: Share2 },
    { id: "money", label: "Money", icon: DollarSign },
    { id: "goals", label: "Goals", icon: Target },
    { id: "pulse", label: "Business Pulse", icon: Activity },
    { id: "review", label: "Weekly Review", icon: NotebookPen },
  ];

  const activeGoals = useMemo(() => goals.filter((g) => g.status === "active"), [goals]);
  const recentTransactions = money.slice(0, 4);

  return (
    <div className="momentum-scope mx-auto w-full max-w-6xl space-y-6 rounded-2xl">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <TrendingUp className="h-4.5 w-4.5 text-primary" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Growth</h1>
          <p className="text-sm text-muted-foreground">
            Track platforms, revenue, goals, weekly progress, and what needs your attention.
          </p>
        </div>
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
                // Container is bg-muted, so hover can't also be bg-muted
                // (invisible) — bg-background/60 keeps the same "lighten
                // toward the active pill's own color" feel without
                // colliding with the confirmed hover:bg-muted convention
                // used elsewhere (nav links, where the container isn't
                // already muted).
                isActive
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", isActive ? "text-primary" : "opacity-60")} />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
      ) : (
        <>
          {tab === "overview" && (
            <OverviewPanel
              moneyStats={moneyStats}
              platforms={platforms}
              transactions={recentTransactions}
              activeGoals={activeGoals}
              onGoto={setTab}
            />
          )}
          {tab === "social" && (
            <SocialPanel subAccountId={subAccountId} platforms={platforms} />
          )}
          {tab === "money" && (
            <MoneyPanel subAccountId={subAccountId} entries={money} stats={moneyStats} />
          )}
          {tab === "goals" && <GoalsPanel subAccountId={subAccountId} goals={goals} />}
          {tab === "pulse" && <PulsePanel subAccountId={subAccountId} pages={pages} />}
          {tab === "review" && <WeeklyReviewPanel subAccountId={subAccountId} />}
        </>
      )}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────

function OverviewPanel({
  moneyStats,
  platforms,
  transactions,
  activeGoals,
  onGoto,
}: {
  moneyStats: {
    incomeThisMonth: number;
    expensesThisMonth: number;
    currentMrr: number;
    mrrRecordCount: number;
    projectedCashFlow: number;
    netProfitLoss: number;
  } | null;
  platforms: SocialPlatform[];
  transactions: MoneyEntry[];
  activeGoals: Goal[];
  onGoto: (t: GrowthTab) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <GrowthStat
          icon={DollarSign}
          bg="bg-card"
          label="Income This Month"
          value={fmtMoney(moneyStats?.incomeThisMonth ?? 0)}
          hint="Paid entries only"
        />
        <GrowthStat
          icon={TrendingDown}
          bg="bg-accent/30"
          label="Expenses This Month"
          value={fmtMoney(moneyStats?.expensesThisMonth ?? 0)}
          hint="All logged expenses"
        />
        <GrowthStat
          icon={TrendingUp}
          bg="bg-muted"
          label="Current MRR"
          value={fmtMoney(moneyStats?.currentMrr ?? 0)}
          hint={`${moneyStats?.mrrRecordCount ?? 0} active records`}
        />
        <GrowthStat
          icon={Wallet}
          bg="bg-secondary"
          label="Projected Cash Flow"
          value={fmtMoney(moneyStats?.projectedCashFlow ?? 0)}
          hint="MRR − Recurring Exp."
          negative={(moneyStats?.projectedCashFlow ?? 0) < 0}
        />
        <GrowthStat
          icon={DollarSign}
          bg="bg-card"
          label="Net Profit / Loss"
          value={fmtMoney(moneyStats?.netProfitLoss ?? 0)}
          hint="Profit this month"
        />
        <div className="rounded-lg border-none bg-secondary shadow-sm">
          <div className="flex flex-row items-center justify-between gap-2 px-4 pb-2 pt-4">
            <h3 className="text-xs font-medium tracking-tight text-muted-foreground">Money Goal</h3>
            <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
          </div>
          <div className="px-4 pb-4 pt-0">
            <button onClick={() => onGoto("goals")} className="text-sm font-medium text-primary underline underline-offset-2">
              Set a monthly goal
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Social Growth</h3>
            <button onClick={() => onGoto("social")} className="text-xs font-semibold text-primary">View all</button>
          </div>
          {platforms.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="mb-2 text-xs text-muted-foreground">No social metrics logged yet</p>
              <button onClick={() => onGoto("social")} className="text-xs font-semibold text-primary">Add platform</button>
            </div>
          ) : (
            <div className="space-y-2">
              {platforms.slice(0, 3).map((p) => (
                <div key={p.id} className="rounded-lg border bg-card px-3 py-2 text-sm font-medium">{p.platform}</div>
              ))}
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent Transactions</h3>
            <button onClick={() => onGoto("money")} className="text-xs font-semibold text-primary">View all</button>
          </div>
          {transactions.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border bg-card px-3.5 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {toDate(t.date)?.toLocaleDateString() ?? ""} · {t.kind}
                    </p>
                  </div>
                  <span className={cn("text-sm font-bold tabular-nums", t.kind === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {t.kind === "income" ? "+" : "-"}{fmtMoney(Math.abs(t.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Active Goals</h3>
          <button onClick={() => onGoto("goals")} className="text-xs font-semibold text-primary">View all</button>
        </div>
        {activeGoals.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No goals yet.</p>
        ) : (
          <div className="max-w-sm">
            <GoalCard goal={activeGoals[0]} />
          </div>
        )}
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const pct = goalProgressPct(goal);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{goal.name}</span>
        <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{goal.type}</span>
      </div>
      <div className="my-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums">{goal.current.toLocaleString()}</span>
        <span className="text-sm text-muted-foreground">/ {goal.target.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>Progress</span><span>{pct}%</span>
      </div>
      {(goal.startAt || goal.endAt) && (
        <p className="mt-2.5 text-[11px] text-muted-foreground">
          {toDate(goal.startAt)?.toLocaleDateString() ?? "…"} → {toDate(goal.endAt)?.toLocaleDateString() ?? "…"}
        </p>
      )}
    </div>
  );
}

// ── Social ──────────────────────────────────────────────────────────────

function SocialPanel({ subAccountId, platforms }: { subAccountId: string; platforms: SocialPlatform[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logCount, setLogCount] = useState("");
  const [latest, setLatest] = useState<Record<string, number>>({});

  useEffect(() => {
    platforms.forEach(async (p) => {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/growth/social/${p.id}/logs`);
      if (res.ok) {
        const { logs } = (await res.json()) as { logs: { count: number }[] };
        setLatest((prev) => ({ ...prev, [p.id]: logs[0]?.count ?? 0 }));
      }
    });
  }, [platforms, subAccountId]);

  async function addPlatform() {
    if (!name.trim()) return;
    await fetch(`/api/sub-accounts/${subAccountId}/growth/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: name.trim() }),
    });
    setName("");
    setAdding(false);
    toast.success("Platform added");
  }
  async function removePlatform(id: string) {
    await fetch(`/api/sub-accounts/${subAccountId}/growth/social/${id}`, { method: "DELETE" });
  }
  async function addLog(platformId: string) {
    const count = Number(logCount);
    if (!Number.isFinite(count)) return;
    await fetch(`/api/sub-accounts/${subAccountId}/growth/social/${platformId}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    });
    setLogFor(null);
    setLogCount("");
    setLatest((prev) => ({ ...prev, [platformId]: count }));
    toast.success("Logged");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-semibold">Social Metrics</h2>
          <p className="text-[12.5px] text-muted-foreground">Track your platform growth over time</p>
        </div>
        <Button onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Platform
        </Button>
      </div>

      {adding && (
        <div className="flex max-w-sm items-center gap-2 rounded-xl border bg-card p-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. YouTube" onKeyDown={(e) => e.key === "Enter" && addPlatform()} />
          <Button size="sm" onClick={addPlatform} disabled={!name.trim()}>Add</Button>
        </div>
      )}

      {platforms.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No platforms yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((p) => (
            <div key={p.id} className="max-w-sm rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[14.5px] font-semibold">{p.platform}</p>
                  {toDate(p.startedAt) && (
                    <p className="text-[11px] text-muted-foreground">Started {toDate(p.startedAt)!.toLocaleDateString()}</p>
                  )}
                </div>
                <button onClick={() => removePlatform(p.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
              </div>
              <p className="text-[26px] font-bold tabular-nums">{latest[p.id] ?? 0}</p>
              <p className="mb-3 text-[11px] text-muted-foreground">followers / subscribers</p>
              {logFor === p.id ? (
                <div className="flex items-center gap-2">
                  <Input type="number" value={logCount} onChange={(e) => setLogCount(e.target.value)} placeholder="Count" className="h-8" onKeyDown={(e) => e.key === "Enter" && addLog(p.id)} />
                  <Button size="sm" onClick={() => addLog(p.id)}>Save</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setLogFor(p.id)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Daily Log
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Money ───────────────────────────────────────────────────────────────

function MoneyPanel({
  subAccountId,
  entries,
  stats,
}: {
  subAccountId: string;
  entries: MoneyEntry[];
  stats: { incomeThisMonth: number; currentMrr: number } | null;
}) {
  const [moneyTab, setMoneyTab] = useState<"income" | "expenses">("income");
  const [formOpen, setFormOpen] = useState<"income" | "expense" | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);

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
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  async function submitEntry() {
    if (!formOpen || !title.trim() || !amount) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt)) return;
    await fetch(`/api/sub-accounts/${subAccountId}/growth/money`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: formOpen, title: title.trim(), amount: amt, recurring }),
    });
    setTitle("");
    setAmount("");
    setRecurring(false);
    setFormOpen(null);
    toast.success(formOpen === "income" ? "Income logged" : "Expense logged");
  }
  async function removeEntry(id: string) {
    await fetch(`/api/sub-accounts/${subAccountId}/growth/money/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Money Tracker</h2>
          <p className="text-[12.5px] text-muted-foreground">Track income and expenses for your business</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setFormOpen("expense")}>
            <Plus className="mr-1 h-4 w-4" />
            Add Expense
          </Button>
          <Button onClick={() => setFormOpen("income")}>
            <Plus className="mr-1 h-4 w-4" />
            Log Income
          </Button>
        </div>
      </div>

      {formOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={formOpen === "income" ? "Source, e.g. MVC Premium" : "What was it for?"} className="max-w-[220px]" />
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="max-w-[120px]" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            Recurring
          </label>
          <Button size="sm" onClick={submitEntry}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setFormOpen(null)}>Cancel</Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <GrowthStat icon={DollarSign} bg="bg-card" label="Net this month" value={fmtMoney((stats?.incomeThisMonth ?? 0))} hint="No data yet" />
        <GrowthStat icon={TrendingUp} bg="bg-accent/30" label="Income This Month" value={fmtMoney(stats?.incomeThisMonth ?? 0)} />
        <GrowthStat icon={Wallet} bg="bg-muted" label="Current MRR" value={fmtMoney(stats?.currentMrr ?? 0)} />
      </div>

      <div className="inline-flex rounded-lg bg-muted/30 p-1">
        <button onClick={() => setMoneyTab("income")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", moneyTab === "income" ? "bg-background shadow-sm" : "text-muted-foreground")}>
          Income ({entries.filter((e) => e.kind === "income").length})
        </button>
        <button onClick={() => setMoneyTab("expenses")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", moneyTab === "expenses" ? "bg-background shadow-sm" : "text-muted-foreground")}>
          Expenses ({entries.filter((e) => e.kind === "expense").length})
        </button>
      </div>

      {grouped.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <div className="space-y-2">
          {grouped.map(([month, list]) => {
            const total = list.reduce((s, e) => s + e.amount, 0);
            const open = openMonth === month;
            return (
              <div key={month} className="rounded-xl border bg-card">
                <button onClick={() => setOpenMonth(open ? null : month)} className="flex w-full items-center justify-between px-4 py-3">
                  <span className="text-[13px] font-semibold">{month}</span>
                  <span className="text-[11px] text-muted-foreground">{list.length} entries · {fmtMoney(total)}</span>
                </button>
                {open && (
                  <div className="space-y-1.5 border-t px-4 py-3">
                    {list.map((e) => (
                      <div key={e.id} className="flex items-center justify-between py-1">
                        <div>
                          <p className="text-sm">{e.title}</p>
                          <p className="text-[11px] text-muted-foreground">{toDate(e.date)?.toLocaleDateString()}{e.recurring ? " · recurring" : ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">{fmtMoney(e.amount)}</span>
                          <button onClick={() => removeEntry(e.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

  const active = goals.filter((g) => g.status === "active");
  const history = goals.filter((g) => g.status === "completed");

  async function createGoal() {
    if (!name.trim() || !target) return;
    await fetch(`/api/sub-accounts/${subAccountId}/growth/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type: type.trim() || "Custom", target: Number(target), current: Number(current) || 0 }),
    });
    setName(""); setType(""); setTarget(""); setCurrent("");
    setOpen(false);
    toast.success("Goal created");
  }
  async function markDone(g: Goal) {
    await fetch(`/api/sub-accounts/${subAccountId}/growth/goals/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-semibold">Goals + Progress</h2>
          <p className="text-[12.5px] text-muted-foreground">Set and track your business and growth goals</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          New Goal
        </Button>
      </div>

      {open && (
        <div className="grid max-w-lg gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name" className="sm:col-span-2" />
          <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Type (e.g. Followers / Subscribers)" />
          <Input value={target} onChange={(e) => setTarget(e.target.value)} type="number" placeholder="Target" />
          <Input value={current} onChange={(e) => setCurrent(e.target.value)} type="number" placeholder="Current (optional)" />
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={createGoal}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="inline-flex rounded-lg bg-muted/30 p-1">
        <button onClick={() => setGoalsTab("active")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", goalsTab === "active" ? "bg-background shadow-sm" : "text-muted-foreground")}>Active Goals</button>
        <button onClick={() => setGoalsTab("history")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", goalsTab === "history" ? "bg-background shadow-sm" : "text-muted-foreground")}>Goal History</button>
      </div>

      {goalsTab === "active" ? (
        active.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No active goals.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((g) => (
              <div key={g.id} className="space-y-2">
                <GoalCard goal={g} />
                <Button variant="outline" size="sm" className="w-full" onClick={() => markDone(g)}>Mark complete</Button>
              </div>
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="mb-1 text-sm font-semibold">No completed goals yet</p>
          <p className="text-xs text-muted-foreground">Your achieved goals will appear here as a timeline log.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {history.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  );
}

// ── Business Pulse ──────────────────────────────────────────────────────

function PulsePanel({ subAccountId, pages }: { subAccountId: string; pages: PagePerformance[] }) {
  const [pulseTab, setPulseTab] = useState<"pages" | "funnels">("pages");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
  const totalConversions = pages.reduce((s, p) => s + p.conversions, 0);
  const avgRate = totalImpressions > 0 ? ((totalConversions / totalImpressions) * 100).toFixed(1) : "0.0";

  async function addPage() {
    if (!title.trim()) return;
    await fetch(`/api/sub-accounts/${subAccountId}/growth/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), url: url.trim(), pageType: "Sales Page" }),
    });
    setTitle(""); setUrl(""); setOpen(false);
    toast.success("Page added");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <GrowthStat icon={Activity} bg="bg-card" label="Total Impressions" value={String(totalImpressions)} />
        <GrowthStat icon={TrendingUp} bg="bg-accent/30" label="Total Conversions" value={String(totalConversions)} />
        <GrowthStat icon={Percent} bg="bg-secondary" label="Avg. Conversion Rate" value={`${avgRate}%`} />
      </div>

      <div className="inline-flex rounded-lg bg-muted/30 p-1">
        <button onClick={() => setPulseTab("pages")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", pulseTab === "pages" ? "bg-background shadow-sm" : "text-muted-foreground")}>Page Performance</button>
        <button onClick={() => setPulseTab("funnels")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", pulseTab === "funnels" ? "bg-background shadow-sm" : "text-muted-foreground")}>Funnel Performance</button>
      </div>

      {pulseTab === "pages" ? (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Page
            </Button>
          </div>
          {open && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" className="max-w-[220px]" />
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" className="max-w-[260px]" />
              <Button size="sm" onClick={addPage}>Save</Button>
            </div>
          )}
          {pages.length === 0 ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No pages tracked yet.</p>
          ) : (
            pages.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground">{p.url || "—"} · {p.pageType}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">{p.impressions} impressions · {p.conversions} conversions</div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="mb-1 text-sm font-semibold">Funnel Performance isn&apos;t connected yet</p>
          <p className="text-xs text-muted-foreground">
            This tracks real funnel data — the CRM&apos;s own Funnels builder isn&apos;t built yet, so there&apos;s nothing real to show here. It&apos;ll wire up once that ships.
          </p>
        </div>
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
    })();
    return () => { cancelled = true; };
  }, [subAccountId, weekStart]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/growth/weekly-review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      });
      toast.success("Weekly review saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold">Weekly Review</h2>
          <p className="text-[12.5px] text-muted-foreground">Review your business performance and plan your next moves.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1">
          <button onClick={() => setWeekOffset((v) => v - 1)} className="rounded-full p-1.5 hover:bg-background"><ChevronLeft className="h-4 w-4" /></button>
          <span className="whitespace-nowrap px-1 text-[12.5px] font-semibold">
            {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <button onClick={() => setWeekOffset((v) => v + 1)} className="rounded-full p-1.5 hover:bg-background"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => setWeekOffset(0)} className="rounded-full px-2 py-1 text-[11px] font-semibold text-primary">Today</button>
        </div>
      </div>

      <section className="space-y-3">
        <p className="text-sm font-semibold">This Week&apos;s Performance</p>
        <div className="grid grid-cols-3 gap-3">
          <GrowthStat icon={CheckCircle2} bg="bg-card" label="Tasks Completed" value={String(weekStats?.tasksCompleted ?? 0)} />
          <GrowthStat icon={Clock} bg="bg-accent/30" label="Hours Tracked" value={`${Number(review.hoursTracked || 0).toFixed(1)}h`} hint="Manually logged below" />
          <GrowthStat icon={DollarSign} bg="bg-muted" label="Income This Week" value={fmtMoney(weekStats?.incomeThisWeek ?? 0)} />
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold">Momentum Score</p>
        <div className="max-w-xs rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold tabular-nums">{weekStats?.momentumScorePct != null ? `${weekStats.momentumScorePct}%` : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {weekStats?.momentumScorePct != null
              ? "Share of this week's due tasks you completed."
              : "No tasks due this week yet."}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold">Reflection</p>
        <div className="max-w-xl space-y-3 rounded-xl border bg-card p-4">
          <Field label="Biggest win this week">
            <Textarea value={review.biggestWin} onChange={(e) => setReview((r) => ({ ...r, biggestWin: e.target.value }))} placeholder="What went well?" rows={2} />
          </Field>
          <Field label="Lesson learned">
            <Textarea value={review.lessonLearned} onChange={(e) => setReview((r) => ({ ...r, lessonLearned: e.target.value }))} placeholder="What did you learn?" rows={2} />
          </Field>
          <Field label="What needs your attention">
            <Textarea value={review.needsAttention} onChange={(e) => setReview((r) => ({ ...r, needsAttention: e.target.value }))} placeholder="What's pulling focus?" rows={2} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold">Next Week Planning</p>
        <div className="max-w-xl space-y-3 rounded-xl border bg-card p-4">
          <Field label="Top priority 1">
            <Input value={review.priority1} onChange={(e) => setReview((r) => ({ ...r, priority1: e.target.value }))} placeholder="e.g. Finish MVC funnel buildout" />
          </Field>
          <Field label="Top priority 2">
            <Input value={review.priority2} onChange={(e) => setReview((r) => ({ ...r, priority2: e.target.value }))} />
          </Field>
          <Field label="Top priority 3">
            <Input value={review.priority3} onChange={(e) => setReview((r) => ({ ...r, priority3: e.target.value }))} />
          </Field>
          <Field label="Revenue goal for next week">
            <Input type="number" value={review.revenueGoal} onChange={(e) => setReview((r) => ({ ...r, revenueGoal: e.target.value }))} placeholder="$" />
          </Field>
          <Field label="Hours tracked this week">
            <Input type="number" value={review.hoursTracked} onChange={(e) => setReview((r) => ({ ...r, hoursTracked: e.target.value }))} placeholder="0" />
          </Field>
          <Button onClick={save} disabled={saving} className="mt-1">
            {saving ? "Saving…" : "Save Weekly Review"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
