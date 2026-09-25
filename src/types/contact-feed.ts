import type { FormSubmissionAnswer } from "./forms";

/**
 * Contact profile Notes + Activity tabs (Contacts redesign, 2026-09-25) —
 * wire shapes for `/api/contacts/[id]/notes` and `/api/contacts/[id]/activity`.
 */

export interface ContactNoteView {
  id: string;
  content: string;
  createdAt: string | null;
  /** Set once edited; the original createdAt/createdBy never change. */
  updatedAt: string | null;
  createdBy: string;
  /** Resolved from the sub-account's team-member rows; null when unknown. */
  authorName: string | null;
  editedByName: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface ContactNotesPage {
  notes: ContactNoteView[];
  nextCursor: string | null;
}

export interface ContactActivityItem {
  id: string;
  /** "note" rows are content-free markers synthesized from notes metadata. */
  kind: "activity" | "note";
  type: string;
  content: string;
  createdAt: string;
  createdBy: string;
  actorName: string | null;
  meta: Record<string, unknown> | null;
}

export interface ContactActivityPage {
  items: ContactActivityItem[];
  nextCursor: string | null;
}

/** One submission in the Contact profile's Submitted Forms section. */
export interface ContactSubmissionView {
  id: string;
  formId: string;
  formName: string;
  createdAt: string | null;
  answers: FormSubmissionAnswer[];
  /** True when `answers` came from the legacy raw `values` map. */
  legacy: boolean;
}

export interface ContactSubmissionsResponse {
  submissions: ContactSubmissionView[];
  /** More than the returned 100 exist. */
  truncated: boolean;
}
