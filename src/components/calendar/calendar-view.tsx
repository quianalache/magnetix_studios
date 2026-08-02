"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventDialog } from "@/components/calendar/event-dialog";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TASK_TIME_BLOCKS } from "@/types/tasks";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { Task } from "@/types/tasks";
import type { ExternalCalendarEvent } from "@/types/google-calendar";

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
  /** Read-only events pulled in from the viewer's own connected Google Calendar. */
  googleEvents: ExternalCalendarEvent[];
}

type DayItem =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "task"; task: Task }
  | { kind: "google"; event: ExternalCalendarEvent };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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

export function CalendarView({ events, contacts, tasks, googleEvents }: CalendarViewProps) {
  const today = useMemo(() => dayOnly(new Date()), []);
  const [cursor, setCursor] = useState<Date>(() => dayOnly(new Date()));
  const [view, setView] = useState<CalendarViewMode>("month");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

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

  const cols = view === "day" ? 1 : 7;
  const rows = view === "month" ? 6 : 1;

  const itemsByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    for (const ev of events) {
      const start = toDate(ev.startAt);
      if (!start) continue;
      const key = dayKey(start);
      const arr = map.get(key) ?? [];
      arr.push({ kind: "event", event: ev });
      map.set(key, arr);
    }
    for (const ge of googleEvents) {
      const start = toDate(ge.startAt);
      if (!start) continue;
      const key = dayKey(start);
      const arr = map.get(key) ?? [];
      arr.push({ kind: "google", event: ge });
      map.set(key, arr);
    }
    for (const t of tasks) {
      if (t.completed) continue;
      const due = toDate(t.dueAt);
      if (!due) continue;
      const key = dayKey(due);
      const arr = map.get(key) ?? [];
      arr.push({ kind: "task", task: t });
      map.set(key, arr);
    }
    const kindRank: Record<DayItem["kind"], number> = { event: 0, google: 1, task: 2 };
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return kindRank[a.kind] - kindRank[b.kind];
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
  }, [events, googleEvents, tasks]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const upcomingDeadlines = useMemo(() => {
    return tasks
      .filter((t) => !t.completed)
      .map((t) => ({ task: t, due: toDate(t.dueAt) }))
      .filter(
        (x): x is { task: Task; due: Date } =>
          !!x.due && dayOnly(x.due).getTime() > today.getTime(),
      )
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 4);
  }, [tasks, today]);

  const todaysTimeBlocks = useMemo(() => {
    const dueToday = tasks
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
        .map((x) => x.task.title),
    }));
  }, [tasks, today]);

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
    setCursor(dayOnly(new Date()));
  }

  function openNew(day?: Date) {
    setEditEvent(null);
    setDefaultDate(day ?? new Date());
    setDialogOpen(true);
  }

  function openEdit(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    setEditEvent(ev);
    setDefaultDate(null);
    setDialogOpen(true);
  }

  function openTask(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingTask(task);
    setTaskDialogOpen(true);
  }

  return (
    <>
      <div className="rounded-2xl border bg-card">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {events.length} events
            </span>
          </div>
          <div className="flex items-center gap-1">
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search calendar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 rounded-full pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
              {VIEW_MODES.map((vm) => (
                <button
                  key={vm.value}
                  type="button"
                  onClick={() => setView(vm.value)}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                    view === vm.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {vm.label}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => openNew()}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Event
            </Button>
          </div>
        </div>

        {searchResults ? (
          <div className="space-y-6 p-6">
            <h3 className="text-sm font-semibold">
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
                        onClick={(e) => openEdit(ev, e)}
                        className="flex flex-col items-start rounded-xl border p-3 text-left text-sm hover:border-primary/40"
                      >
                        <span className="font-medium">{ev.title}</span>
                        {start && (
                          <span className="text-xs text-muted-foreground">
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
                        className="flex flex-col items-start rounded-xl border p-3 text-left text-sm hover:border-primary/40"
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
                          <span className="text-xs text-muted-foreground">
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
                "grid border-b bg-muted/20",
                cols === 7 ? "grid-cols-7" : "grid-cols-1",
              )}
            >
              {view === "day"
                ? (
                    <div className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {cursor.toLocaleDateString("en-US", { weekday: "long" })}
                    </div>
                  )
                : WEEKDAYS.map((w) => (
                    <div
                      key={w}
                      className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {w}
                    </div>
                  ))}
            </div>

            {/* Grid */}
            <div
              className={cn(
                "grid",
                cols === 7 ? "grid-cols-7" : "grid-cols-1",
                view === "month" && "grid-rows-6",
              )}
            >
              {days.map((d, i) => {
                const isCurrentMonth = view !== "month" || d.getMonth() === cursor.getMonth();
                const isToday = d.getTime() === today.getTime();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const dayItems = itemsByDay.get(dayKey(d)) ?? [];
                const cap = view === "day" ? 20 : 3;
                const visible = dayItems.slice(0, cap);
                const overflow = dayItems.length - visible.length;
                const colIndex = i % cols;
                const rowIndex = Math.floor(i / cols);

                return (
                  <div
                    key={dayKey(d)}
                    onClick={() => openNew(d)}
                    className={cn(
                      "group relative cursor-pointer p-1.5 transition-colors hover:bg-muted/30",
                      view === "day"
                        ? "min-h-[420px]"
                        : view === "week"
                          ? "min-h-[220px]"
                          : "min-h-[100px]",
                      colIndex < cols - 1 && "border-r",
                      rowIndex < rows - 1 && "border-b",
                      !isCurrentMonth && "bg-muted/10",
                      isWeekend && isCurrentMonth && "bg-muted/5",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                          isToday &&
                            "bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-sm",
                          !isToday && isCurrentMonth && "text-foreground",
                          !isToday && !isCurrentMonth && "text-muted-foreground/50",
                        )}
                      >
                        {d.getDate()}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openNew(d);
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Add event"
                      >
                        <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      {visible.map((item) => {
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
                              onClick={(e) => openEdit(ev, e)}
                              className="group/event flex w-full items-center gap-1 truncate rounded-md border border-transparent bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-pink-500/10 px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition-colors hover:border-primary/30"
                            >
                              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500" />
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
                                if (ge.htmlLink) window.open(ge.htmlLink, "_blank", "noopener,noreferrer");
                              }}
                              className="flex w-full items-center gap-1 truncate rounded-md border border-transparent bg-blue-500/10 px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-blue-700 transition-colors hover:border-blue-500/30 dark:text-blue-400"
                            >
                              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                              {start && !ge.allDay && (
                                <span className="shrink-0 text-blue-700/70 dark:text-blue-400/70">
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
                            className="flex w-full items-center gap-1 truncate rounded-md border border-border/50 bg-secondary/20 px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition-colors hover:border-primary/30"
                          >
                            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-secondary-foreground/50" />
                            <span className="truncate">{t.title}</span>
                          </button>
                        );
                      })}
                      {overflow > 0 && (
                        <span className="px-1 text-[10px] text-muted-foreground">
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

      {/* Bottom panels — always visible, independent of search/view */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Upcoming Deadlines</h3>
          </div>
          <div className="space-y-2 p-4">
            {upcomingDeadlines.length === 0 && (
              <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
            )}
            {upcomingDeadlines.map(({ task, due }) => (
              <button
                key={task.id}
                type="button"
                onClick={(e) => openTask(task, e)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-left hover:bg-muted/50"
              >
                <span className="truncate text-sm font-medium">{task.title}</span>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  {formatShortDate(due)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Clock3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Today&apos;s Time Blocks</h3>
          </div>
          <div className="space-y-2 p-4">
            {todaysTimeBlocks.map((block) => (
              <div key={block.value} className="flex items-start gap-3">
                <div className="w-14 pt-2 text-xs font-medium text-muted-foreground">
                  {block.label}
                </div>
                <div className="min-h-[36px] flex-1 rounded-xl border bg-background p-2 text-xs text-foreground">
                  {block.titles.length > 0 ? (
                    block.titles.join(", ")
                  ) : (
                    <span className="text-muted-foreground">Nothing scheduled</span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
    </>
  );
}
