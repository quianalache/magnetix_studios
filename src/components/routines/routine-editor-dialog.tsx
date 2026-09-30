"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, GripVertical, Lock, Plus, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSubAccount } from "@/context/sub-account-context";
import { createRoutineApi, updateRoutineApi } from "@/lib/client/routines-api";
import {
  describeScheduleLong,
  describeTime,
  normalizeSchedule,
  ordinal,
  ScheduleError,
  WEEKDAY_LETTER,
  WEEKDAY_SHORT,
} from "@/lib/routines/schedule";
import {
  MAX_ROUTINE_ACTIVITIES,
  ROUTINE_COLOR_KEYS,
  ROUTINE_COLORS,
  ROUTINE_ICON_KEYS,
  type RoutineColorKey,
  type RoutineCustomMode,
  type RoutineFrequency,
  type RoutineIconKey,
  type RoutineMonthMode,
  type RoutineSchedule,
  type RoutineTimeBlock,
  type RoutineTimeMode,
  type RoutineView,
} from "@/types/routines";
import type { Project } from "@/types/projects";
import { ROUTINE_ICONS, RoutineIcon } from "./routine-look";

type Step = 0 | 1 | 2;
const STEPS = ["Basic Info", "Tasks", "Review"] as const;

type ScheduleDraft = {
  frequency: RoutineFrequency;
  customMode: RoutineCustomMode;
  interval: number;
  days: number[];
  monthMode: RoutineMonthMode;
  monthDates: number[];
  nthWeeks: number[];
  weekday: number;
  startDate: string;
  endsOn: "never" | "date";
  endDate: string;
};

interface ActivityDraft {
  key: string;
  id?: string;
  title: string;
  estimate: string;
  description: string;
  schedule: ScheduleDraft;
  timeMode: RoutineTimeMode;
  timeBlock: RoutineTimeBlock;
  time: string;
}

