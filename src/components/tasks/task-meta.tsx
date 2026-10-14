"use client";

import { Clock, Flag, Moon, Sun, Sunrise } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill as SystemStatusPill, type StatusTone } from "@/components/system/status-pill";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
  type TaskTimeBlock,
} from "@/types/tasks";

/** Shared status / priority / time-block visuals (Task Detail, My Tasks, Project Workspace). */

/** Task status → system status tone (one vocabulary with every other CRM pill). */
export const STATUS_TONE_FOR: Record<TaskStatus, StatusTone> = {
  todo: "neutral",
  in_progress: "scheduled",
  in_review: "warning",
  completed: "success",
  blocked: "danger",
};

/** Dot colour per status (status menus in Task Detail). */
export const STATUS_STYLE: Record<TaskStatus, { dot: string }> = {
  todo: { dot: "bg-status-neutral-dot" },
  in_progress: { dot: "bg-status-scheduled-dot" },
  in_review: { dot: "bg-status-warning-dot" },
  completed: { dot: "bg-status-success-dot" },
  blocked: { dot: "bg-status-danger-dot" },
};

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: "text-status-danger-fg",
  high: "text-status-danger-fg",
  medium: "text-status-warning-fg",
  low: "text-status-info-fg",
};

export function statusLabel(s: TaskStatus): string {
  return TASK_STATUSES.find((x) => x.value === s)?.label ?? "To Do";
}
export function priorityLabel(p: TaskPriority | null | undefined): string {
  return p ? (TASK_PRIORITIES.find((x) => x.value === p)?.label ?? "None") : "None";
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return <SystemStatusPill tone={STATUS_TONE_FOR[status]}>{statusLabel(status)}</SystemStatusPill>;
}

export function PriorityFlag({
  priority,
  showLabel = true,
}: {
  priority: TaskPriority | null | undefined;
  showLabel?: boolean;
}) {
  if (!priority) {
    return showLabel ? <span className="text-caption text-muted-foreground">—</span> : null;
  }
  return (
    <span className="inline-flex items-center gap-1 text-caption font-medium whitespace-nowrap">
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
