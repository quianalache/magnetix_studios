import type { CustomFieldValue } from "./custom-fields";
import type { ConditionGroup } from "./workflows";

/**
 * Contacts list server-side search (Contacts redesign, 2026-09-25) — the
 * wire shapes for `POST /api/sub-accounts/[id]/contacts/search`. The list
 * page receives exactly one page of rows (never the whole sub-account).
 */

export const CONTACTS_PAGE_SIZE = 25;

export type ContactSortField =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "source"
  | "createdAt"
  | "updatedAt";

export interface ContactSort {
  field: ContactSortField;
  dir: "asc" | "desc";
}

export interface ContactSearchRequest {
  /** 1-based. */
  page?: number;
  search?: string;
  /** Ad-hoc filters, evaluated by the shared segmentation engine. */
  group?: ConditionGroup | null;
  /** A saved Contact List — its live definition is ANDed with `group`. */
  listId?: string | null;
  sort?: ContactSort;
  /** Bypass the short server cache (after a create/import/delete). */
  fresh?: boolean;
}

/** One table row — plain JSON (timestamps as ISO strings). */
export interface ContactRow {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  source: string;
  tags: string[];
  pipelineStage: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  territoryId: string | null;
  customFields: Record<string, CustomFieldValue> | null;
  emailOptedOut: boolean;
  smsOptedOut: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ContactSearchResponse {
  contacts: ContactRow[];
  /** Contacts matching search + filters. */
  total: number;
  /** Every contact this caller can see, unfiltered. */
  visibleTotal: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