interface Draft {
  name: string;
  description: string;
  icon: RoutineIconKey;
  color: RoutineColorKey;
  activities: ActivityDraft[];
  visibility: "private" | "shared";
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function blankSchedule(): ScheduleDraft {
  const today = localToday();
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay();
  return {
    frequency: "weekly",
    customMode: "nthWeekday",
    interval: 1,
    days: [wd],
    monthMode: "dates",
    monthDates: [1],
    nthWeeks: [1, 3],
    weekday: 4,
    startDate: today,
    endsOn: "never",
    endDate: "",
  };
}

function blankActivity(): ActivityDraft {
  return {
    key: newKey(),
    title: "",
    estimate: "",
    description: "",
    schedule: blankSchedule(),
    timeMode: "anytime",
    timeBlock: "am",
    time: "09:00",
  };
}

function blankDraft(): Draft {
  const activity = blankActivity();
  return {
    name: "",
    description: "",
    icon: "laptop",
    color: "violet",
    activities: [activity],
    visibility: "private",
  };
}

function draftFrom(r: RoutineView): Draft {
  const activities = r.activities.map((a) => ({
    key: newKey(),
    id: a.id,
    title: a.title,
    estimate: a.estimateMinutes ? String(a.estimateMinutes) : "",
    description: a.description ?? a.notes ?? "",
    schedule: scheduleDraftFrom(a.schedule ?? r.schedule),
    timeMode: a.timeMode ?? r.timeMode,
    timeBlock: a.timeBlock ?? r.timeBlock ?? "am",
    time: a.time ?? r.time ?? "09:00",
  }));
  return {
    name: r.name,
    description: r.description,
    icon: r.icon,
    color: r.color,
    activities,
    visibility: r.visibility === "shared" ? "shared" : "private",
  };
}

function scheduleDraftFrom(s: RoutineSchedule): ScheduleDraft {
  return {
    frequency: s.frequency,
    customMode: s.customMode ?? "nthWeekday",
    interval: s.interval,
    days: s.days.length ? s.days : s.unit === "day" ? [0, 1, 2, 3, 4, 5, 6] : [],
    monthMode: s.monthMode,
    monthDates: s.monthDates.length ? s.monthDates : [1],
    nthWeeks: s.nthWeeks.length ? s.nthWeeks : [1, 3],
    weekday: s.weekday,
    startDate: s.startDate,
    endsOn: s.endDate ? "date" : "never",
    endDate: s.endDate ?? "",
  };
}

function scheduleBody(d: ScheduleDraft) {
  return {
    frequency: d.frequency,
    customMode: d.frequency === "custom" ? d.customMode : null,
    interval: d.interval,
    days: d.days,
    monthMode: d.monthMode,
    monthDates: d.monthDates,
    nthWeeks: d.nthWeeks,
    weekday: d.weekday,
    startDate: d.startDate,
    endDate: d.endsOn === "date" && d.endDate ? d.endDate : null,
  };
}

function toBody(d: Draft, canShare: boolean) {
  const first = d.activities.find((a) => a.title.trim()) ?? blankActivity();
  return {
    ...(canShare ? { visibility: d.visibility } : {}),
    name: d.name.trim(),
    description: d.description.trim(),
    icon: d.icon,
    color: d.color,
    activities: d.activities
      .filter((a) => a.title.trim())
      .map((a) => ({
        id: a.id,
        title: a.title.trim(),
        estimateMinutes: a.estimate ? Number(a.estimate) : null,
        description: a.description.trim(),
        schedule: scheduleBody(a.schedule),
        timeMode: a.timeMode,
        timeBlock: a.timeMode === "block" ? a.timeBlock : null,
        time: a.timeMode === "time" ? a.time : null,
      })),
    // Compatibility projection for older readers. New behavior is entirely
    // driven by the activity-level values above.
    schedule: scheduleBody(first.schedule),
    timeMode: first.timeMode,
    timeBlock: first.timeMode === "block" ? first.timeBlock : null,
    time: first.timeMode === "time" ? first.time : null,
  };
}

// ── small controls ───────────────────────────────────────────────────────────

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full border px-4 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
        className
      )}
    >
      {children}
    </button>
  );
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
      {WEEKDAY_LETTER.map((l, i) => {
        const on = value.includes(i);
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            aria-label={WEEKDAY_SHORT[i]}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

const selectCls =
  "border-input bg-background focus-visible:ring-ring/40 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2";

function NumberSelect({
  id,
  value,
  max,
  onChange,
}: {
  id: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <select id={id} className={selectCls} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

const NTH_OPTIONS = [1, 2, 3, 4, 5, -1];

function WeekdaySelect({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) {
  return (
    <select id={id} className={selectCls} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
        <option key={d} value={i}>
          {d}
        </option>
      ))}
    </select>
  );
}

function parseDates(text: string): number[] {
  return [
    ...new Set(
      text
        .split(/[,\s]+/)
        .map((p) => (p.toLowerCase() === "last" ? -1 : Number(p)))
        .filter((n) => n === -1 || (Number.isInteger(n) && n >= 1 && n <= 31))
    ),
  ];
}

function ActivityScheduleFields({
  activity,
  onChange,
}: {
  activity: ActivityDraft;
  onChange: (patch: Partial<ActivityDraft>) => void;
}) {
  const s = activity.schedule;
  const updateSchedule = (patch: Partial<ScheduleDraft>) => onChange({ schedule: { ...s, ...patch } });
  const chooseFrequency = (frequency: RoutineFrequency) =>
    updateSchedule({
      frequency,
      interval: 1,
      days: frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : s.days.length ? s.days : [new Date(`${s.startDate}T00:00:00Z`).getUTCDay()],
      customMode: frequency === "custom" ? s.customMode : "nthWeekday",
    });

  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold">Repeats</span>
        {(["daily", "weekly", "monthly", "custom"] as RoutineFrequency[]).map((frequency) => (
          <Chip key={frequency} active={s.frequency === frequency} onClick={() => chooseFrequency(frequency)} className="min-h-8 px-3 text-xs">
            {frequency[0].toUpperCase() + frequency.slice(1)}
          </Chip>
        ))}
      </div>

      {(s.frequency === "daily" || s.frequency === "weekly") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            Repeat every <NumberSelect id={`routine-${activity.key}-interval`} value={s.interval} max={s.frequency === "daily" ? 30 : 12} onChange={(interval) => updateSchedule({ interval })} /> {s.frequency === "daily" ? "day(s)" : "week(s)"}
          </div>
          <DayPicker value={s.days} onChange={(days) => updateSchedule({ days })} />
        </div>
      )}

      {(s.frequency === "monthly" || s.frequency === "custom") && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium">Pattern
            <select className={cn(selectCls, "mt-1 w-full")} value={s.customMode === "nthWeekday" || s.monthMode === "weekdays" ? "nthWeekday" : s.customMode} onChange={(e) => updateSchedule({ customMode: e.target.value as RoutineCustomMode, monthMode: e.target.value === "nthWeekday" ? "weekdays" : "dates" })}>
              <option value="dates">Specific dates</option>
              <option value="nthWeekday">Nth weekday</option>
              {s.frequency === "custom" && <><option value="weeks">Every few weeks</option><option value="months">Every few months</option></>}
            </select>
          </label>
          <label className="text-xs font-medium">Interval
            <NumberSelect id={`routine-${activity.key}-month-interval`} value={s.interval} max={12} onChange={(interval) => updateSchedule({ interval })} />
          </label>
          {s.customMode === "nthWeekday" ? (
            <><label className="text-xs font-medium">Week
              <select className={cn(selectCls, "mt-1 w-full")} value={s.nthWeeks[0] ?? 1} onChange={(e) => updateSchedule({ nthWeeks: [Number(e.target.value)] })}>{NTH_OPTIONS.map((n) => <option key={n} value={n}>{n === -1 ? "Last" : ordinal(n)}</option>)}</select>
            </label><label className="text-xs font-medium">Weekday
              <WeekdaySelect id={`routine-${activity.key}-weekday`} value={s.weekday} onChange={(weekday) => updateSchedule({ weekday })} />
            </label></>
          ) : (
            <label className="text-xs font-medium sm:col-span-2">Dates of month
              <Input className="mt-1" value={s.monthDates.map((n) => (n === -1 ? "last" : n)).join(", ")} onChange={(e) => updateSchedule({ monthDates: parseDates(e.target.value) })} placeholder="1, 15 or last" />
            </label>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium">Starts
          <Input className="mt-1" type="date" value={s.startDate} onChange={(e) => updateSchedule({ startDate: e.target.value })} />
        </label>
        <label className="text-xs font-medium">Ends
          <div className="mt-1 flex gap-2"><select className={cn(selectCls, "flex-1")} value={s.endsOn} onChange={(e) => updateSchedule({ endsOn: e.target.value as ScheduleDraft["endsOn"] })}><option value="never">Never</option><option value="date">On a date</option></select>{s.endsOn === "date" && <Input type="date" value={s.endDate} min={s.startDate} onChange={(e) => updateSchedule({ endDate: e.target.value })} />}</div>
        </label>
      </div>

      <div className="space-y-1.5"><span className="text-xs font-semibold">Time preference</span><div className="grid gap-2 sm:grid-cols-3">
        {(["anytime", "block", "time"] as RoutineTimeMode[]).map((mode) => <label key={mode} className={cn("rounded-md border p-2 text-xs", activity.timeMode === mode && "border-primary bg-primary/5")}><span className="flex items-center gap-1.5"><input type="radio" name={`time-${activity.key}`} checked={activity.timeMode === mode} onChange={() => onChange({ timeMode: mode })} />{mode === "anytime" ? "Anytime" : mode === "block" ? "Time block" : "Specific time"}</span>{mode === "block" && activity.timeMode === mode && <select className={cn(selectCls, "mt-1 w-full")} value={activity.timeBlock} onChange={(e) => onChange({ timeBlock: e.target.value as RoutineTimeBlock })}><option value="am">AM</option><option value="midday">Midday</option><option value="pm">PM</option></select>}{mode === "time" && activity.timeMode === mode && <Input className="mt-1" type="time" value={activity.time} onChange={(e) => onChange({ time: e.target.value })} />}</label>)}
      </div></div>
    </div>
  );
}

// ── dialog ───────────────────────────────────────────────────────────────────

export function RoutineEditorDialog({
  open,
  onOpenChange,
  routine,
  initialStep = 0,
  projects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  routine: RoutineView | null;
  initialStep?: Step | 3;
  projects: Project[];
  onSaved: (routine: RoutineView) => void;
}) {
  const { subAccountId } = useSubAccount();
  void projects;
  const [step, setStep] = useState<Step>(0);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  // Only the owner decides who can see a routine (new routines: the creator).
  const canShare = !routine || routine.isOwner;

  useEffect(() => {
    if (!open) return;
    const d = routine ? draftFrom(routine) : blankDraft();
    setDraft(d);
    setStep(initialStep === 3 ? 2 : initialStep);
  }, [open, routine, initialStep]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const validActivities = draft.activities.filter((a) => a.title.trim());
  const totalMinutes = validActivities.reduce((s, a) => s + (Number(a.estimate) || 0), 0);
  const activityErrors = validActivities.map((a) => {
    try {
      normalizeSchedule(scheduleBody(a.schedule), localToday());
      if (a.timeMode === "time" && !/^\d{2}:\d{2}$/.test(a.time)) return `Enter a valid time for “${a.title}”.`;
      return null;
    } catch (err) {
      return err instanceof ScheduleError ? `Schedule for “${a.title}”: ${err.message}` : "Check the task schedules.";
    }
  });

  const stepError: Record<Step, string | null> = {
    0: draft.name.trim() ? null : "Give the routine a title.",
    1: validActivities.length ? activityErrors.find(Boolean) ?? null : "Add at least one task.",
    2: null,
  };

  async function save() {
    for (const s of [0, 1] as Step[]) {
      if (stepError[s]) {
        setStep(s);
        toast.error(stepError[s]!);
        return;
      }
    }
    setSaving(true);
    try {
      const body = toBody(draft, canShare);
      const res = routine
        ? await updateRoutineApi(subAccountId, routine.id, body)
        : await createRoutineApi(subAccountId, body);
      toast.success(routine ? "Routine updated" : "Routine created");
      onSaved(res.routine);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (stepError[step]) {
      toast.error(stepError[step]!);
      return;
    }
    setStep((s) => Math.min(2, s + 1) as Step);
  }

  function moveActivity(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const list = [...d.activities];
      const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, activities: list };
    });
  }

  const nextLabel = ["Next: Add Tasks", "Next: Review"][step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Stepper */}
          <nav
            aria-label="Routine steps"
            className="bg-muted/30 flex shrink-0 gap-1 border-b p-3 pr-12 sm:w-48 sm:flex-col sm:border-r sm:border-b-0 sm:p-4"
          >
            {STEPS.map((label, i) => {
              const s = i as Step;
              const current = s === step;
              const done = s < step;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => (s <= step || !stepError[step] ? setStep(s) : toast.error(stepError[step]!))}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    current ? "bg-background font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      current && "border-primary bg-primary text-primary-foreground",
                      done && "border-primary text-primary"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {/* Phones show every step's number but only the current step's name. */}
                  <span className={cn(!current && "sr-only sm:not-sr-only")}>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Step body */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <DialogTitle className="text-lg font-bold">{routine ? "Edit Routine" : "Create Routine"}</DialogTitle>
                  <DialogDescription>Set up a recurring group of tasks to keep you consistent.</DialogDescription>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="routine-name">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="routine-name"
                    value={draft.name}
                    maxLength={120}
                    placeholder="e.g. Weekly CEO Reset"
                    onChange={(e) => set("name", e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="routine-description">Description</Label>
                  <Textarea
                    id="routine-description"
                    value={draft.description}
                    maxLength={1000}
                    rows={3}
                    placeholder="What is this routine for?"
                    onChange={(e) => set("description", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Icon &amp; Color</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <RoutineIcon icon={draft.icon} color={draft.color} size="lg" />
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
                      {ROUTINE_COLOR_KEYS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={draft.color === c}
                          aria-label={ROUTINE_COLORS[c].label}
                          onClick={() => set("color", c)}
                          className={cn(
                            "h-7 w-7 rounded-full transition-transform hover:scale-110",
                            draft.color === c && "ring-foreground ring-2 ring-offset-2 ring-offset-[var(--background)]"
                          )}
                          style={{ background: ROUTINE_COLORS[c].hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9" role="radiogroup" aria-label="Icon">
                    {ROUTINE_ICON_KEYS.map((k) => {
                      const Icon = ROUTINE_ICONS[k].icon;
                      const on = draft.icon === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={ROUTINE_ICONS[k].label}
                          title={ROUTINE_ICONS[k].label}
                          onClick={() => set("icon", k)}
                          className={cn(
                            "flex h-10 items-center justify-center rounded-lg border transition-colors",
                            on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                {canShare && (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">Who can see this?</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          { v: "private", icon: Lock, label: "Only me", hint: "Private — nobody else in the workspace sees it or its tasks." },
                          { v: "shared", icon: Users, label: "Everyone in this workspace", hint: "Team members can see it and check off its tasks." },
                        ] as const
                      ).map((o) => (
                        <label
                          key={o.v}
                          className={cn(
                            "cursor-pointer rounded-xl border p-3 text-sm transition-colors",
                            draft.visibility === o.v ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
                          )}
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <input
                              type="radio"
                              name="routine-visibility"
                              className="accent-primary h-4 w-4"
                              checked={draft.visibility === o.v}
                              onChange={() => set("visibility", o.v)}
                            />
                            <o.icon className="text-muted-foreground h-4 w-4" />
                            {o.label}
                          </span>
                          <span className="text-muted-foreground mt-1 block text-xs">{o.hint}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <DialogTitle className="text-lg font-bold">Tasks</DialogTitle>
                  <DialogDescription>
                    The activities you&apos;ll check off each time the routine comes around.
                  </DialogDescription>
                </div>
                <ol className="space-y-2">
                  {draft.activities.map((a, i) => (
                    <li key={a.key} className="bg-card rounded-xl border p-2">
                      <div className="flex items-center gap-2">
                      <GripVertical className="text-muted-foreground/50 hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
                      <Input
                        id={`routine-activity-${a.key}`}
                        aria-label={`Activity ${i + 1}`}
                        value={a.title}
                        maxLength={200}
                        placeholder="e.g. Review business finances"
                        className="min-w-0 flex-1 border-0 shadow-none focus-visible:ring-0"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            activities: d.activities.map((x) => (x.key === a.key ? { ...x, title: e.target.value } : x)),
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && a.title.trim() && draft.activities.length < MAX_ROUTINE_ACTIVITIES) {
                            e.preventDefault();
                            setDraft((d) => ({
                              ...d,
                              activities: [...d.activities.slice(0, i + 1), blankActivity(), ...d.activities.slice(i + 1)],
                            }));
                          }
                        }}
                      />
                      <label className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                        <Input
                          id={`routine-activity-est-${a.key}`}
                          aria-label={`Minutes for activity ${i + 1}`}
                          inputMode="numeric"
                          value={a.estimate}
                          placeholder="15"
                          className="h-8 w-14 px-2 text-right tabular-nums"
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              activities: d.activities.map((x) =>
                                x.key === a.key ? { ...x, estimate: e.target.value.replace(/\D/g, "").slice(0, 4) } : x
                              ),
                            }))
                          }
                        />
                        min
                      </label>
                      <div className="flex shrink-0">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveActivity(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveActivity(i, 1)} disabled={i === draft.activities.length - 1} aria-label="Move down">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Remove activity"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              activities:
                                d.activities.length === 1
                                  ? [blankActivity()]
                                  : d.activities.filter((x) => x.key !== a.key),
                            }))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      </div>
                      <div className="mt-2">
                        <Textarea
                          aria-label={`Description for activity ${i + 1}`}
                          value={a.description}
                          maxLength={2000}
                          rows={2}
                          placeholder="Optional task description"
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              activities: d.activities.map((x) => (x.key === a.key ? { ...x, description: e.target.value } : x)),
                            }))
                          }
                        />
                      </div>
                      <div className="mt-2">
                        <ActivityScheduleFields
                          activity={a}
                          onChange={(patch) =>
                            setDraft((d) => ({
                              ...d,
                              activities: d.activities.map((x) => (x.key === a.key ? { ...x, ...patch } : x)),
                            }))
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={draft.activities.length >= MAX_ROUTINE_ACTIVITIES}
                    onClick={() => set("activities", [...draft.activities, blankActivity()])}
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Add activity
                  </Button>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {validActivities.length} {validActivities.length === 1 ? "activity" : "activities"}
                    {totalMinutes > 0 && ` · ~${totalMinutes} min`}
                  </span>
                </div>
                {routine && (
                  <p className="text-muted-foreground text-xs">
                    Changes apply from today. Past dates keep the activities they had.
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <DialogTitle className="text-lg font-bold">Review</DialogTitle>
                  <DialogDescription>Check everything before you {routine ? "save" : "create the routine"}.</DialogDescription>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border p-4">
                  <RoutineIcon icon={draft.icon} color={draft.color} />
                  <div className="min-w-0">
                    <p className="font-bold">{draft.name || "Untitled routine"}</p>
                    {draft.description && <p className="text-muted-foreground text-sm">{draft.description}</p>}
                  </div>
                </div>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Activities</dt>
                    <dd>
                      {validActivities.length}
                      {totalMinutes > 0 && ` · ~${totalMinutes} min`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Visible to</dt>
                    <dd>{draft.visibility === "shared" ? "Everyone in this workspace" : "Only me"}</dd>
                  </div>
                </dl>
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Task schedules</p>
                  <ol className="divide-y rounded-xl border text-sm">
                    {validActivities.map((a) => {
                      const schedule = (() => { try { return normalizeSchedule(scheduleBody(a.schedule), localToday()); } catch { return null; } })();
                      return <li key={a.key} className="space-y-1 px-3 py-2"><p className="font-medium">{a.title}</p><p className="text-muted-foreground text-xs">{schedule ? describeScheduleLong(schedule) : "Schedule needs attention"} · {describeTime(a.timeMode, a.timeMode === "block" ? a.timeBlock : null, a.timeMode === "time" ? a.time : null)}{a.estimate ? ` · ${a.estimate} min` : ""}</p></li>;
                    })}
                  </ol>
                </div>
                <ol className="divide-y rounded-xl border text-sm">
                  {validActivities.map((a) => (
                    <li key={a.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate">{a.title}</span>
                      {a.estimate && <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{a.estimate} min</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t px-5 py-3">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)} disabled={saving}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          )}
          <div className="flex gap-2">
            {routine && step < 2 && (
              <Button variant="outline" onClick={save} disabled={saving}>
                Save
              </Button>
            )}
            {step < 2 ? (
              <Button onClick={next}>
                {nextLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : routine ? "Save Routine" : "Create Routine"}
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
