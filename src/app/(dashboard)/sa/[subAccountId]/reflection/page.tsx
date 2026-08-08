"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen, Calendar, History, CalendarRange, CircleDollarSign, Heart,
  ScrollText, Images, ChevronLeft, ChevronRight, Zap, CircleCheck,
  TrendingUp, Clock, Sun, Moon,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AM_PROMPTS, PM_PROMPTS, emptyDailyReflectionFields } from "@/types/reflection";
import type { DailyReflectionDoc, DailyOperationalStats } from "@/types/reflection";

/**
 * Reflection — ported from MomentumOS's real "Reflection" tool
 * (2026-08-08), read directly from her saved logged-in capture. Real tool
 * has 8 sub-tabs: Daily, Weekly, Monthly, Quarterly, Money, Rituals,
 * Notes, Memories — only Daily was expanded in her capture (the other 7
 * were empty), so only Daily is built. The rest need their own real
 * capture before being built the same way — flagged, not invented.
 *
 * One simplification from the real interaction: the real page gates the
 * AM/PM cards behind a "Start Reflection" click on a fresh day. Every
 * prompt here is just always directly editable instead — same content,
 * simpler interaction, no functional loss.
 */
const SUB_TABS = [
  { key: "daily", label: "Daily", icon: Calendar, built: true },
  { key: "weekly", label: "Weekly", icon: History, built: false },
  { key: "monthly", label: "Monthly", icon: CalendarRange, built: false },
  { key: "quarterly", label: "Quarterly", icon: CalendarRange, built: false },
  { key: "money", label: "Money", icon: CircleDollarSign, built: false },
  { key: "rituals", label: "Rituals", icon: Heart, built: false },
  { key: "notes", label: "Notes", icon: ScrollText, built: false },
  { key: "memories", label: "Memories", icon: Images, built: false },
] as const;

