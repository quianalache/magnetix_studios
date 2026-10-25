"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  BookOpen, Calendar, History, CalendarRange, CircleDollarSign, Heart,
  ScrollText, Images, ChevronLeft, ChevronRight, Zap, CircleCheck,
  TrendingUp, Clock, Sun, Moon, Check,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { useConfirm } from "@/components/system/confirm-dialog";
import { cn } from "@/lib/utils";
import { localDateKey } from "@/lib/reflection/local-date";
import { AM_PROMPTS, PM_PROMPTS, emptyDailyReflectionFields } from "@/types/reflection";
import type { DailyReflectionDoc, DailyOperationalStats } from "@/types/reflection";
import { RitualsTab } from "@/components/reflection/rituals-tab";
import { NotesTab } from "@/components/reflection/notes-tab";
import { MemoriesTab } from "@/components/reflection/memories-tab";

/**
 * Reflection — Magnetix Visual Direction 2 (2026-10-23). Eight sub-tabs from
 * the MomentumOS original: Daily, Rituals, Notes and Memories are built;
 * Weekly, Monthly, Quarterly and Money show a "coming soon" state. Daily is
 * the personal writing surface: a compact date bar with save state, the
 * day's operational numbers, and the AM / PM prompts.
 *
 * Dates are the person's LOCAL calendar day (they used to be the UTC day,
 * so in the evening "today" was already tomorrow).
 */
const SUB_TABS = [
  { key: "daily", label: "Daily", icon: Calendar, built: true },
  { key: "weekly", label: "Weekly", icon: History, built: false },
  { key: "monthly", label: "Monthly", icon: CalendarRange, built: false },
  { key: "quarterly", label: "Quarterly", icon: CalendarRange, built: false },
  { key: "money", label: "Money", icon: CircleDollarSign, built: false },
  { key: "rituals", label: "Rituals", icon: Heart, built: true },
  { key: "notes", label: "Notes", icon: ScrollText, built: true },
  { key: "memories", label: "Memories", icon: Images, built: true },
] as const;
type SubTab = (typeof SUB_TABS)[number]["key"];

const COMING_SOON: Partial<Record<SubTab, string>> = {
  weekly: "Look back on each week — wins, lessons and what to carry forward.",
  monthly: "A monthly check-in on where your energy and business are heading.",
  quarterly: "Zoom out every quarter and reset your direction.",
  money: "Reflect on your relationship with money alongside the numbers.",
};

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
const noopSubscribe = () => () => {};

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100) % 100 !== 0;
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

type Fields = ReturnType<typeof emptyDailyReflectionFields>;

