"use client";

import type {
  ProjectRoutineItem,
  RoutineCalendarEntry,
  RoutineDaySummary,
  RoutineListItem,
  RoutineOccurrenceTask,
  RoutineView,
} from "@/types/routines";

/** Browser helpers for Routines. Every read and write goes through the routines API (the collection is server-only). */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

const base = (sa: string) => `/api/sub-accounts/${sa}/routines`;

export function listRoutinesApi(sa: string) {
  return call<{ today: string; routines: RoutineListItem[]; projectRoutines: ProjectRoutineItem[] }>(base(sa));
}

export function getRoutineApi(sa: string, id: string, from: string, to: string) {
  return call<{
    today: string;
    routine: RoutineView;
    days: RoutineDaySummary[];
    tasks: RoutineOccurrenceTask[];
    nextDate: string | null;
  }>(`${base(sa)}/${encodeURIComponent(id)}?from=${from}&to=${to}`);
}

export function getRoutineHistoryApi(sa: string, id: string, before?: string | null) {
  return call<{ entries: RoutineDaySummary[]; nextBefore: string | null }>(
    `${base(sa)}/${encodeURIComponent(id)}/history${before ? `?before=${before}` : ""}`
  );
}

export function createRoutineApi(sa: string, body: Record<string, unknown>) {
  return call<{ routine: RoutineView }>(base(sa), { method: "POST", body: JSON.stringify(body) });
}

export function updateRoutineApi(sa: string, id: string, body: Record<string, unknown>) {
  return call<{ routine: RoutineView }>(`${base(sa)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteRoutineApi(sa: string, id: string) {
  return call<{ ok: true }>(`${base(sa)}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function completeRoutineActivityApi(
  sa: string,
  id: string,
  date: string,
  activityId: string,
  completed: boolean
) {
  return call<{ taskId: string }>(`${base(sa)}/${encodeURIComponent(id)}/complete`, {
    method: "POST",
    body: JSON.stringify({ date, activityId, completed }),
  });
}

export function completeRoutineDateApi(sa: string, id: string, date: string) {
  return call<{ completed: number }>(`${base(sa)}/${encodeURIComponent(id)}/complete`, {
    method: "POST",
    body: JSON.stringify({ date }),
  });
}

export function routineCalendarApi(sa: string, from: string, to: string) {
  return call<{ entries: RoutineCalendarEntry[] }>(`${base(sa)}/calendar?from=${from}&to=${to}`);
}
