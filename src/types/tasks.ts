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
