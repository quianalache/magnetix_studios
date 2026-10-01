"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskDetailModal } from "@/components/tasks/detail/task-detail-modal";
import { cn } from "@/lib/utils";
import { useSubAccount } from "@/context/sub-account-context";
import {
  completeRoutineActivityApi,
  completeRoutineDateApi,
  getRoutineApi,
  getRoutineHistoryApi,
  updateRoutineApi,
} from "@/lib/client/routines-api";
import {
  addDaysYmd,
  describeScheduleLong,
  describeTime,
  formatYmd,
  monthEndYmd,
  monthStartYmd,
  occurrencesBetween,
  WEEKDAY_SHORT,
  weekdayOf,
  weekStartYmd,
} from "@/lib/routines/schedule";
import type {
  RoutineDaySummary,
  RoutineOccurrenceTask,
  RoutineView,
} from "@/types/routines";
import { RoutineIcon, RoutineProgressBar, routineHex } from "./routine-look";
import { RoutineVisibilityBadge } from "./routine-card";

type Tab = "overview" | "tasks" | "schedule" | "history";

interface Detail {
  today: string;
  routine: RoutineView;
  days: RoutineDaySummary[];
  tasks: RoutineOccurrenceTask[];
  nextDate: string | null;
}

/** Early check-off window — mirrors EARLY_COMPLETION_DAYS on the server. */
const EARLY_DAYS = 7;

function occurrenceId(routineId: string, date: string, activityId: string) {
  return `rt_${routineId}_${date.replace(/-/g, "")}_${activityId}`;
}

function periodFor(routine: RoutineView | null, date: string) {
  if (routine?.schedule.unit === "month") {
    return { kind: "month" as const, from: monthStartYmd(date), to: monthEndYmd(date) };
  }
  const from = weekStartYmd(date);
  return { kind: "week" as const, from, to: addDaysYmd(from, 6) };
}

