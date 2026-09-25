import type { Timestamp, FieldValue } from "firebase/firestore";
import type { ConditionGroup } from "./workflows";

/**
 * Contact Lists (Contacts redesign, 2026-09-25) — a named, saved, DYNAMIC
 * contact segment. Stores only the filter definition (the same
 * `ConditionGroup` shape Workflows and Broadcasts already evaluate with
 * `lib/segmentation/eval-condition-group.ts`), never a copy of contact
 * records — membership is recomputed against live contact data every time
 * the list is viewed or used as a Broadcast audience, so contacts enter and
 * leave automatically as their fields change.
 *
 * Top-level `contactLists/{id}`, server-only (no client rules access): every
 * read/write goes through `/api/sub-accounts/[id]/contact-lists` (Admin SDK,
 * tenancy-checked), so there is no rules deploy for this collection.
 */
export interface ContactListDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  name: string;
  description: string;
  group: ConditionGroup;
  createdByUid: string;
  updatedByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** Wire shape returned by the Contact Lists API (timestamps as ISO). */
export interface ContactListView {
  id: string;
  name: string;
  description: string;
  group: ConditionGroup;
  createdByUid: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** Caller may edit/delete (creator or sub-account admin). */
  canEdit: boolean;
}
