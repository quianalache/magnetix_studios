import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Time tracking (Projects & Tasks Phase 2, 2026-09). Server-only
 * collections — firestore.rules has no match for them, so the default deny
 * applies and every read/write goes through the API (staff routes or the
 * Client Portal routes, which authorize the member server-side).
 *
 * - `timeEntries/{id}`   one finished interval (timer or manual).
 * - `activeTimers/{actorKey}`  at most ONE running timer per person; the
 *   doc id IS the person (`u_{uid}` staff, `m_{memberId}` client), so a
 *   second concurrent timer is structurally impossible.
 */

export type TimeActorKind = "staff" | "client";

export interface TimeEntryRevision {
  at: Timestamp | FieldValue | Date;
  byActorKey: string;
  action: "edited" | "deleted";
  before: {
    startedAt: unknown;
    endedAt: unknown;
    durationSeconds: number;
    note: string;
  };
}

export interface TimeEntry {
  id: string;
  agencyId: string;
  subAccountId: string;
  taskId: string;
  projectId: string | null;
  actorKind: TimeActorKind;
  /** `u_{uid}` or `m_{memberId}` — the person who logged it. */
  actorKey: string;
  actorUid: string | null;
  actorMemberId: string | null;
  actorContactId: string | null;
  actorName: string;
  startedAt: Timestamp | FieldValue | null;
  endedAt: Timestamp | FieldValue | null;
  durationSeconds: number;
  source: "timer" | "manual";
  note: string;
  /** Soft delete keeps the audit trail. */
  deleted: boolean;
  /** Append-only correction history (who changed what, when, from what). */
  revisions: TimeEntryRevision[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface ActiveTimer {
  actorKey: string;
  subAccountId: string;
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  startedAt: Timestamp | FieldValue | null;
}

/** JSON shape returned by the time APIs (dates as ISO strings). */
export interface TimeEntryView {
  id: string;
  taskId: string;
  projectId: string | null;
  actorKind: TimeActorKind;
  actorKey: string;
  actorName: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  source: "timer" | "manual";
  note: string;
  edited: boolean;
  /** Whether the caller may correct/delete it (own entries only). */
  canEdit: boolean;
}

export interface ActiveTimerView {
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  startedAt: string;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return s > 0 ? "<1m" : "0m";
}