export function RoutineDetailSheet({
  routineId,
  initialDate,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onChanged,
  embedded = false,
}: {
  routineId: string | null;
  initialDate: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (routine: RoutineView, step?: 0 | 1 | 2 | 3) => void;
  onDelete: (routine: RoutineView) => void;
  /** Something changed (completion, pause) — refresh the library. */
  onChanged: () => void;
  embedded?: boolean;
}) {
  const { subAccountId } = useSubAccount();
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(initialDate);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const period = useMemo(
    () => (selected ? periodFor(detail?.routine ?? null, selected) : null),
    [selected, detail?.routine]
  );

  const load = useCallback(
    async (date: string | null, unitHint?: "month" | "week") => {
      if (!routineId) return;
      setLoading(true);
      try {
        // First load: fetch the current week; switch to the month once we know it's monthly.
        const anchor = date ?? new Date().toISOString().slice(0, 10);
        const p =
          unitHint === "month"
            ? { from: monthStartYmd(anchor), to: monthEndYmd(anchor) }
            : { from: weekStartYmd(anchor), to: addDaysYmd(weekStartYmd(anchor), 6) };
        let res = await getRoutineApi(subAccountId, routineId, p.from, p.to);
        if (!unitHint && res.routine.schedule.unit === "month") {
          const a = date ?? res.today;
          res = await getRoutineApi(subAccountId, routineId, monthStartYmd(a), monthEndYmd(a));
        }
        setDetail(res);
        setSelected((cur) => cur ?? date ?? res.today);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [routineId, subAccountId]
  );

  useEffect(() => {
    if (!open || !routineId) return;
    setDetail(null);
    setTab("overview");
    setSelected(initialDate);
    void load(initialDate);
  }, [open, routineId, initialDate, load]);

  const routine = detail?.routine ?? null;
  const today = detail?.today ?? null;
  const hex = routine ? routineHex(routine.color) : "#7c3aed";

  async function refresh(date: string | null = selected) {
    await load(date, routine?.schedule.unit === "month" ? "month" : "week");
  }

  function goTo(date: string) {
    setSelected(date);
    if (!period || date < period.from || date > period.to) void refresh(date);
  }

  function shift(dir: -1 | 1) {
    if (!period || !selected) return;
    const next =
      period.kind === "month"
        ? monthStartYmd(dir === 1 ? addDaysYmd(period.to, 1) : addDaysYmd(period.from, -1))
        : addDaysYmd(selected, dir * 7);
    setSelected(next);
    void refresh(next);
  }

  // Cells for the strip: every day of the week, or the run dates of the month.
  const cells = useMemo(() => {
    if (!detail || !period) return [];
    if (period.kind === "week") return detail.days;
    return detail.days.filter((d) => d.scheduled || d.recorded);
  }, [detail, period]);

  const selectedSummary = detail?.days.find((d) => d.date === selected) ?? null;
  const selectedTasks = useMemo(
    () => (detail && selected ? detail.tasks.filter((t) => t.date === selected) : []),
    [detail, selected]
  );
  // Activities to show for the selected date: the recorded tasks (history as
  // it was), or — for a not-yet-generated run date — the current activities.
  const rows = useMemo(() => {
    if (!routine || !selected) return [];
    if (selectedTasks.length) {
      const order = new Map(routine.activities.map((a, i) => [a.id, i]));
      return [...selectedTasks]
        .sort((a, b) => (order.get(a.activityId) ?? 99) - (order.get(b.activityId) ?? 99))
        .map((t) => ({
          key: t.id,
          activityId: t.activityId,
          title: t.title,
          estimateMinutes: t.estimateMinutes,
          completed: t.completed,
          taskId: t.id as string | null,
          timeSpentSeconds: t.timeSpentSeconds,
        }));
    }
    if (!selectedSummary?.scheduled) return [];
    return routine.activities.map((a) => ({
      key: a.id,
      activityId: a.id,
      title: a.title,
      estimateMinutes: a.estimateMinutes,
      completed: false,
          taskId: occurrenceId(routine.id, selected, a.id),
      timeSpentSeconds: 0,
    }));
  }, [routine, selected, selectedTasks, selectedSummary]);

  const canCheck = !!(today && selected && selected <= addDaysYmd(today, EARLY_DAYS));
  const doneCount = rows.filter((r) => r.completed).length;

  async function toggle(activityId: string, completed: boolean) {
    if (!routine || !selected) return;
    setBusy(activityId);
    // Optimistic: flip the row locally, then reconcile from the server.
    setDetail((d) =>
      d
        ? {
            ...d,
            tasks: d.tasks.map((t) =>
              t.date === selected && t.activityId === activityId ? { ...t, completed } : t
            ),
          }
        : d
    );
    try {
      await completeRoutineActivityApi(subAccountId, routine.id, selected, activityId, completed);
      await refresh();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function markAll() {
    if (!routine || !selected) return;
    setBusy("__all");
    try {
      const r = await completeRoutineDateApi(subAccountId, routine.id, selected);
      toast.success(r.completed ? `Marked ${r.completed} complete` : "Already complete");
      await refresh();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(active: boolean) {
    if (!routine) return;
    setBusy("__status");
    try {
      await updateRoutineApi(subAccountId, routine.id, { status: active ? "active" : "paused" });
      toast.success(active ? "Routine resumed" : "Routine paused");
      await refresh();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const totalMinutes = routine?.activities.reduce((s, a) => s + (a.estimateMinutes ?? 0), 0) ?? 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          inline={embedded}
          className={cn(
            "w-full gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl",
            embedded && "min-h-[680px] rounded-2xl border shadow-xs"
          )}
        >
          {!routine ? (
            <div className="flex flex-1 items-center justify-center">
              <SheetTitle className="sr-only">Routine</SheetTitle>
              <SheetDescription className="sr-only">Loading routine</SheetDescription>
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <header className="flex items-start gap-3 border-b px-5 pt-5 pb-4">
                <RoutineIcon icon={routine.icon} color={routine.color} />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-xl leading-tight font-bold">{routine.name}</SheetTitle>
                  <SheetDescription className="text-muted-foreground mt-0.5 text-xs">
                    {routine.visibility === "shared" ? "Shared routine" : "Personal routine"}
                  </SheetDescription>
                </div>
                {routine.canManage && (
                <label className="flex shrink-0 items-center gap-2 pt-1 text-sm">
                  <Switch
                    checked={routine.status === "active"}
                    disabled={busy === "__status"}
                    onCheckedChange={(v) => toggleActive(v === true)}
                    aria-label={routine.status === "active" ? "Pause routine" : "Resume routine"}
                  />
                  <span className="hidden sm:inline">{routine.status === "active" ? "Active" : "Paused"}</span>
                </label>
                )}
                {routine.canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Routine actions" />}>
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onEdit(routine)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit routine
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(routine)} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </header>

              <div role="tablist" aria-label="Routine sections" className="bg-muted/50 mx-5 mt-4 grid grid-cols-4 gap-1 rounded-xl p-1">
                {(
                  [
                    ["overview", "Overview"],
                    ["tasks", "Tasks"],
                    ["schedule", "Schedule"],
                    ["history", "History"],
                  ] as [Tab, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    type="button"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                      tab === id ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                    {id === "tasks" && (
                      <span className="bg-primary/10 text-primary rounded-full px-1.5 text-[11px] tabular-nums">
                        {routine.activities.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-8">
                {tab === "overview" && (
                  <div className="space-y-6">
                    <section>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-primary text-base font-semibold">Description</h3>
                        {routine.canManage && (
                          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onEdit(routine)}>
                            Edit
                          </Button>
                        )}
                      </div>
                      <p className={cn("mt-1 text-sm", !routine.description && "text-muted-foreground")}>
                        {routine.description || "No description yet."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <MetaChip icon={<ListChecks className="h-3.5 w-3.5" />}>
                          {routine.activities.length} {routine.activities.length === 1 ? "task" : "tasks"}
                        </MetaChip>
                        {totalMinutes > 0 && <MetaChip icon={<Timer className="h-3.5 w-3.5" />}>~ {totalMinutes} min</MetaChip>}
                        <RoutineVisibilityBadge routine={routine} className="rounded-lg px-2.5 py-1" />
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <Aggregate label="Due today" value={selectedSummary?.date === today ? `${selectedSummary.done}/${selectedSummary.total}` : "—"} />
                        <Aggregate label="Next scheduled task" value={detail?.nextDate ? formatYmd(detail.nextDate, { month: "short", day: "numeric" }) : "—"} />
                        <Aggregate label="Current progress" value={`${selectedSummary?.done ?? 0}/${selectedSummary?.total ?? 0}`} />
                      </div>
                      {routine.status === "paused" && (
                        <p className="bg-muted text-muted-foreground mt-3 rounded-lg px-3 py-2 text-xs">
                          Paused — no new activities are created until you resume it. Past records stay as they are.
                        </p>
                      )}
                      {routine.windowClosed && (
                        <p className="bg-muted text-muted-foreground mt-3 rounded-lg px-3 py-2 text-xs">
                          This routine follows its project, which is no longer active.
                        </p>
                      )}
                    </section>

                    <section aria-label={period?.kind === "month" ? "This month" : "This week"}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">
                          {period?.kind === "month"
                            ? formatYmd(period.from, { month: "long", year: "numeric" })
                            : today && period && today >= period.from && today <= period.to
                              ? "This Week"
                              : period
                                ? `Week of ${formatYmd(period.from, { month: "short", day: "numeric" })}`
                                : ""}
                        </h3>
                        <div className="flex items-center gap-1">
                          {loading && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="Previous">
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => today && goTo(today)}>
                            Today
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="Next">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "mt-3 grid gap-1.5",
                          period?.kind === "week" ? "grid-cols-7" : "grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))]"
                        )}
                      >
                        {cells.map((d) => (
                          <DayCell
                            key={d.date}
                            day={d}
                            today={today ?? ""}
                            selected={d.date === selected}
                            hex={hex}
                            onSelect={() => setSelected(d.date)}
                          />
                        ))}
                        {period?.kind === "month" && cells.length === 0 && (
                          <p className="text-muted-foreground col-span-full py-3 text-sm">Not scheduled this month.</p>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        <Legend swatch={{ background: `color-mix(in oklab, ${hex} 16%, var(--card))`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${hex} 35%, transparent)` }}>
                          Scheduled
                        </Legend>
                        <Legend swatch={{ background: `conic-gradient(${hex} 180deg, color-mix(in oklab, ${hex} 16%, var(--card)) 0deg)` }}>Partly done</Legend>
                        <Legend swatch={{ background: hex }}>Done</Legend>
                        <Legend swatch={{ background: "var(--muted)" }}>Not scheduled</Legend>
                      </p>
                    </section>

                    {selected && (
                      <section aria-label="Selected day">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-base font-semibold">
                            {formatYmd(selected)} Progress
                          </h3>
                          <span className="text-sm font-semibold tabular-nums">
                            {doneCount}/{rows.length || selectedSummary?.total || 0}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <RoutineProgressBar done={doneCount} total={rows.length} color={routine.color} className="flex-1" />
                          {rows.length > 0 && doneCount < rows.length && canCheck && (
                            <Button size="sm" variant="outline" onClick={markAll} disabled={busy !== null}>
                              {busy === "__all" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                              Mark All Complete
                            </Button>
                          )}
                        </div>
                        {rows.length === 0 ? (
                          <p className="text-muted-foreground mt-4 text-sm">
                            {routine.status === "paused" && selectedSummary && !selectedSummary.recorded && today && selected >= today
                              ? "Paused — nothing scheduled while the routine is paused."
                              : "Not scheduled on this day."}
                            {detail?.nextDate && selected !== detail.nextDate && (
                              <>
                                {" "}
                                <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => goTo(detail.nextDate!)}>
                                  Next: {formatYmd(detail.nextDate)}
                                </button>
                              </>
                            )}
                          </p>
                        ) : (
                          <ul className="mt-3 divide-y rounded-xl border">
                            {rows.map((r) => (
                              <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
                                <Checkbox
                                  checked={r.completed}
                                  disabled={!canCheck || busy !== null}
                                  onCheckedChange={(v) => toggle(r.activityId, v === true)}
                                  aria-label={`${r.completed ? "Reopen" : "Complete"} ${r.title}`}
                                />
                                <span className={cn("min-w-0 flex-1 text-sm", r.completed && "text-muted-foreground line-through")}>
                                  {r.title}
                                </span>
                                {r.timeSpentSeconds > 0 && (
                                  <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline" title="Time tracked">
                                    {Math.round(r.timeSpentSeconds / 60)}m tracked
                                  </span>
                                )}
                                {r.estimateMinutes ? (
                                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{r.estimateMinutes} min</span>
                                ) : null}
                                {r.taskId && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => setOpenTaskId(r.taskId)}
                                    aria-label={`Open ${r.title} details`}
                                    title="Open task (notes, checklist, time tracking)"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!canCheck && rows.length > 0 && (
                          <p className="text-muted-foreground mt-2 text-xs">You can check this day off closer to the date.</p>
                        )}
                      </section>
                    )}
                  </div>
                )}

                {tab === "tasks" && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-muted-foreground text-sm">
                        Each task keeps its own recurrence and next occurrence. Historical completion records are never rewritten.
                      </p>
                      {routine.canManage && (
                        <Button variant="outline" size="sm" className="shrink-0" onClick={() => onEdit(routine, 1)}>
                          <Pencil className="mr-1.5 h-4 w-4" /> Add task
                        </Button>
                      )}
                    </div>
                    {routine.activities.length === 0 ? (
                      <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                        <p className="text-sm font-medium">No tasks yet</p>
                        <p className="text-muted-foreground mt-1 text-xs">Add the first recurring task to this routine.</p>
                      </div>
                    ) : <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead><tr className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wider uppercase">
                          <th className="px-3 py-2.5">Task</th><th className="px-3 py-2.5">Recurrence / next</th><th className="px-3 py-2.5">Time</th><th className="px-3 py-2.5">Estimate</th><th className="px-3 py-2.5">Actions</th>
                        </tr></thead>
                        <tbody>{routine.activities.map((a, i) => {
                        const next = routine.status === "active" && !routine.windowClosed
                          ? occurrencesBetween(a.schedule ?? routine.schedule, today ?? routine.schedule.startDate, addDaysYmd(today ?? routine.schedule.startDate, 400), null, 1)[0] ?? null
                          : null;
                        const taskId = next ? occurrenceId(routine.id, next, a.id) : null;
                        return (
                        <tr key={a.id} className="hover:bg-muted/40 border-b last:border-b-0">
                          <td className="px-3 py-3"><div className="min-w-0"><p className="font-medium">{a.title}</p><p className="text-muted-foreground mt-0.5 text-xs">Task {i + 1}</p></div></td>
                          <td className="text-muted-foreground px-3 py-3 text-xs"><p>{describeScheduleLong(a.schedule ?? routine.schedule)}</p><p>{next ? `Next: ${formatYmd(next)}` : "No upcoming date"}</p></td>
                          <td className="text-muted-foreground px-3 py-3 text-xs">{describeTime(a.timeMode ?? routine.timeMode, a.timeBlock ?? routine.timeBlock, a.time ?? routine.time)}</td>
                          <td className="text-muted-foreground px-3 py-3 text-xs">{a.estimateMinutes ? `${a.estimateMinutes} min` : "—"}</td>
                          <td className="px-3 py-3">{taskId ? <Button variant="ghost" size="sm" onClick={() => setOpenTaskId(taskId)}>Open task</Button> : <span className="text-muted-foreground text-xs">—</span>}</td>
                        </tr>
                        );
                      })}</tbody>
                      </table>
                    </div>}
                  </div>
                )}

                {tab === "schedule" && (
                  <ScheduleTab routine={routine} today={today ?? ""} onEdit={routine.canManage ? () => onEdit(routine, 2) : null} />
                )}

                {tab === "history" && <HistoryTab routine={routine} today={today ?? ""} onPick={(d) => { setTab("overview"); goTo(d); }} />}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <TaskDetailModal
        taskId={openTaskId}
        open={!!openTaskId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenTaskId(null);
            void refresh();
            onChanged();
          }
        }}
      />
    </>
  );
}

function MetaChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="text-foreground/80 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </span>
  );
}

function Aggregate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-2">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: React.CSSProperties; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={swatch} aria-hidden />
      {children}
    </span>
  );
}

function DayCell({
  day,
  today,
  selected,
  hex,
  onSelect,
}: {
  day: RoutineDaySummary;
  today: string;
  selected: boolean;
  hex: string;
  onSelect: () => void;
}) {
  const complete = day.total > 0 && day.done >= day.total;
  const partial = day.done > 0 && !complete;
  const active = day.scheduled || day.recorded;
  const pct = day.total ? (day.done / day.total) * 360 : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${formatYmd(day.date)}: ${active ? `${day.done} of ${day.total} done` : "not scheduled"}`}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors",
        selected ? "border-primary bg-primary/5 ring-primary/30 ring-1" : "hover:bg-muted/60 border-transparent",
        day.date === today && !selected && "border-border"
      )}
    >
      <span className={cn("text-[11px] font-semibold", day.date === today ? "text-primary" : "text-muted-foreground")}>
        {WEEKDAY_SHORT[weekdayOf(day.date)]}
      </span>
      <span className="text-muted-foreground text-[10px] tabular-nums">
        {formatYmd(day.date, { month: "short", day: "numeric" })}
      </span>
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full"
        style={
          !active
            ? { background: "var(--muted)" }
            : complete
              ? { background: hex, color: "#fff" }
              : partial
                ? { background: `conic-gradient(${hex} ${pct}deg, color-mix(in oklab, ${hex} 16%, var(--card)) 0deg)` }
                : {
                    background: `color-mix(in oklab, ${hex} ${day.date < today ? 6 : 14}%, var(--card))`,
                    boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${hex} 40%, transparent)`,
                  }
        }
      >
        {complete && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function ScheduleTab({ routine, today, onEdit }: { routine: RoutineView; today: string; onEdit: (() => void) | null }) {
  const upcoming = useMemo(() => routine.activities.map((activity) => ({
    activity,
    dates: routine.status === "active" && !routine.windowClosed
      ? occurrencesBetween(activity.schedule ?? routine.schedule, today || routine.schedule.startDate, addDaysYmd(today || routine.schedule.startDate, 400), null, 4)
      : [],
  })), [routine, today]);
  return (
    <div className="space-y-5">
      <div className="divide-y rounded-xl border text-sm">
        {routine.activities.map((activity) => <div key={activity.id} className="flex flex-col gap-1 px-3 py-2.5"><span className="font-medium">{activity.title}</span><span className="text-muted-foreground text-xs">{describeScheduleLong(activity.schedule ?? routine.schedule)} · {describeTime(activity.timeMode ?? routine.timeMode, activity.timeBlock ?? routine.timeBlock, activity.time ?? routine.time)}</span></div>)}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Upcoming</h3>
        {upcoming.some((item) => item.dates.length) ? (
          <ul className="space-y-2">{upcoming.map((item) => item.dates.length ? <li key={item.activity.id}><span className="font-medium">{item.activity.title}:</span> <span className="text-muted-foreground">{item.dates.map((d) => formatYmd(d)).join(", ")}</span></li> : null)}</ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {routine.status === "paused" ? "Paused — resume it to schedule new dates." : "No upcoming dates."}
          </p>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          Each task keeps its own time preference; untimed tasks appear as all-day items.
        </p>
      </div>
      {onEdit && (
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-4 w-4" /> Edit task schedules
        </Button>
      )}
    </div>
  );
}

function HistoryTab({ routine, today, onPick }: { routine: RoutineView; today: string; onPick: (date: string) => void }) {
  const { subAccountId } = useSubAccount();
  const [entries, setEntries] = useState<RoutineDaySummary[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    getRoutineHistoryApi(subAccountId, routine.id)
      .then((r) => {
        if (cancelled) return;
        setEntries(r.entries);
        setNextBefore(r.nextBefore);
      })
      .catch((err) => toast.error((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [subAccountId, routine.id]);

  async function more() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const r = await getRoutineHistoryApi(subAccountId, routine.id, nextBefore);
      setEntries((e) => [...(e ?? []), ...r.entries.filter((x) => !(e ?? []).some((y) => y.date === x.date))]);
      setNextBefore(r.nextBefore);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!entries) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }
  const past = entries.filter((e) => e.date <= today);
  const completedCount = past.filter((e) => e.total > 0 && e.done >= e.total).length;
  if (past.length === 0) {
    return <p className="text-muted-foreground py-6 text-sm">No past occurrences yet. They&apos;ll collect here as the routine runs.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {completedCount} of {past.length} shown occurrences fully completed. Each date keeps its own record.
      </p>
      <ul className="divide-y rounded-xl border">
        {past.map((e) => {
          const complete = e.total > 0 && e.done >= e.total;
          return (
            <li key={e.date}>
              <button type="button" onClick={() => onPick(e.date)} className="hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <span className="w-28 shrink-0 text-sm font-medium">{formatYmd(e.date)}</span>
                <RoutineProgressBar done={e.done} total={e.total} color={routine.color} className="flex-1" />
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">
                  {e.done}/{e.total}
                </span>
                <span
                  className={cn(
                    "w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium",
                    complete
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : e.done > 0
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : e.date === today
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                  )}
                >
                  {complete ? "Done" : e.done > 0 ? "Partial" : e.date === today ? "Today" : "Missed"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {nextBefore && (
        <Button variant="outline" size="sm" onClick={more} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load earlier"}
        </Button>
      )}
    </div>
  );
}