export default function ReflectionPage() {
  const { subAccountId } = useSubAccount();
  const { confirm, dialog } = useConfirm();
  const [subTab, setSubTab] = useState<SubTab>("daily");
  const [dayOffset, setDayOffset] = useState(0);
  const [reflection, setReflection] = useState<DailyReflectionDoc | null>(null);
  const [stats, setStats] = useState<DailyOperationalStats | null>(null);
  const [fields, setFields] = useState<Fields>(emptyDailyReflectionFields());
  const [saved, setSaved] = useState<Fields>(emptyDailyReflectionFields());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // The person's local day is only knowable in the browser: the server renders
  // in UTC, which from ~8 PM Eastern is already tomorrow. Server render and
  // hydration both use `null` (no date yet); the browser's local day follows
  // immediately after, so the two renders always agree.
  const localToday = useSyncExternalStore(noopSubscribe, () => localDateKey(), () => null);
  const date = useMemo(() => (localToday ? localDateKey(dayOffset) : null), [localToday, dayOffset]);
  const isToday = dayOffset === 0;
  const dirty = useMemo(() => (Object.keys(fields) as (keyof Fields)[]).some((k) => (fields[k] ?? "") !== (saved[k] ?? "")), [fields, saved]);

  useEffect(() => {
    if (!subAccountId || !date) return;
    setLoading(true);
    fetch(`/api/sub-accounts/${subAccountId}/reflection?date=${date}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        const loaded = { ...emptyDailyReflectionFields(), ...(data.reflection ?? {}) } as Fields;
        setReflection(data.reflection ?? null);
        setStats(data.stats ?? null);
        setFields(loaded);
        setSaved(loaded);
      })
      .catch(() => toast.error("Couldn't load that day."))
      .finally(() => setLoading(false));
  }, [subAccountId, date]);

  // Leaving the page with unsaved writing asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function guardDiscard(): Promise<boolean> {
    if (!dirty) return true;
    return confirm({ title: "Discard unsaved reflection?", description: "You've written something for this day that isn't saved yet.", confirmLabel: "Discard", tone: "danger" });
  }
  async function goToDay(next: number) {
    if (await guardDiscard()) setDayOffset(next);
  }
  async function goToTab(next: SubTab) {
    if (subTab === "daily" && next !== "daily" && !(await guardDiscard())) return;
    if (subTab === "daily" && next !== "daily") setFields(saved);
    setSubTab(next);
  }

  async function save() {
    if (!date) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...fields }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReflection(data.reflection);
      setSaved(fields);
      toast.success("Reflection saved.");
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const status = dirty ? "Unsaved changes" : reflection ? "Saved" : "Not started";

  return (
    <PageShell width="data">
      {dialog}
      <PageHeader
        title="Reflection"
        icon={BookOpen}
        description="A space for self-awareness, intention and a steady reset."
      />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Tabs value={subTab} onValueChange={(v) => goToTab(v as SubTab)}>
          <TabsList variant="underline" className="gap-5">
            {SUB_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.key} value={t.key}>
                  <Icon aria-hidden="true" />
                  {t.label}
                  {!t.built && <span className="rounded-full bg-muted px-1.5 text-micro font-medium text-muted-foreground">Soon</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {subTab === "rituals" ? (
        <RitualsTab subAccountId={subAccountId} />
      ) : subTab === "notes" ? (
        <NotesTab subAccountId={subAccountId} />
      ) : subTab === "memories" ? (
        <MemoriesTab subAccountId={subAccountId} />
      ) : subTab !== "daily" ? (
        <EmptyState
          icon={SUB_TABS.find((t) => t.key === subTab)?.icon ?? BookOpen}
          title={`${SUB_TABS.find((t) => t.key === subTab)?.label} reflection is coming soon`}
          description={COMING_SOON[subTab]}
          action={<Button variant="secondary" onClick={() => goToTab("daily")}>Go to Daily</Button>}
        />
      ) : (
        <div className="space-y-5">
          <Card size="sm" className="flex-row flex-wrap items-center justify-between gap-3 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => goToDay(dayOffset - 1)} aria-label="Previous day">
                <ChevronLeft />
              </Button>
              <div className="flex min-w-0 items-center gap-2 px-1">
                <Calendar className="size-4 shrink-0 text-link" aria-hidden="true" />
                <span className="truncate text-section font-semibold">{date ? fmtDate(date) : "\u00a0"}</span>
                {isToday && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-micro font-semibold text-accent-foreground">Today</span>}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => goToDay(dayOffset + 1)} aria-label="Next day">
                <ChevronRight />
              </Button>
              {!isToday && (
                <Button variant="ghost" size="sm" onClick={() => goToDay(0)}>
                  Today
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("flex items-center gap-1.5 text-caption font-medium", dirty ? "text-status-warning-fg" : "text-muted-foreground")} aria-live="polite">
                {!dirty && reflection && <Check className="size-3.5" aria-hidden="true" />}
                {status}
              </span>
              <Button onClick={save} disabled={saving || loading || (!dirty && !!reflection)}>
                {saving ? "Saving…" : reflection ? "Save" : "Start reflection"}
              </Button>
            </div>
          </Card>

          {loading ? (
            <div className="grid gap-5 lg:grid-cols-3" aria-busy="true">
              <Skeleton className="h-64 rounded-card" />
              <div className="space-y-5 lg:col-span-2">
                <Skeleton className="h-72 rounded-card" />
                <Skeleton className="h-72 rounded-card" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
              {/* Phones write first: the day's numbers follow the prompts below lg. */}
              <Card className="order-last gap-4 p-5 lg:sticky lg:top-4 lg:order-none">
                <h2 className="flex items-center gap-2 text-overline font-semibold uppercase tracking-wide text-muted-foreground">
                  <Zap className="size-3.5 text-link" aria-hidden="true" />
                  Operational awareness
                </h2>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
                  <MiniStat icon={CircleCheck} label="Tasks" value={String(stats?.tasksCompleted ?? 0)} />
                  <MiniStat icon={Heart} label="Rituals" value={String(stats?.ritualsCompleted ?? 0)} />
                  <MiniStat icon={CircleDollarSign} label="Income" value={fmtMoney(stats?.income ?? 0)} />
                  <MiniStat icon={CircleDollarSign} label="Net flow" value={fmtMoney(stats?.netFlow ?? 0)} negative={(stats?.netFlow ?? 0) < 0} />
                  <MiniStat icon={TrendingUp} label="Content" value={String(stats?.contentPublished ?? 0)} />
                  <MiniStat icon={Clock} label="Time" value={`${stats?.hoursTracked ?? 0}h`} />
                </div>
                <p className="text-caption text-muted-foreground">What actually happened {isToday ? "today" : "that day"}, pulled from your workspace.</p>
              </Card>

              <div className="space-y-5 lg:col-span-2">
                <ReflectionCard
                  icon={Sun}
                  chip="bg-tag-gold-bg text-tag-gold-fg"
                  title="AM reflection + intentions"
                  prompts={AM_PROMPTS}
                  fields={fields}
                  onChange={(key, val) => setFields((f) => ({ ...f, [key]: val }))}
                />
                <ReflectionCard
                  icon={Moon}
                  chip="bg-tag-violet-bg text-tag-violet-fg"
                  title="PM reflection + review"
                  prompts={PM_PROMPTS}
                  fields={fields}
                  onChange={(key, val) => setFields((f) => ({ ...f, [key]: val }))}
                />
                <div className="flex items-center justify-end gap-3">
                  <span className={cn("text-caption font-medium", dirty ? "text-status-warning-fg" : "text-muted-foreground")}>{status}</span>
                  <Button onClick={save} disabled={saving || (!dirty && !!reflection)}>
                    {saving ? "Saving…" : reflection ? "Save reflection" : "Start reflection"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

function MiniStat({ icon: Icon, label, value, negative }: { icon: typeof CircleCheck; label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        <span className="text-overline font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn("text-title-md font-bold tabular-nums", negative ? "text-destructive" : "text-foreground")}>{value}</p>
    </div>
  );
}

function ReflectionCard({
  icon: Icon,
  chip,
  title,
  prompts,
  fields,
  onChange,
}: {
  icon: typeof Sun;
  chip: string;
  title: string;
  prompts: typeof AM_PROMPTS;
  fields: Fields;
  onChange: (key: keyof Fields, value: string) => void;
}) {
  return (
    <Card className="gap-5 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", chip)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="text-title-md font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-5">
        {prompts.map((p) => (
          <div key={p.key} className="space-y-1.5">
            <label htmlFor={`reflection-${p.key}`} className="block text-body-sm font-semibold text-foreground">
              {p.label}
              <span className="mt-0.5 block text-caption font-normal text-muted-foreground">{p.hint}</span>
            </label>
            <Textarea
              id={`reflection-${p.key}`}
              value={fields[p.key]}
              onChange={(e) => onChange(p.key, e.target.value)}
              placeholder="Write freely…"
              rows={3}
              className="min-h-20 text-body"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
