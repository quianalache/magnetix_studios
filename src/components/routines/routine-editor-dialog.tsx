"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSubAccount } from "@/context/sub-account-context";
import { createRoutineApi, updateRoutineApi } from "@/lib/client/routines-api";
import {
  addDaysYmd,
  describeScheduleLong,
  describeTime,
  formatYmd,
  normalizeSchedule,
  occurrencesBetween,
  ordinal,
  ScheduleError,
  utcToYmd,
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

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Basic Info", "Tasks", "Schedule", "Review"] as const;

interface ActivityDraft {
  key: string;
  id?: string;
  title: string;
  estimate: string;
}

interface Draft {
  name: string;
  description: string;
  icon: RoutineIconKey;
  color: RoutineColorKey;
  activities: ActivityDraft[];
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
  timeMode: RoutineTimeMode;
  timeBlock: RoutineTimeBlock;
  time: string;
  projectId: string;
  endsWithProject: boolean;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function blankDraft(): Draft {
  const today = localToday();
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay();
  return {
    name: "",
    description: "",
    icon: "laptop",
    color: "violet",
    activities: [{ key: newKey(), title: "", estimate: "" }],
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
    timeMode: "anytime",
    timeBlock: "am",
    time: "09:00",
    projectId: "",
    endsWithProject: false,
  };
}

function draftFrom(r: RoutineView): Draft {
  const s = r.schedule;
  return {
    name: r.name,
    description: r.description,
    icon: r.icon,
    color: r.color,
    activities: r.activities.map((a) => ({
      key: newKey(),
      id: a.id,
      title: a.title,
      estimate: a.estimateMinutes ? String(a.estimateMinutes) : "",
    })),
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
    timeMode: r.timeMode,
    timeBlock: r.timeBlock ?? "am",
    time: r.time ?? "09:00",
    projectId: r.projectId ?? "",
    endsWithProject: r.endsWithProject,
  };
}

function scheduleBody(d: Draft) {
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

function toBody(d: Draft) {
  return {
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
      })),
    schedule: scheduleBody(d),
    timeMode: d.timeMode,
    timeBlock: d.timeMode === "block" ? d.timeBlock : null,
    time: d.timeMode === "time" ? d.time : null,
    projectId: d.projectId || null,
    endsWithProject: !!d.projectId && d.endsWithProject,
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

function Radio({
  checked,
  onSelect,
  label,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border p-3 transition-colors", checked ? "border-primary/50 bg-primary/5" : "")}>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
        <input type="radio" checked={checked} onChange={onSelect} className="accent-primary h-4 w-4" />
        {label}
      </label>
      {checked && children && <div className="mt-3 space-y-3 pl-6">{children}</div>}
    </div>
  );
}

const NTH_OPTIONS = [1, 2, 3, 4, 5, -1];

function NthPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weeks of the month">
      {NTH_OPTIONS.map((n) => {
        const on = value.includes(n);
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== n) : [...value, n])}
            className={cn(
              "min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            )}
          >
            {n === -1 ? "Last" : ordinal(n)}
          </button>
        );
      })}
    </div>
  );
}

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
  initialStep?: Step;
  projects: Project[];
  onSaved: (routine: RoutineView) => void;
}) {
  const { subAccountId } = useSubAccount();
  const [step, setStep] = useState<Step>(0);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [datesText, setDatesText] = useState("1, 15");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = routine ? draftFrom(routine) : blankDraft();
    setDraft(d);
    setDatesText(d.monthDates.map((n) => (n === -1 ? "last" : String(n))).join(", "));
    setStep(initialStep);
  }, [open, routine, initialStep]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const scheduleCheck = useMemo((): { schedule: RoutineSchedule | null; error: string | null } => {
    try {
      return { schedule: normalizeSchedule(scheduleBody(draft), localToday()), error: null };
    } catch (err) {
      return { schedule: null, error: err instanceof ScheduleError ? err.message : "Check the schedule." };
    }
  }, [draft]);

  const selectedProject = projects.find((p) => p.id === draft.projectId) ?? null;
  const projectEnd = useMemo(() => {
    if (!selectedProject || !draft.endsWithProject) return null;
    const due = selectedProject.dueAt as { toDate?: () => Date } | null;
    const d = due && typeof due.toDate === "function" ? due.toDate() : null;
    return d ? utcToYmd(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))) : null;
  }, [selectedProject, draft.endsWithProject]);

  const preview = useMemo(() => {
    if (!scheduleCheck.schedule) return [];
    const from = [localToday(), scheduleCheck.schedule.startDate].sort()[1];
    return occurrencesBetween(scheduleCheck.schedule, from, addDaysYmd(from, 400), projectEnd, 5);
  }, [scheduleCheck.schedule, projectEnd]);

  const validActivities = draft.activities.filter((a) => a.title.trim());
  const totalMinutes = validActivities.reduce((s, a) => s + (Number(a.estimate) || 0), 0);

  const stepError: Record<Step, string | null> = {
    0: draft.name.trim() ? null : "Give the routine a title.",
    1: validActivities.length ? null : "Add at least one activity.",
    2:
      (draft.frequency === "daily" && draft.days.length === 0 ? "Choose at least one day." : null) ??
      scheduleCheck.error ??
      (draft.timeMode === "time" && !/^\d{2}:\d{2}$/.test(draft.time) ? "Enter a specific time." : null),
    3: null,
  };

  async function save() {
    for (const s of [0, 1, 2] as Step[]) {
      if (stepError[s]) {
        setStep(s);
        toast.error(stepError[s]!);
        return;
      }
    }
    setSaving(true);
    try {
      const body = toBody(draft);
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
    setStep((s) => Math.min(3, s + 1) as Step);
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

  const nextLabel = ["Next: Add Tasks", "Next: Schedule", "Next: Review"][step];

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
                    <li key={a.key} className="bg-card flex items-center gap-2 rounded-xl border p-2">
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
                              activities: [...d.activities.slice(0, i + 1), { key: newKey(), title: "", estimate: "" }, ...d.activities.slice(i + 1)],
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
                                  ? [{ key: newKey(), title: "", estimate: "" }]
                                  : d.activities.filter((x) => x.key !== a.key),
                            }))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
                    onClick={() => set("activities", [...draft.activities, { key: newKey(), title: "", estimate: "" }])}
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
              <div className="space-y-5">
                <div>
                  <DialogTitle className="text-lg font-bold">Schedule</DialogTitle>
                  <DialogDescription>Choose when this routine repeats.</DialogDescription>
                </div>

                <div className="space-y-2">
                  <Label>
                    Recurrence <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {(["daily", "weekly", "monthly", "custom"] as const).map((f) => (
                      <Chip
                        key={f}
                        active={draft.frequency === f}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            frequency: f,
                            interval: 1,
                            days:
                              f === "daily"
                                ? [0, 1, 2, 3, 4, 5, 6]
                                : f === "weekly" && (d.days.length === 0 || d.days.length === 7)
                                  ? [new Date(`${d.startDate}T00:00:00Z`).getUTCDay()]
                                  : d.days,
                          }))
                        }
                      >
                        {f[0].toUpperCase() + f.slice(1)}
                      </Chip>
                    ))}
                  </div>
                </div>

                {draft.frequency === "daily" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Label htmlFor="routine-every">Repeat every</Label>
                      <NumberSelect id="routine-every" value={draft.interval} max={30} onChange={(n) => set("interval", n)} />
                      <span>{draft.interval === 1 ? "day" : "days"}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label>On these days</Label>
                      <DayPicker value={draft.days} onChange={(v) => set("days", v)} />
                    </div>
                  </div>
                )}

                {draft.frequency === "weekly" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Label htmlFor="routine-every">Repeat every</Label>
                      <NumberSelect id="routine-every" value={draft.interval} max={12} onChange={(n) => set("interval", n)} />
                      <span>{draft.interval === 1 ? "week" : "weeks"}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        On these days <span className="text-destructive">*</span>
                      </Label>
                      <DayPicker value={draft.days} onChange={(v) => set("days", v)} />
                    </div>
                  </div>
                )}

                {draft.frequency === "monthly" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Label htmlFor="routine-every">Repeat every</Label>
                      <NumberSelect id="routine-every" value={draft.interval} max={12} onChange={(n) => set("interval", n)} />
                      <span>{draft.interval === 1 ? "month" : "months"}</span>
                    </div>
                    <Radio checked={draft.monthMode === "dates"} onSelect={() => set("monthMode", "dates")} label="On a day of the month">
                      <select
                        id="routine-month-day"
                        aria-label="Day of the month"
                        className={selectCls}
                        value={draft.monthDates[0] ?? 1}
                        onChange={(e) => set("monthDates", [Number(e.target.value)])}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {ordinal(n)}
                          </option>
                        ))}
                        <option value={-1}>Last day</option>
                      </select>
                      {(draft.monthDates[0] ?? 1) > 28 && (
                        <p className="text-muted-foreground text-xs">In shorter months it runs on the last day.</p>
                      )}
                    </Radio>
                    <Radio checked={draft.monthMode === "weekdays"} onSelect={() => set("monthMode", "weekdays")} label="On a weekday of the month">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          id="routine-month-nth"
                          aria-label="Which week"
                          className={selectCls}
                          value={draft.nthWeeks[0] ?? 1}
                          onChange={(e) => set("nthWeeks", [Number(e.target.value)])}
                        >
                          {NTH_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n === -1 ? "Last" : ordinal(n)}
                            </option>
                          ))}
                        </select>
                        <WeekdaySelect id="routine-month-weekday" value={draft.weekday} onChange={(n) => set("weekday", n)} />
                      </div>
                    </Radio>
                  </div>
                )}

                {draft.frequency === "custom" && (
                  <div className="space-y-2">
                    <Label>Custom Recurrence</Label>
                    <Radio checked={draft.customMode === "weeks"} onSelect={() => setDraft((d) => ({ ...d, customMode: "weeks", interval: Math.max(2, d.interval), days: d.days.length && d.days.length < 7 ? d.days : [1] }))} label="Every few weeks">
                      <div className="flex items-center gap-2 text-sm">
                        Every
                        <NumberSelect id="routine-custom-weeks" value={draft.interval} max={12} onChange={(n) => set("interval", n)} />
                        weeks, on
                      </div>
                      <DayPicker value={draft.days} onChange={(v) => set("days", v)} />
                    </Radio>
                    <Radio
                      checked={draft.customMode === "nthWeekday"}
                      onSelect={() => setDraft((d) => ({ ...d, customMode: "nthWeekday", interval: 1 }))}
                      label="On specific days of the month"
                    >
                      <p className="text-muted-foreground text-xs">For example, the 1st and 3rd Thursday.</p>
                      <NthPicker value={draft.nthWeeks} onChange={(v) => set("nthWeeks", v)} />
                      <WeekdaySelect id="routine-custom-weekday" value={draft.weekday} onChange={(n) => set("weekday", n)} />
                    </Radio>
                    <Radio checked={draft.customMode === "months"} onSelect={() => setDraft((d) => ({ ...d, customMode: "months", interval: Math.max(2, d.interval) }))} label="Every few months">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        Every
                        <NumberSelect id="routine-custom-months" value={draft.interval} max={12} onChange={(n) => set("interval", n)} />
                        months, on the
                        <select
                          id="routine-custom-months-day"
                          aria-label="Day of the month"
                          className={selectCls}
                          value={draft.monthDates[0] ?? 1}
                          onChange={(e) => set("monthDates", [Number(e.target.value)])}
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {ordinal(n)}
                            </option>
                          ))}
                          <option value={-1}>last day</option>
                        </select>
                      </div>
                    </Radio>
                    <Radio checked={draft.customMode === "dates"} onSelect={() => setDraft((d) => ({ ...d, customMode: "dates", interval: 1 }))} label="On specific dates">
                      <Input
                        id="routine-custom-dates"
                        value={datesText}
                        placeholder="1, 15"
                        onChange={(e) => {
                          setDatesText(e.target.value);
                          set("monthDates", parseDates(e.target.value));
                        }}
                      />
                      <p className="text-muted-foreground text-xs">Days of the month, separated by commas (e.g. 1, 15, 28 or &ldquo;last&rdquo;).</p>
                    </Radio>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="routine-start">Starts</Label>
                    <Input id="routine-start" type="date" value={draft.startDate} onChange={(e) => e.target.value && set("startDate", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="routine-ends">Ends</Label>
                    <div className="flex gap-2">
                      <select
                        id="routine-ends"
                        className={cn(selectCls, "flex-1")}
                        value={draft.endsOn}
                        onChange={(e) => set("endsOn", e.target.value as Draft["endsOn"])}
                      >
                        <option value="never">Never</option>
                        <option value="date">On a date</option>
                      </select>
                      {draft.endsOn === "date" && (
                        <Input
                          id="routine-end-date"
                          type="date"
                          aria-label="End date"
                          className="flex-1"
                          value={draft.endDate}
                          min={draft.startDate}
                          onChange={(e) => set("endDate", e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Time Preference</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        { mode: "anytime", label: "Anytime", hint: "Shown as all-day on the calendar" },
                        { mode: "block", label: "Time Block", hint: "Shown in the selected time block" },
                        { mode: "time", label: "Specific Time", hint: "Shown at this exact time" },
                      ] as const
                    ).map((o) => (
                      <label
                        key={o.mode}
                        className={cn(
                          "cursor-pointer rounded-xl border p-3 text-sm transition-colors",
                          draft.timeMode === o.mode ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
                        )}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <input
                            type="radio"
                            name="routine-time-mode"
                            className="accent-primary h-4 w-4"
                            checked={draft.timeMode === o.mode}
                            onChange={() => set("timeMode", o.mode)}
                          />
                          {o.label}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-xs">{o.hint}</span>
                        {o.mode === "block" && draft.timeMode === "block" && (
                          <select
                            id="routine-time-block"
                            aria-label="Time block"
                            className={cn(selectCls, "mt-2 w-full")}
                            value={draft.timeBlock}
                            onChange={(e) => set("timeBlock", e.target.value as RoutineTimeBlock)}
                          >
                            <option value="am">AM</option>
                            <option value="midday">Midday</option>
                            <option value="pm">PM</option>
                          </select>
                        )}
                        {o.mode === "time" && draft.timeMode === "time" && (
                          <Input
                            id="routine-time"
                            type="time"
                            aria-label="Time"
                            className="mt-2"
                            value={draft.time}
                            onChange={(e) => set("time", e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="routine-project">Project (optional)</Label>
                  <select
                    id="routine-project"
                    className={cn(selectCls, "w-full")}
                    value={draft.projectId}
                    onChange={(e) => setDraft((d) => ({ ...d, projectId: e.target.value, endsWithProject: e.target.value ? d.endsWithProject : false }))}
                  >
                    <option value="">No project — runs on its own</option>
                    {projects
                      .filter((p) => p.status === "active" || p.id === draft.projectId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                  </select>
                  {draft.projectId && (
                    <label className="flex items-center gap-2.5 text-sm">
                      <Switch checked={draft.endsWithProject} onCheckedChange={(v) => set("endsWithProject", v === true)} />
                      Stop when the project ends
                    </label>
                  )}
                </div>

                {scheduleCheck.error && (
                  <p className="text-destructive text-sm" role="alert">
                    {scheduleCheck.error}
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
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
                    <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Repeats</dt>
                    <dd>{scheduleCheck.schedule ? describeScheduleLong(scheduleCheck.schedule) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Time</dt>
                    <dd>{describeTime(draft.timeMode, draft.timeMode === "block" ? draft.timeBlock : null, draft.timeMode === "time" ? draft.time : null)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Activities</dt>
                    <dd>
                      {validActivities.length}
                      {totalMinutes > 0 && ` · ~${totalMinutes} min`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Ends</dt>
                    <dd>
                      {draft.endsOn === "date" && draft.endDate
                        ? formatYmd(draft.endDate, { month: "short", day: "numeric", year: "numeric" })
                        : draft.endsWithProject && selectedProject
                          ? `When “${selectedProject.title}” ends`
                          : "Never"}
                    </dd>
                  </div>
                  {selectedProject && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Project</dt>
                      <dd>{selectedProject.title}</dd>
                    </div>
                  )}
                </dl>
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Next dates</p>
                  {preview.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {preview.map((d) => (
                        <li key={d} className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium tabular-nums">
                          {formatYmd(d)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">No upcoming dates with this schedule.</p>
                  )}
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
            {routine && step < 3 && (
              <Button variant="outline" onClick={save} disabled={saving}>
                Save
              </Button>
            )}
            {step < 3 ? (
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
