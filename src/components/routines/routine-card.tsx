"use client";

import { ArrowRight, CalendarDays, Clock, FolderKanban, MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  describeSchedule,
  describeTime,
  formatYmd,
  ordinal,
  WEEKDAY_LETTER,
  weekdayOf,
} from "@/lib/routines/schedule";
import type { RoutineDaySummary, RoutineListItem, RoutineView } from "@/types/routines";
import { RoutineIcon, RoutineProgressBar, routineHex, routineTint } from "./routine-look";

/**
 * One day in a routine's week row. Encodes two different things the owner
 * asked to keep apart: whether the SCHEDULE includes the day (tinted vs
 * plain) and what was actually RECORDED that day (filled = all done,
 * half ring = some done). Today gets a dark outline.
 */
export function RoutineDayDot({
  day,
  today,
  color,
  size = "sm",
}: {
  day: RoutineDaySummary;
  today: string;
  color: string;
  size?: "sm" | "md";
}) {
  const hex = routineHex(color);
  const complete = day.total > 0 && day.done >= day.total;
  const partial = day.done > 0 && !complete;
  const isToday = day.date === today;
  const missed = day.scheduled && day.date < today && day.done === 0;
  const letter = WEEKDAY_LETTER[weekdayOf(day.date)];
  const state = complete
    ? "all activities done"
    : partial
      ? `${day.done} of ${day.total} done`
      : day.scheduled
        ? missed
          ? "scheduled, not done"
          : "scheduled"
        : "not scheduled";
  return (
    <span
      title={`${formatYmd(day.date)} · ${state}`}
      aria-label={`${formatYmd(day.date)}: ${state}`}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
        !day.scheduled && !day.recorded && "text-muted-foreground/60",
        isToday && "ring-foreground/70 ring-2 ring-offset-1 ring-offset-transparent"
      )}
      style={
        complete
          ? { background: hex, color: "#fff" }
          : partial
            ? {
                background: `conic-gradient(${hex} ${Math.round((day.done / day.total) * 360)}deg, color-mix(in oklab, ${hex} 16%, var(--card)) 0deg)`,
                color: "var(--foreground)",
              }
            : day.scheduled || day.recorded
              ? {
                  background: `color-mix(in oklab, ${hex} ${missed ? 8 : 16}%, var(--card))`,
                  color: hex,
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${hex} 35%, transparent)`,
                }
              : undefined
      }
    >
      {partial ? (
        <span className="bg-card flex h-[70%] w-[70%] items-center justify-center rounded-full">{letter}</span>
      ) : (
        letter
      )}
    </span>
  );
}

export function RoutineMetaChips({ routine, className }: { routine: RoutineView; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="bg-card/80 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
        <CalendarDays className="text-muted-foreground h-3 w-3" />
        {describeSchedule(routine.schedule)}
      </span>
      <span className="bg-card/80 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
        <Clock className="text-muted-foreground h-3 w-3" />
        {describeTime(routine.timeMode, routine.timeBlock, routine.time)}
      </span>
    </div>
  );
}

function monthlyChip(routine: RoutineView): string {
  const s = routine.schedule;
  if (s.monthMode === "weekdays") {
    return `${s.nthWeeks.map((n) => ordinal(n)).join(" & ")} ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.weekday]}`;
  }
  return `${s.monthDates.map((d) => (d === -1 ? "Last day" : ordinal(d))).join(", ")} of month`;
}

export function RoutineCard({
  item,
  onOpen,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  item: RoutineListItem;
  onOpen: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const { routine, progress, week, today } = item;
  const paused = routine.status === "paused";
  const minutes = routine.activities.reduce((s, a) => s + (a.estimateMinutes ?? 0), 0);
  return (
    <article
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 rounded-2xl border p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5",
        paused && "opacity-75"
      )}
      style={routineTint(routine.color)}
    >
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="shrink-0" aria-label={`Open ${routine.name}`}>
          <RoutineIcon icon={routine.icon} color={routine.color} />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <h3 className="flex items-center gap-2 text-base leading-tight font-bold">
            <span className="truncate">{routine.name}</span>
            {paused && (
              <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                Paused
              </span>
            )}
          </h3>
          {routine.description && (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{routine.description}</p>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="-mt-1 -mr-2 h-8 w-8" aria-label={`${routine.name} actions`} />}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Edit routine
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleStatus}>
              {paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
              {paused ? "Resume" : "Pause"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RoutineMetaChips routine={routine} />

      {routine.schedule.unit === "month" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="bg-card inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold">
            <CalendarDays className="h-3.5 w-3.5" style={{ color: routineHex(routine.color) }} />
            {monthlyChip(routine)}
          </span>
          {item.nextDate && <span className="text-muted-foreground">Next: {formatYmd(item.nextDate)}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-1.5" aria-label="This week">
          {week.map((d) => (
            <RoutineDayDot key={d.date} day={d} today={today} color={routine.color} />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{progress.label}</span>
            <span className="font-semibold tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </div>
          <RoutineProgressBar done={progress.done} total={progress.total} color={routine.color} />
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>
              {routine.activities.length} {routine.activities.length === 1 ? "activity" : "activities"}
              {minutes > 0 && ` · ~${minutes} min`}
            </span>
            {routine.projectTitle && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FolderKanban className="h-3 w-3 shrink-0" />
                <span className="truncate">{routine.projectTitle}</span>
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${routine.name}`}
          className="bg-card hover:bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-xs transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
