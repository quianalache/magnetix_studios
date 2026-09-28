import type { Timestamp, FieldValue } from "firebase/firestore";

export type TaskTimeBlock = "am" | "midday" | "pm" | "anytime";

export const TASK_TIME_BLOCKS: { value: TaskTimeBlock; label: string }[] = [
  { value: "am", label: "AM" },
  { value: "midday", label: "Midday" },
  { value: "pm", label: "PM" },
  { value: "anytime", label: "Anytime" },
];

export interface Task {
  id: string;
  title: string;
  notes: string;
  dueAt: Timestamp | FieldValue | null;
  completed: boolean;
  completedAt: Timestamp | FieldValue | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  /**
   * Optional time-of-day bucket for the Calendar page's "Today's Time
   * Blocks" panel. `null` = unset — treated as "anytime" when bucketing,
   * so legacy tasks (written before this field existed) still surface.
   */
  timeBlock: TaskTimeBlock | null;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  /**
   * Denormalized territory tag, inherited from the linked contact at
   * creation and kept in sync when the contact is re-tagged. `null` =
   * unscoped / standalone (admin-only triage when scoping is on).
   * Ignored unless the sub-account's `territoryScopingEnabled` is true.
   */
  territoryId?: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;

  // ── Projects & Tasks Phase 2 (2026-09) — ALL optional. Legacy tasks
  // (written before these existed) simply lack them and read through the
  // helpers below (`taskStatusOf`, etc.). Fields marked "server" are
  // maintained only by the server services; firestore.rules refuse
  // browser writes that touch them.

  /** Project association (server). Null/absent = standalone task. */
  projectId?: string | null;
  /** One-level subtask parent (server). Subtasks never have subtasks. */
  parentTaskId?: string | null;
  /** Workflow status. Absent → derived from `completed`. `completed` stays the source of truth for completion. */
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  /** Staff assignee (sub-account member uid). */
  assigneeUid?: string | null;
  /** Client assignee — only ever the project's assigned contact (server). */
  assigneeContactId?: string | null;
  tags?: string[];
  estimateMinutes?: number | null;
  /** Denormalized tracked-time total across ALL entries (server). */
  timeSpentSeconds?: number;
  /** Denormalized client-reported portion of `timeSpentSeconds` (server). */
  clientTimeSeconds?: number;
  /** Lightweight in-task checklist — not task records. */
  checklist?: TaskChecklistItem[];
  /** Link attachments (name + URL). File uploads wait for the Assets library. */
  attachments?: TaskAttachment[];
  /** Prerequisites in the same sub-account. Warn-only; never blocks completion. */
  dependsOnTaskIds?: string[];
  /** Plain "related" links (symmetric by convention, not enforced). */
  relatedTaskIds?: string[];
  /** Recurring routine settings. Null/absent = one-off. */
  recurrence?: TaskRecurrence | null;
  /** Routine series id + position (server; deterministic ids prevent duplicate occurrences). */
  recurrenceSeriesId?: string | null;
  occurrenceIndex?: number | null;
  /** Optional overdue rollover — OFF unless explicitly enabled per task. */
  autoRollover?: boolean;
  rolledOverCount?: number;
  /** First due date before any rollover (server). */
  originalDueAt?: Timestamp | FieldValue | null;
  /** "internal" hides a project task from the client in the Client Portal. Client-project tasks default to "client". */
  visibility?: TaskVisibility;
  /** Set when a Client Portal member created the task (server). */
  createdByMemberId?: string | null;
  /** Momentum OS routine marker for template-generated routines. */
  kind?: "task" | "routine";
  /**
   * RESERVED for future content connections (Social Planner, Content
   * Library, YouTube Studio). Not read or written by any UI yet.
   */
  contentLinks?: { kind: "social_post" | "content_item" | "ytcs_video"; id: string }[];
}

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "completed"
  | "blocked";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type TaskVisibility = "client" | "internal";

export interface TaskChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
}

export type TaskRecurrenceType = "daily" | "weekly" | "monthly" | "annually";
export interface TaskRecurrence {
  type: TaskRecurrenceType;
  /** Weekly only: 0=Sun..6=Sat. Empty/absent = same weekday as the due date. */
  days?: number[];
}

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const TASK_RECURRENCE_LABELS: Record<TaskRecurrenceType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  annually: "Annually",
};

/** Effective status: `completed` always wins; legacy tasks without a status read as To Do. */
export function taskStatusOf(
  task: Pick<Task, "completed" | "status">
): TaskStatus {
  if (task.completed) return "completed";
  if (!task.status || task.status === "completed") return "todo";
  return task.status;
}

export type TaskFormData = {
  title: string;
  notes: string;
  dueAt: Date | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  timeBlock?: TaskTimeBlock | null;
};

export type TaskFilter = "today" | "overdue" | "upcoming" | "done" | "all";