function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function ReflectionPage() {
  const { subAccountId } = useSubAccount();
  const [subTab, setSubTab] = useState<(typeof SUB_TABS)[number]["key"]>("daily");
  const [dayOffset, setDayOffset] = useState(0);
  const [reflection, setReflection] = useState<DailyReflectionDoc | null>(null);
  const [stats, setStats] = useState<DailyOperationalStats | null>(null);
  const [fields, setFields] = useState(emptyDailyReflectionFields());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const date = useMemo(() => todayStr(dayOffset), [dayOffset]);
  const isToday = dayOffset === 0;

  useEffect(() => {
    if (!subAccountId) return;
    setLoading(true);
    fetch(`/api/sub-accounts/${subAccountId}/reflection?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        setReflection(data.reflection ?? null);
        setStats(data.stats ?? null);
        setFields({ ...emptyDailyReflectionFields(), ...(data.reflection ?? {}) });
      })
      .catch(() => toast.error("Couldn't load that day."))
      .finally(() => setLoading(false));
  }, [subAccountId, date]);

  async function save() {
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
      toast.success("Reflection saved.");
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="momentum-scope mx-auto w-full max-w-6xl space-y-8 rounded-2xl pb-20">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Reflection</h1>
          </div>
          <p className="max-w-md text-muted-foreground">
            A sacred space for self-awareness, intentionality, and strategic reset.
          </p>
        </div>
      </div>

      {/* Real Radix Tabs shape — rounded-2xl bordered container, larger
          px-5 py-2.5 triggers, active = bg-background (a third distinct
          tab recipe alongside the Growth pill and AI Agents underline —
          see Design System tab). */}
      <div className="scrollbar-hide overflow-x-auto pb-2">
        <div className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/40 bg-muted/50 p-1">
          {SUB_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = subTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSubTab(t.key)}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-medium transition-all",
                  isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {subTab !== "daily" ? (
        <div className="rounded-3xl border border-dashed border-border/40 bg-muted/20 p-10 text-center">
          <p className="text-sm font-semibold">
            {SUB_TABS.find((t) => t.key === subTab)?.label} isn&apos;t built yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            The real MomentumOS Reflection tool has this tab, but it wasn&apos;t captured when the
            reference pages were saved — needs its own real capture before it gets built the same
            way Daily was, instead of guessing at something this personal.
          </p>
        </div>
      ) : loading ? (
        <div className="h-96 animate-pulse rounded-3xl border bg-muted/20" />
      ) : (
        <div className="space-y-8">
          <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setDayOffset((d) => d - 1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Calendar className="h-5 w-5 text-primary" />
              {fmtDate(date)}
              {isToday && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  TODAY
                </span>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setDayOffset((d) => d + 1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-8">
              <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-background to-muted/30 bg-card p-6 shadow-sm">
                <h3 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  <Zap className="h-4 w-4 text-primary" />
                  Operational Awareness
                </h3>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  <MiniStat icon={CircleCheck} label="Tasks" value={String(stats?.tasksCompleted ?? 0)} />
                  <MiniStat
                    icon={Heart}
                    label="Rituals"
                    value={stats?.ritualsCompleted != null ? String(stats.ritualsCompleted) : "—"}
                  />
                  <MiniStat
                    icon={CircleDollarSign}
                    label="Income"
                    value={`$${(stats?.income ?? 0).toLocaleString()}`}
                    tone="text-primary"
                  />
                  <MiniStat
                    icon={CircleDollarSign}
                    label="Net Flow"
                    value={`$${(stats?.netFlow ?? 0).toLocaleString()}`}
                    tone="text-accent-foreground"
                    dim
                  />
                  <MiniStat icon={TrendingUp} label="Content" value={String(stats?.contentPublished ?? 0)} />
                  <MiniStat icon={Clock} label="Time" value={`${stats?.hoursTracked ?? 0}h`} />
                </div>
              </div>
            </div>

            <div className="space-y-8 lg:col-span-2">
              <ReflectionCard
                icon={Sun}
                iconBg="bg-secondary/20"
                iconTone="text-secondary-foreground"
                title="AM Reflection + Intentions"
                prompts={AM_PROMPTS}
                fields={fields}
                onChange={(key, val) => setFields((f) => ({ ...f, [key]: val }))}
              />
              <ReflectionCard
                icon={Moon}
                iconBg="bg-primary/10"
                iconTone="text-primary"
                title="PM Reflection + Review"
                prompts={PM_PROMPTS}
                fields={fields}
                onChange={(key, val) => setFields((f) => ({ ...f, [key]: val }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <Button onClick={save} disabled={saving} className="rounded-xl px-6">
              {saving ? "Saving…" : reflection ? "Save Reflection" : "Start Reflection"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
  dim,
}: {
  icon: typeof CircleCheck;
  label: string;
  value: string;
  tone?: string;
  dim?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background p-4">
      <div className="mb-1 flex items-center gap-2 text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", dim && "opacity-50")} />
        <span className="text-[10px] font-bold uppercase">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", tone)}>{value}</p>
    </div>
  );
}

function ReflectionCard({
  icon: Icon,
  iconBg,
  iconTone,
  title,
  prompts,
  fields,
  onChange,
}: {
  icon: typeof Sun;
  iconBg: string;
  iconTone: string;
  title: string;
  prompts: typeof AM_PROMPTS;
  fields: ReturnType<typeof emptyDailyReflectionFields>;
  onChange: (key: keyof ReturnType<typeof emptyDailyReflectionFields>, value: string) => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 shadow-sm">
      <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-5">
        <Icon className="h-24 w-24 text-primary" />
      </div>
      <div className="mb-8 flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
          <Icon className={cn("h-5 w-5", iconTone)} />
        </div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-8">
        {prompts.map((p) => (
          <div key={p.key} className="space-y-2">
            <div className="flex flex-col">
              <label className="text-sm font-bold text-foreground">{p.label}</label>
              <span className="text-[10px] italic text-muted-foreground">{p.hint}</span>
            </div>
            <Textarea
              value={fields[p.key]}
              onChange={(e) => onChange(p.key, e.target.value)}
              placeholder="No entry yet."
              className="min-h-[60px] rounded-xl border-dashed border-border/40 bg-muted/20 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
