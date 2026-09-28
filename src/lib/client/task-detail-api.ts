"use client";

import type { TimeEntryView, ActiveTimerView } from "@/types/time-tracking";

/**
 * Browser helpers for the Task Detail modal + project task views
 * (Projects & Tasks Phase 2). Every mutation goes to a server route; the
 * browser never writes project tasks directly (firestore.rules refuses).
 */

export interface TaskJson {
  id: string;
  title: string;
  notes: string;
  dueAt: string | null;
  completed: boolean;
  completedAt: string | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  timeBlock: "am" | "midday" | "pm" | "anytime" | null;
  subAccountId: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  status?: string | null;
  priority?: string | null;
  assigneeUid?: string | null;
  assigneeContactId?: string | null;
  tags?: string[];
  estimateMinutes?: number | null;
  timeSpentSeconds?: number;
  clientTimeSeconds?: number;
  checklist?: { id: string; title: string; done: boolean }[];
  attachments?: { id: string; name: string; url: string }[];
  dependsOnTaskIds?: string[];
  relatedTaskIds?: string[];
  recurrence?: { type: string; days?: number[] } | null;
  autoRollover?: boolean;
  rolledOverCount?: number;
  originalDueAt?: string | null;
  visibility?: "client" | "internal" | null;
  createdByMemberId?: string | null;
  kind?: string;
  routineId?: string | null;
  routineName?: string | null;
  routineActivityId?: string | null;
  occurrenceDate?: string | null;
  createdAt?: string | null;
}

export interface LinkedTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskActivityRow {
  id: string;
  type: string;
  actorName: string;
  actorKind: "staff" | "client" | "system";
  summary: string;
  taskTitle?: string;
  taskId?: string;
  visibility: "client" | "internal";
  createdAt: string | null;
}

export interface TaskDetailBundle {
  task: TaskJson;
  project: {
    id: string;
    title: string;
    taskModel: string;
    status: string;
    assignedContactId: string | null;
    assignedContactName: string | null;
  } | null;
  parent: LinkedTask | null;
  subtasks: TaskJson[];
  dependsOn: LinkedTask[];
  related: LinkedTask[];
  dependents: LinkedTask[];
  contact: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
  activity: TaskActivityRow[];
  comments: {
    id: string;
    body: string;
    authorName: string;
    mine: boolean;
    createdAt: string | null;
  }[];
  time: { entries: TimeEntryView[]; activeTimer: ActiveTimerView | null };
  assignees: { uid: string; name: string }[];
  viewer: { uid: string };
}

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export async function fetchTaskDetail(taskId: string) {
  return json<TaskDetailBundle>(await fetch(`/api/tasks/${taskId}`));
}

export async function patchTask(taskId: string, patch: Record<string, unknown>) {
  return json<{ task: TaskJson; warnings: string[] }>(
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
}

export async function deleteTaskApi(taskId: string) {
  return json<{ ok: true }>(await fetch(`/api/tasks/${taskId}`, { method: "DELETE" }));
}

export async function setTaskCompleted(taskId: string, completed: boolean) {
  return json<{ warnings?: string[] }>(
    await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    })
  );
}

export async function createTaskApi(
  subAccountId: string,
  body: Record<string, unknown>
) {
  return json<{ id: string }>(
    await fetch(`/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, subAccountId, full: true }),
    })
  );
}

export async function postComment(taskId: string, body: string) {
  return json<{ id: string }>(
    await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    })
  );
}

export async function deleteComment(taskId: string, commentId: string) {
  return json<{ ok: true }>(
    await fetch(`/api/tasks/${taskId}/comments?commentId=${encodeURIComponent(commentId)}`, {
      method: "DELETE",
    })
  );
}

export async function timerAction(action: "start" | "stop", taskId?: string) {
  return json<{
    timer?: ActiveTimerView;
    stopped?: { taskId: string; seconds: number } | null;
  }>(
    await fetch(`/api/time/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, taskId }),
    })
  );
}

export async function addTimeEntry(
  taskId: string,
  body: { startedAt: string; durationSeconds: number; note: string }
) {
  return json<{ entryId: string }>(
    await fetch(`/api/tasks/${taskId}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        requestId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
      }),
    })
  );
}

export async function reviseTimeEntry(
  entryId: string,
  patch: { durationSeconds?: number; startedAt?: string; note?: string } | "delete"
) {
  return json<{ ok: true }>(
    await fetch(`/api/time/entries/${entryId}`, {
      method: patch === "delete" ? "DELETE" : "PATCH",
      headers: patch === "delete" ? undefined : { "Content-Type": "application/json" },
      body: patch === "delete" ? undefined : JSON.stringify(patch),
    })
  );
}

/** Local-date input (YYYY-MM-DD) → ISO at 17:00 local, the default due time for date-only picks. */
export function dateInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T17:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
