"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  CalendarDays,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SearchField } from "@/components/system/search-field";
import { Tag } from "@/components/system/status-pill";
import { EventDialog } from "@/components/calendar/event-dialog";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TASK_TIME_BLOCKS } from "@/types/tasks";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { Task } from "@/types/tasks";
import type { ExternalCalendarEvent } from "@/types/google-calendar";
import type { RoutineCalendarEntry } from "@/types/routines";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { routineCalendarApi } from "@/lib/client/routines-api";
import { routineCalendarPath } from "@/lib/calendar/navigation";
import { blockForTime, formatClock } from "@/lib/routines/schedule";
import { routineHex } from "@/components/routines/routine-look";
import { CalendarGooglePopup, CalendarMeetingPopup, CalendarTaskPopup } from "@/components/calendar/calendar-item-popups";
import type { Project } from "@/types/projects";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type CalendarViewMode = "month" | "week" | "day";
const VIEW_MODES: { value: CalendarViewMode; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

interface CalendarViewProps {
  events: CalendarEvent[];
  contacts: Contact[];
  tasks: Task[];
  projects: Project[];
  /** Read-only events pulled in from the viewer's own connected Google Calendar. */
  googleEvents: ExternalCalendarEvent[];
}

type DayItem =
  | { kind: "routine"; entry: RoutineCalendarEntry }
  | { kind: "event"; event: CalendarEvent }
  | { kind: "task"; task: Task }
  | { kind: "google"; event: ExternalCalendarEvent };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Same key for a routine's YYYY-MM-DD calendar date. */
function ymdDayKey(ymd: string): string {
  return `${Number(ymd.slice(0, 4))}-${Number(ymd.slice(5, 7)) - 1}-${Number(ymd.slice(8, 10))}`;
}

function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** All-day routines first, then AM / Midday / PM blocks, then clock times. */
function routineRank(e: RoutineCalendarEntry): string {
  if (e.timeMode === "time" && e.time) return `3${e.time}`;
  if (e.timeMode === "block" && e.timeBlock) return `2${{ am: 0, midday: 1, pm: 2 }[e.timeBlock]}`;
  return "1";
}

function routineWhen(e: RoutineCalendarEntry): string | null {
  if (e.timeMode === "time" && e.time) return formatClock(e.time).replace(":00", "").replace(" ", "").toLowerCase();
  if (e.timeMode === "block" && e.timeBlock) return e.timeBlock === "midday" ? "Midday" : e.timeBlock.toUpperCase();
  return null; // untimed = all-day; never an invented clock time
}

function dayOnly(d: Date): Date {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function startOfWeek(d: Date): Date {
  const nd = dayOnly(d);
  const weekday = (nd.getDay() + 6) % 7; // Monday-first: 0 = Mon
  nd.setDate(nd.getDate() - weekday);
  return nd;
}

function startOfGrid(monthStart: Date): Date {
  return startOfWeek(monthStart);
}

function formatTime(d: Date): string {
  return d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: d.getMinutes() === 0 ? undefined : "2-digit",
    })
    .toLowerCase()
    .replace(" ", "");
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CalendarView({ events, contacts, tasks, projects, googleEvents }: CalendarViewProps) {
  const today = useMemo(() => dayOnly(new Date()), []);
  const [cursor, setCursor] = useState<Date>(() => dayOnly(new Date()));
  const [view, setView] = useState<CalendarViewMode>("month");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => dayOnly(new Date()));
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [detailGoogleEvent, setDetailGoogleEvent] = useState<ExternalCalendarEvent | null>(null);
  const router = useRouter();
  const subAccount = useOptionalSubAccount();
  const [routineEntries, setRoutineEntries] = useState<RoutineCalendarEntry[]>([]);

  const title = useMemo(() => {
    if (view === "month") {
      return cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (view === "week") {
      return `Week of ${startOfWeek(cursor).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [cursor, view]);

  const days = useMemo(() => {
    if (view === "month") {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const gridStart = startOfGrid(monthStart);
      return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    }
    if (view === "week") {
      const weekStart = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
    return [cursor];
  }, [cursor, view]);

  // Routines come from their schedules (future dates are projected, never
  // written), so they're fetched for the visible range rather than
  // subscribed like tasks. Their generated activity tasks are shown through
  // these entries instead of as separate task chips.
  const rangeFrom = days.length ? toLocalYmd(days[0]) : "";
  const rangeTo = days.length ? toLocalYmd(days[days.length - 1]) : "";
  const subAccountId = subAccount?.subAccountId ?? null;
  useEffect(() => {
    if (!subAccountId || !rangeFrom) return;
    let cancelled = false;
    routineCalendarApi(subAccountId, rangeFrom, rangeTo)
      .then((r) => !cancelled && setRoutineEntries(r.entries))
      .catch(() => !cancelled && setRoutineEntries([]));
    return () => {
      cancelled = true;
    };
  }, [subAccountId, rangeFrom, rangeTo]);
  const calendarTasks = useMemo(() => tasks.filter((t) => !t.routineId), [tasks]);

  function openRoutine(entry: RoutineCalendarEntry, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedDate(new Date(`${entry.date}T00:00:00`));
    const path = routineCalendarPath(entry.routineId, entry.date);
    router.push(subAccount ? subAccount.saPath(path) : path);
  }

  const cols = view === "day" ? 1 : 7;

  const itemsByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const mirroredGoogleIds = new Set(
      events.map((event) => event.googleEventId).filter((id): id is string => !!id),
    );
    for (const ev of events) {
      const start = toDate(ev.startAt);
      if (!start) continue;
      const key = dayKey(start);
      const arr = map.get(key) ?? [];
      arr.push({ kind: "event", event: ev });
      map.set(key, arr);
    }
    for (const ge of googleEvents) {
      if (mirroredGoogleIds.has(ge.googleEventId)) continue;
      const start = toDate(ge.startAt);
      if (!start) continue;
      const key = dayKey(start);
      const arr = map.get(key) ?? [];
      arr.push({ kind: "google", event: ge });
      map.set(key, arr);
    }
    for (const t of calendarTasks) {
      if (t.completed) continue;
      const due = toDate(t.dueAt);
      if (!due) continue;
      const key = dayKey(due);
      const arr = map.get(key) ?? [];
      arr.push({ kind: "task", task: t });
      map.set(key, arr);
    }
    for (const entry of routineEntries) {
      const key = ymdDayKey(entry.date);
      const arr = map.get(key) ?? [];
      arr.push({ kind: "routine", entry });
      map.set(key, arr);
    }
    const kindRank: Record<DayItem["kind"], number> = { routine: 0, event: 1, google: 2, task: 3 };
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return kindRank[a.kind] - kindRank[b.kind];
        if (a.kind === "routine" && b.kind === "routine") {
          return routineRank(a.entry).localeCompare(routineRank(b.entry));
        }
        if (a.kind === "event" && b.kind === "event") {
          return (
            (toDate(a.event.startAt)?.getTime() ?? 0) -
            (toDate(b.event.startAt)?.getTime() ?? 0)
          );
        }
        if (a.kind === "google" && b.kind === "google") {
          return (
            (toDate(a.event.startAt)?.getTime() ?? 0) -
            (toDate(b.event.startAt)?.getTime() ?? 0)
          );
        }
        return 0;
      });
    }
    return map;
  }, [events, googleEvents, calendarTasks, routineEntries]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const upcomingDeadlines = useMemo(() => {
    return calendarTasks
      .filter((t) => !t.completed)
      .map((t) => ({ task: t, due: toDate(t.dueAt) }))
      .filter(
        (x): x is { task: Task; due: Date } =>
          !!x.due && dayOnly(x.due).getTime() > today.getTime(),
      )
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 4);
  }, [calendarTasks, today]);

  const todaysTimeBlocks = useMemo(() => {
    const dueToday = calendarTasks
      .filter((t) => !t.completed)
      .map((t) => ({ task: t, due: toDate(t.dueAt) }))
      .filter(
        (x): x is { task: Task; due: Date } =>
          !!x.due && dayOnly(x.due).getTime() === today.getTime(),
      );
    return TASK_TIME_BLOCKS.map((block) => ({
      ...block,
      titles: dueToday
        .filter(
          (x) =>
            x.task.timeBlock === block.value ||
            (!x.task.timeBlock && block.value === "anytime"),
        )
        .map((x) => x.task.title)
        .concat(
          routineEntries
            .filter(
              (e) =>
                e.date === toLocalYmd(today) &&
                e.done < e.total &&
                (e.timeMode === "time" && e.time
                  ? blockForTime(e.time)
                  : e.timeMode === "block" && e.timeBlock
                    ? e.timeBlock
                    : "anytime") === block.value,
            )
            .map((e) => `${e.name} (${e.done}/${e.total})`),
        ),
    }));
  }, [calendarTasks, routineEntries, today]);

  const searchQuery = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!searchQuery) return null;
    const matchedEvents = events.filter(
      (ev) =>
        ev.title.toLowerCase().includes(searchQuery) ||
        (ev.notes ?? "").toLowerCase().includes(searchQuery),
    );
    const matchedTasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(searchQuery) ||
        (t.notes ?? "").toLowerCase().includes(searchQuery),
    );
    return { matchedEvents, matchedTasks };
  }, [searchQuery, events, tasks]);

  function shiftPeriod(delta: number) {
    if (view === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    } else if (view === "week") {
      setCursor((c) => addDays(c, delta * 7));
    } else {
      setCursor((c) => addDays(c, delta));
    }
  }

  function goToday() {
    const next = dayOnly(new Date());
    setCursor(next);
    setSelectedDate(next);
  }

  function openNew(day?: Date) {
    setEditEvent(null);
    setDefaultDate(day ?? new Date());
    setDialogOpen(true);
  }

  function openEventDetail(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    const start = toDate(ev.startAt);
    if (start) setSelectedDate(dayOnly(start));
    setDetailEvent(ev);
  }

  function openTask(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    const due = toDate(task.dueAt);
    if (due) setSelectedDate(dayOnly(due));
    setDetailTask(task);
  }

  function editTask(task: Task) {
    setEditingTask(task);
    setTaskDialogOpen(true);
  }

  const selectedDayItems = itemsByDay.get(dayKey(selectedDate)) ?? [];
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  return (
    <>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card">
        {/* Header — was showing the outer card's pink through unless
            explicitly overridden; real page keeps this row on
            bg-background, only the outer rounded card wrapper itself
            carries the tint (and gets fully covered by its children). */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-aqua-bg text-tag-aqua-fg" aria-hidden="true">
              <CalendarDays className="size-4" />
            </span>
            <h2 className="truncate text-title-md font-semibold tracking-tight text-foreground">{title}</h2>
            <Tag color="gray" className="shrink-0">
              {events.length} events
            </Tag>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shiftPeriod(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shiftPeriod(1)}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Toolbar: search + view toggle + new event */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-5">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search calendar…"
            aria-label="Search calendar"
            className="sm:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl value={view} onChange={setView} options={VIEW_MODES} />
            <Button size="sm" onClick={() => openNew()}>
              <Plus className="h-3.5 w-3.5" />
              New Event
            </Button>
          </div>
        </div>

        {searchResults ? (
          <div className="space-y-6 p-6">
            <h3 className="text-section font-semibold">
              Search results for &quot;{search.trim()}&quot;
            </h3>
            {searchResults.matchedEvents.length === 0 &&
              searchResults.matchedTasks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No results for &quot;{search.trim()}&quot;.
                </p>
              )}
            {searchResults.matchedEvents.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Events
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {searchResults.matchedEvents.map((ev) => {
                    const start = toDate(ev.startAt);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => openEventDetail(ev, e)}
                        className="flex flex-col items-start rounded-control border border-border bg-card p-3 text-left text-body-sm hover:border-primary/40 hover:bg-tint-violet"
                      >
                        <span className="font-medium">{ev.title}</span>
                        {start && (
                          <span className="text-caption text-muted-foreground">
                            {start.toLocaleDateString()} · {formatTime(start)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {searchResults.matchedTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tasks
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {searchResults.matchedTasks.map((t) => {
                    const due = toDate(t.dueAt);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => openTask(t, e)}
                        className="flex flex-col items-start rounded-control border border-border bg-card p-3 text-left text-body-sm hover:border-primary/40 hover:bg-tint-violet"
                      >
                        <span
                          className={cn(
                            "font-medium",
                            t.completed && "text-muted-foreground line-through",
                          )}
                        >
                          {t.title}
                        </span>
                        {due && (
                          <span className="text-caption text-muted-foreground">
                            Due {due.toLocaleDateString()}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Weekday header */}
            <div
              className={cn(
                "grid bg-table-head text-table-head-foreground",
                cols === 7 ? "grid-cols-7" : "grid-cols-1",
                view === "week" && "max-sm:hidden",
              )}
            >
              {view === "day"
                ? (
                    <div className="px-2 py-2.5 text-center text-th font-semibold tracking-[0.08em] uppercase">
                      {cursor.toLocaleDateString("en-US", { weekday: "long" })}
                    </div>
                  )
                : WEEKDAYS.map((w) => (
                    <div
                      key={w}
                      className="px-1 py-2.5 text-center text-th font-semibold tracking-[0.08em] uppercase sm:px-2 sm:text-left"
                    >
                      {w}
                    </div>
                  ))}
            </div>

            {/* Grid — real markup explicitly sets bg-background here
                (divide-x divide-y divide-border/40 bg-background), which
                is what was actually missing: without it every cell just
                showed the outer card's pink straight through, instead of
                a clean white grid with color reserved for real content. */}
            <div
              className={cn(
                "grid divide-x divide-y divide-border-subtle bg-card",
                cols === 7 ? (view === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7") : "grid-cols-1",
                view === "month" && "grid-rows-6",
              )}
            >
              {days.map((d) => {
                const isCurrentMonth = view !== "month" || d.getMonth() === cursor.getMonth();
                const isToday = d.getTime() === today.getTime();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const dayItems = itemsByDay.get(dayKey(d)) ?? [];
                const cap = view === "day" ? 20 : 3;
                const visible = dayItems.slice(0, cap);
                const overflow = dayItems.length - visible.length;
                const isSelected = d.getTime() === dayOnly(selectedDate).getTime();
                return (
                  <div
                    key={dayKey(d)}
                    onClick={() => setSelectedDate(d)}
                    className={cn(
                      "group relative cursor-pointer p-1 transition-colors hover:bg-tint-violet sm:p-1.5",
                      view === "day"
                        ? "min-h-[420px]"
                        : view === "week"
                          ? "min-h-24 sm:min-h-[220px]"
                          : "min-h-14 sm:min-h-[104px]",
                      !isCurrentMonth && "bg-surface-sunken",
                      isWeekend && isCurrentMonth && !isToday && "bg-surface-sunken/40",
                      isToday && "bg-tint-violet/60",
                      isSelected && "ring-2 ring-inset ring-violet-ds-300",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-caption font-medium tabular-nums sm:size-7",
                          // Today: plain bg-primary (was a hardcoded gradient
                          // outside the theme system).
                          isToday && "bg-primary text-primary-foreground shadow-sm",
                          !isToday && isCurrentMonth && "text-foreground",
                          !isToday && !isCurrentMonth && "text-muted-foreground/50",
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {view === "week" && (
                        <span className="mr-auto ml-2 text-caption font-medium text-muted-foreground sm:hidden">
                          {d.toLocaleDateString("en-US", { weekday: "long" })}
                        </span>
                      )}
                      {isToday && <span className="text-overline font-semibold tracking-wide text-link uppercase max-sm:hidden">Today</span>}
                    </div>

                    {/* Phones: the month grid is a date picker — one dot per item;
                        tapping a day shows its full agenda in the day panel. */}
                    {view === "month" && dayItems.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-0.5 sm:hidden" aria-label={`${dayItems.length} items`}>
                        {dayItems.slice(0, 4).map((item, i) => (
                          <span
                            key={i}
                            className={cn(
                              "size-1.5 rounded-full",
                              item.kind === "event" && "bg-tag-violet-fg",
                              item.kind === "google" && "bg-tag-blue-fg",
                              item.kind === "task" && "bg-ink-tertiary",
                            )}
                            style={item.kind === "routine" ? { background: routineHex(item.entry.color) } : undefined}
                          />
                        ))}
                        {dayItems.length > 4 && <span className="text-overline leading-none text-muted-foreground">+</span>}
                      </div>
                    )}

                    <div className={cn("space-y-1", view === "month" && "max-sm:hidden")}>
                      {visible.map((item) => {
                        if (item.kind === "routine") {
                          const e = item.entry;
                          const hex = routineHex(e.color);
                          const when = routineWhen(e);
                          const complete = e.total > 0 && e.done >= e.total;
                          return (
                            <button
                              key={`routine-${e.routineId}-${e.date}`}
                              type="button"
                              onClick={(ev) => openRoutine(e, ev)}
                              title={`${e.name} · ${when ?? "All day"} · ${e.done}/${e.total} done`}
                              className="flex w-full items-center gap-1 truncate rounded-control border px-2 py-1.5 text-left text-micro font-medium leading-tight transition-colors hover:brightness-95"
                              style={{
                                background: `color-mix(in oklab, ${hex} 12%, var(--background))`,
                                borderColor: `color-mix(in oklab, ${hex} 30%, transparent)`,
                              }}
                            >
                              <Repeat className="h-3 w-3 shrink-0" style={{ color: hex }} aria-hidden />
                              {when && <span className="shrink-0 text-muted-foreground">{when}</span>}
                              <span className={cn("truncate", complete && "text-muted-foreground line-through")}>
                                {e.name}
                              </span>
                              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                                {e.done}/{e.total}
                              </span>
                            </button>
                          );
                        }
                        if (item.kind === "event") {
                          const ev = item.event;
                          const start = toDate(ev.startAt);
                          const contact = ev.contactId
                            ? contactById.get(ev.contactId)
                            : null;
                          return (
                            <button
                              key={`ev-${ev.id}`}
                              type="button"
                              onClick={(e) => openEventDetail(ev, e)}
                              className="group/event flex w-full items-center gap-1 truncate rounded-control border border-accent/30 bg-accent/10 px-2 py-1.5 text-left text-micro font-medium leading-tight text-accent-foreground transition-colors hover:border-accent"
                            >
                              {start && (
                                <span className="shrink-0 text-muted-foreground">
                                  {formatTime(start)}
                                </span>
                              )}
                              <span className="truncate">
                                {ev.title}
                                {contact && (
                                  <span className="text-muted-foreground">
                                    {" · "}
                                    {contact.name?.split(" ")[0] ?? ""}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        }
                        if (item.kind === "google") {
                          const ge = item.event;
                          const start = toDate(ge.startAt);
                          return (
                            <button
                              key={`gcal-${ge.id}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailGoogleEvent(ge);
                              }}
                              className="flex w-full items-center gap-1 truncate rounded-control border border-transparent bg-tag-blue-bg px-2 py-1.5 text-left text-micro font-medium leading-tight text-tag-blue-fg transition-colors hover:border-tag-blue-fg/30"
                            >
                              <span className="inline-block size-1.5 shrink-0 rounded-full bg-tag-blue-fg" />
                              {start && !ge.allDay && (
                                <span className="shrink-0 text-tag-blue-fg/70">
                                  {formatTime(start)}
                                </span>
                              )}
                              <span className="truncate">{ge.title}</span>
                            </button>
                          );
                        }
                        const t = item.task;
                        return (
                          <button
                            key={`task-${t.id}`}
                            type="button"
                            onClick={(e) => openTask(t, e)}
                            className="flex w-full items-center gap-1 truncate rounded-control border border-border bg-surface-sunken px-2 py-1.5 text-left text-micro font-medium leading-tight transition-colors hover:border-primary/30"
                          >
                            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-secondary-foreground/50" />
                            <span className="truncate">{t.title}</span>
                          </button>
                        );
                      })}
                      {overflow > 0 && (
                        <span className="px-1 text-overline text-muted-foreground">
                          +{overflow} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
      {/* Right rail (Wave 2 follow-up): white cards, one restrained accent each —
          aqua = the day, blush = deadlines, lavender = time blocks. */}
      <aside className="relative overflow-hidden rounded-card border border-border bg-card shadow-card">
        <span className="absolute inset-x-0 top-0 h-1 bg-tag-aqua-fg/60" aria-hidden="true" />
        <div className="flex items-center gap-3 border-b border-border px-5 pt-5 pb-4">
          <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-chip bg-tag-aqua-bg text-tag-aqua-fg" aria-hidden="true">
            <span className="text-overline leading-none font-semibold uppercase">{selectedDate.toLocaleDateString("en-US", { month: "short" })}</span>
            <span className="text-section leading-none font-bold">{selectedDate.getDate()}</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-section font-semibold text-foreground">{selectedDate.toLocaleDateString("en-US", { weekday: "long" })}</p>
            <p className="text-caption text-muted-foreground">
              {selectedDayItems.length === 0 ? "Nothing scheduled" : `${selectedDayItems.length} item${selectedDayItems.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {selectedDate.getTime() === today.getTime() && <Tag color="aqua" className="shrink-0">Today</Tag>}
        </div>
        <div className="space-y-2 p-4">
          {selectedDayItems.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-control bg-tag-aqua-bg/50 px-4 py-6 text-center">
              <CalendarDays className="size-5 text-tag-aqua-fg" aria-hidden="true" />
              <p className="text-body-sm text-muted-foreground">A clear day.</p>
              <Button size="sm" variant="outline" onClick={() => openNew(selectedDate)}>
                <Plus className="size-3.5" />
                New event
              </Button>
            </div>
          )}
          {selectedDayItems.map((item) => {
            const row = "flex w-full items-start gap-2.5 rounded-control border border-border border-l-[3px] bg-card p-3 text-left transition-colors hover:bg-tint-violet";
            if (item.kind === "routine") {
              const hex = routineHex(item.entry.color);
              return <button key={`side-routine-${item.entry.routineId}-${item.entry.date}`} type="button" onClick={(e) => openRoutine(item.entry, e)} className={row} style={{ borderLeftColor: hex }}><Repeat className="mt-0.5 size-4 shrink-0" style={{ color: hex }} /><span className="min-w-0"><span className="block truncate text-body-sm font-medium">{item.entry.name}</span><span className="text-caption text-muted-foreground">Routine · {item.entry.done}/{item.entry.total} complete</span></span></button>;
            }
            if (item.kind === "task") {
              return <button key={`side-task-${item.task.id}`} type="button" onClick={(e) => openTask(item.task, e)} className={cn(row, "border-l-ink-tertiary")}><Check className="mt-0.5 size-4 shrink-0 text-ink-secondary" /><span className="min-w-0"><span className="block truncate text-body-sm font-medium">{item.task.title}</span><span className="text-caption text-muted-foreground">Task</span></span></button>;
            }
            if (item.kind === "event") {
              return <button key={`side-event-${item.event.id}`} type="button" onClick={(e) => openEventDetail(item.event, e)} className={cn(row, "border-l-tag-violet-fg")}><CalendarDays className="mt-0.5 size-4 shrink-0 text-tag-violet-fg" /><span className="min-w-0"><span className="block truncate text-body-sm font-medium">{item.event.title}</span><span className="text-caption text-muted-foreground">{toDate(item.event.startAt) ? formatTime(toDate(item.event.startAt)!) : "Event"}</span></span></button>;
            }
            return <button key={`side-google-${item.event.id}`} type="button" onClick={() => setDetailGoogleEvent(item.event)} className={cn(row, "border-l-tag-blue-fg")}><CalendarDays className="mt-0.5 size-4 shrink-0 text-tag-blue-fg" /><span className="min-w-0"><span className="block truncate text-body-sm font-medium">{item.event.title}</span><span className="text-caption text-muted-foreground">Calendar item</span></span></button>;
          })}
        </div>
      </aside>
      <section className="relative overflow-hidden rounded-card border border-border bg-card shadow-card">
        <span className="absolute inset-x-0 top-0 h-1 bg-tag-pink-fg/50" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 pt-5 pb-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-pink-bg text-tag-pink-fg" aria-hidden="true"><CalendarClock className="size-4" /></span>
            <h3 className="truncate text-section font-semibold">Upcoming Deadlines</h3>
          </div>
          {/* Opens Projects → My Tasks with its existing "Upcoming" filter. */}
          <Link
            href={subAccount ? subAccount.saPath("/projects/tasks?filter=upcoming") : "/projects/tasks?filter=upcoming"}
            className="shrink-0 rounded-sm text-caption font-medium text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            View all
          </Link>
        </div>
        <div className="space-y-2 p-4">
          {upcomingDeadlines.length === 0 && (
            <div className="flex items-center gap-2.5 rounded-control bg-tag-pink-bg/40 px-3 py-3">
              <Check className="size-4 shrink-0 text-tag-pink-fg" aria-hidden="true" />
              <p className="text-body-sm text-muted-foreground">No upcoming deadlines — you&apos;re clear.</p>
            </div>
          )}
          {upcomingDeadlines.map(({ task, due }) => (
            <button key={task.id} type="button" onClick={(e) => openTask(task, e)} className="flex w-full items-center justify-between gap-2 rounded-control border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-tint-violet">
              <span className="truncate text-body-sm font-medium">{task.title}</span>
              <span className="shrink-0 rounded-chip bg-tag-gold-bg px-2 py-0.5 text-caption font-semibold text-tag-gold-fg">{formatShortDate(due)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="relative overflow-hidden rounded-card border border-border bg-card shadow-card">
        <span className="absolute inset-x-0 top-0 h-1 bg-tag-violet-fg/45" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 pt-5 pb-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg" aria-hidden="true"><Clock3 className="size-4" /></span>
            <h3 className="truncate text-section font-semibold">Today&apos;s Time Blocks</h3>
          </div>
        </div>
        <div className="space-y-2 p-4">
          {todaysTimeBlocks.map((block) => {
            const cue = { am: "bg-tag-gold-fg", midday: "bg-tag-aqua-fg", pm: "bg-tag-violet-fg", anytime: "bg-ink-tertiary" }[block.value as string] ?? "bg-ink-tertiary";
            const filled = block.titles.length > 0;
            return (
              <div key={block.value} className="flex items-start gap-3">
                <div className="flex w-16 shrink-0 items-center gap-1.5 pt-2 text-caption font-medium text-ink-secondary">
                  <span className={cn("size-1.5 rounded-full", cue)} aria-hidden="true" />
                  {block.label}
                </div>
                <div
                  className={cn(
                    "min-h-9 flex-1 rounded-control px-2.5 py-2 text-caption",
                    filled ? "border border-violet-ds-300/60 bg-tint-violet font-medium text-foreground" : "border border-dashed border-border text-ink-tertiary",
                  )}
                >
                  {filled ? block.titles.join(", ") : "Nothing scheduled"}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      </div>
      </div>

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        event={editEvent}
        defaultDate={defaultDate}
      />
      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        contacts={contacts}
        task={editingTask}
      />
      <CalendarTaskPopup
        task={detailTask}
        project={detailTask?.projectId ? projectById.get(detailTask.projectId) ?? null : null}
        routineName={detailTask?.routineName}
        contacts={contacts}
        open={!!detailTask}
        onOpenChange={(open) => !open && setDetailTask(null)}
        onEdit={() => { if (detailTask) editTask(detailTask); }}
      />
      <CalendarMeetingPopup
        event={detailEvent}
        contact={detailEvent?.contactId ? contactById.get(detailEvent.contactId) ?? null : null}
        bookingPath={detailEvent?.bookingPageSlug && subAccount ? subAccount.saPath(`/booking/${detailEvent.bookingPageSlug}/bookings`) : null}
        open={!!detailEvent}
        onOpenChange={(open) => !open && setDetailEvent(null)}
        onReschedule={() => {
          if (!detailEvent) return;
          setEditEvent(detailEvent);
          setDefaultDate(null);
          setDialogOpen(true);
        }}
      />
      <CalendarGooglePopup
        event={detailGoogleEvent}
        open={!!detailGoogleEvent}
        onOpenChange={(open) => !open && setDetailGoogleEvent(null)}
      />
    </>
  );
}
