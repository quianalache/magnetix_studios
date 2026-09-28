import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Routines (Projects & Tasks, 2026-09) — named groups of recurring
 * activities that don't need a project ("Weekly CEO Reset", "Morning Power
 * Routine").
 *
 * A routine is NOT a second task engine. `routines/{id}` only holds the
 * definition (name, look, schedule, the activity list). Each activity on
 * each scheduled date becomes an ordinary CRM task (`tasks/{id}`) with a
 * deterministic id — `rt_{routineId}_{YYYYMMDD}_{activityId}` — so:
 * - every date keeps its OWN completion record (history is never
 *   overwritten when the next week starts),
 * - generating the same date twice can never create duplicates,
 * - My Tasks, time tracking, webhooks and completion all reuse the
 *   existing Tasks infrastructure unchanged.
 *
 * Dates are calendar dates (`YYYY-MM-DD`) in the sub-account's timezone,
 * the same convention as Reflection's Rituals (`completedDates`).
 *
 * `routines/{id}` is server-only (no firestore.rules match → default deny);
 * every read and write goes through /api/sub-accounts/[id]/routines.
 */

export type RoutineFrequency = "daily" | "weekly" | "monthly" | "custom";
export type RoutineUnit = "day" | "week" | "month";
export type RoutineMonthMode = "dates" | "weekdays";
/** Which of the four "Custom Recurrence" options produced a custom schedule (editor round-trip). */
export type RoutineCustomMode = "weeks" | "nthWeekday" | "months" | "dates";

export interface RoutineSchedule {
  /** What the owner picked in the editor — a label, not the evaluator. */
  frequency: RoutineFrequency;
  customMode: RoutineCustomMode | null;
  /** The evaluator's period: every `interval` days / weeks / months. */
  unit: RoutineUnit;
  interval: number;
  /** Active weekdays (0 = Sun … 6 = Sat) for day / week units. Empty on a day unit = every day. */
  days: number[];
  /** Month unit: on fixed dates of the month, or on nth weekdays. */
  monthMode: RoutineMonthMode;
  /** 1–31; -1 = last day. Dates past a short month's end fall on its last day. */
  monthDates: number[];
  /** 1–5; -1 = last (e.g. [1, 3] with weekday 4 = 1st & 3rd Thursday). */
  nthWeeks: number[];
  weekday: number;
  /** First possible date and anchor for "every N" counting. */
  startDate: string;
  /** Optional last date. Routines never NEED an end. */
  endDate: string | null;
}

export type RoutineTimeMode = "anytime" | "block" | "time";
export type RoutineTimeBlock = "am" | "midday" | "pm";
export type RoutineStatus = "active" | "paused";

export interface RoutineActivity {
  id: string;
  title: string;
  estimateMinutes: number | null;
  notes: string;
}

export interface Routine {
  id: string;
  subAccountId: string;
  agencyId: string;
  name: string;
  description: string;
  icon: RoutineIconKey;
  color: RoutineColorKey;
  status: RoutineStatus;
  schedule: RoutineSchedule;
  /** Anytime is the default — no invented appointment time. */
  timeMode: RoutineTimeMode;
  timeBlock: RoutineTimeBlock | null;
  /** "HH:MM" (24h) when timeMode === "time". */
  time: string | null;
  activities: RoutineActivity[];
  /** Optional association. Occurrence tasks do NOT carry projectId, so they never touch project progress or the Client Portal. */
  projectId: string | null;
  /** When true, the routine stops after the associated project's due date (or once the project is no longer active). */
  endsWithProject: boolean;
  /** Who the generated activities are assigned to (the creator by default). */
  assigneeUid: string | null;
  createdByUid: string;
  pausedAt?: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** Wire shape returned by the routines API (timestamps as ISO strings). */
export interface RoutineView
  extends Omit<Routine, "createdAt" | "updatedAt" | "pausedAt"> {
  createdAt: string | null;
  updatedAt: string | null;
  projectTitle: string | null;
  /** Last date the routine can run given its end date and project window (null = open-ended). */
  windowEnd: string | null;
  /** True when `endsWithProject` and the project is no longer active. */
  windowClosed: boolean;
}

/** One scheduled or recorded date for a routine. */
export interface RoutineDaySummary {
  date: string;
  /** In the CURRENT schedule. */
  scheduled: boolean;
  /** Activity tasks exist for this date (it was generated). */
  recorded: boolean;
  done: number;
  total: number;
}

export interface RoutineOccurrenceTask {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  completedAt: string | null;
  estimateMinutes: number | null;
  timeSpentSeconds: number;
  activityId: string;
  date: string;
}

export interface RoutineListItem {
  routine: RoutineView;
  today: string;
  /** Headline progress on the card. */
  progress: {
    label: string;
    done: number;
    total: number;
    date: string | null;
  };
  /** The current week (Sun–Sat), for the S M T W T F S row. */
  week: RoutineDaySummary[];
  nextDate: string | null;
}

/** A Momentum OS project-generated routine (recurring task with kind "routine") — shown read-only. */
export interface ProjectRoutineItem {
  taskId: string;
  title: string;
  projectId: string;
  projectTitle: string;
  recurrenceType: string;
  timeBlock: string | null;
  estimateMinutes: number | null;
  dueAt: string | null;
}

export interface RoutineCalendarEntry {
  routineId: string;
  name: string;
  icon: RoutineIconKey;
  color: RoutineColorKey;
  date: string;
  timeMode: RoutineTimeMode;
  timeBlock: RoutineTimeBlock | null;
  time: string | null;
  done: number;
  total: number;
}

// ── look ─────────────────────────────────────────────────────────────────────

export const ROUTINE_COLORS = {
  violet: { label: "Violet", hex: "#7c3aed" },
  pink: { label: "Pink", hex: "#ec4899" },
  orange: { label: "Orange", hex: "#f97316" },
  amber: { label: "Amber", hex: "#eab308" },
  green: { label: "Green", hex: "#22c55e" },
  teal: { label: "Teal", hex: "#14b8a6" },
  blue: { label: "Blue", hex: "#3b82f6" },
  indigo: { label: "Indigo", hex: "#6366f1" },
  fuchsia: { label: "Fuchsia", hex: "#d946ef" },
} as const;
export type RoutineColorKey = keyof typeof ROUTINE_COLORS;
export const ROUTINE_COLOR_KEYS = Object.keys(ROUTINE_COLORS) as RoutineColorKey[];

export const ROUTINE_ICON_KEYS = [
  "sun",
  "laptop",
  "chart",
  "dumbbell",
  "book",
  "heart",
  "coffee",
  "target",
  "brain",
  "calendar",
  "mail",
  "megaphone",
  "moon",
  "pen",
  "wallet",
  "sparkles",
  "users",
  "leaf",
] as const;
export type RoutineIconKey = (typeof ROUTINE_ICON_KEYS)[number];

export const ROUTINE_TIME_BLOCK_LABELS: Record<RoutineTimeBlock, string> = {
  am: "AM",
  midday: "Midday",
  pm: "PM",
};

export const MAX_ROUTINE_ACTIVITIES = 30;
