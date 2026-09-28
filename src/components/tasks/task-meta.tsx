"use client";

import { Clock, Flag, Moon, Sun, Sunrise } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
  type TaskTimeBlock,
} from "@/types/tasks";

/** Shared status / priority / time-block visuals (Task Detail, My Tasks, Project Workspace). */

export const STATUS_STYLE: Record<TaskStatus, { dot: string; pill: string }> = {
  todo: { dot: "bg-slate-400", pill: "bg-muted text-muted-foreground" },
  in_progress: {
    dot: "bg-violet-500",
    pill: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  in_review: {
    dot: "bg-amber-400",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  completed: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  blocked: {
    dot: "bg-rose-500",
    pill: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: "text-rose-600 dark:text-rose-400",
  high: "text-rose-500",
  medium: "text-amber-500",
  low: "text-sky-500",
};

export function statusLabel(s: TaskStatus): string {
  return TASK_STATUSES.find((x) => x.value === s)?.label ?? "To Do";
}
export function priorityLabel(p: TaskPriority | null | undefined): string {
  return p ? (TASK_PRIORITIES.find((x) => x.value === p)?.label ?? "None") : "None";
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLE[status].pill
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLE[status].dot)} />
      {statusLabel(status)}
    </span>
  );
}

export function PriorityFlag({
  priority,
  showLabel = true,
}: {
  priority: TaskPriority | null | undefined;
  showLabel?: boolean;
}) {
  if (!priority) {
    return showLabel ? <span className="text-muted-foreground text-xs">—</span> : null;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
      <Flag className={cn("h-3.5 w-3.5 fill-current", PRIORITY_COLOR[priority])} />
      {showLabel && priorityLabel(priority)}
    </span>
  );
}

export const TIME_BLOCK_META: Record<
  TaskTimeBlock,
  { label: string; hint: string; icon: typeof Sun }
> = {
  am: { label: "AM", hint: "6am – 12pm", icon: Sunrise },
  midday: { label: "Midday", hint: "12pm – 4pm", icon: Sun },
  pm: { label: "PM", hint: "4pm – 10pm", icon: Moon },
  anytime: { label: "Anytime", hint: "Any time of day", icon: Clock },
};
