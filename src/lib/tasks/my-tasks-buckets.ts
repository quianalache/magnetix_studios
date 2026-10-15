import { toDate } from "@/lib/format";
import type { Task } from "@/types/tasks";

/**
 * My Tasks status buckets (Projects → My Tasks). Pure, so the rules are
 * testable (scripts/check-my-tasks-buckets.ts).
 *
 *   overdue  — open, due on a day before today
 *   today    — open, due today (the Due today LIST also takes overdue tasks
 *              whose Auto rollover is ON — see inStatusBucket)
 *   upcoming — open, with a real due date AFTER today (pre-Wave-3 cleanup,
 *              2026-10-15: undated tasks are NOT upcoming)
 *   no_date  — open, no due date (only in All open / All tasks)
 *   done     — completed (never in any other bucket)
 */
export type MyTaskStatus = "overdue" | "today" | "upcoming" | "no_date" | "done";
export type MyTaskBucket = "today" | "overdue" | "upcoming" | "done";

export function dayStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function taskStatus(t: Pick<Task, "completed" | "dueAt">, now: number, today: number): MyTaskStatus {
  if (t.completed) return "done";
  const d = toDate(t.dueAt);
  if (!d) return "no_date";
  const day = dayStart(d);
  if (d.getTime() < now && day < today) return "overdue";
  if (day === today) return "today";
  return "upcoming";
}

/**
 * Whether a task's status belongs in a status filter's list.
 *
 * Due today = due today, OR past due with Auto rollover ON (those are moved to
 * today by the rollover sweep and belong in today's work even before the next
 * sweep / when the viewer's day differs from the sub-account's). A past-due
 * task with rollover OFF is Overdue only.
 */
export function inStatusBucket(
  filter: MyTaskBucket,
  status: MyTaskStatus,
  task?: { autoRollover?: boolean | null },
): boolean {
  switch (filter) {
    case "today":
      return status === "today" || (status === "overdue" && task?.autoRollover === true);
    case "overdue":
      return status === "overdue";
    case "upcoming":
      return status === "upcoming";
    case "done":
      return status === "done";
  }
}
