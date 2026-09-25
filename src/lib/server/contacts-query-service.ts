import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  evalConditionGroup,
  groupUsesAccessConditions,
  toEpochMs,
} from "@/lib/segmentation/eval-condition-group";
import { buildAccessIndexForGroup } from "@/lib/segmentation/access-index";
import { contactDisplayName } from "@/lib/contacts/names";
import type { Contact } from "@/types/contacts";
import type { ConditionGroup } from "@/types/workflows";
import {
  CONTACTS_PAGE_SIZE,
  type ContactRow,
  type ContactSort,
  type ContactSortField,
} from "@/types/contact-search";

/**
 * Server-side contact search for the Contacts list (Contacts redesign,
 * 2026-09-25). Replaces the list page's old "subscribe to every contact in
 * the sub-account in the browser" model: the browser now receives one
 * 25-row page.
 *
 * Why evaluation happens in server memory rather than as a Firestore query:
 * the filters are the shared segmentation engine's arbitrary field/operator
 * AND/OR groups, and search is substring match across several fields —
 * neither is expressible as a Firestore compound query. This is the SAME
 * bounded-candidate-set pattern the Broadcast audience resolver already
 * uses (lib/broadcasts/audience.ts): read the caller's visible contacts
 * (sub-account scoped + territory scoped), evaluate with the one shared
 * evaluator, then sort + slice.
 *
 * Cost control: the candidate set is cached per (sub-account, territory
 * scope) for CACHE_TTL_MS in this server instance, so paging / sorting /
 * refining a filter doesn't re-read the sub-account. Callers pass `fresh`
 * after a mutation. Firestore reads are therefore no higher than the old
 * page (which read every contact on every visit AND held a live listener),
 * and usually far lower. Known scaling limit: very large sub-accounts
 * (tens of thousands of contacts) would want a search index; see the
 * Contacts section of CLAUDE.md.
 */

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 50;
/** Hard ceiling on rows an export can return. */
export const EXPORT_MAX_ROWS = 25_000;

interface CacheEntry {
  at: number;
  contacts: Contact[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(subAccountId: string, territoryIds: string[] | null): string {
  return `${subAccountId}|${territoryIds ? [...territoryIds].sort().join(",") : "*"}`;
}

/** Drop cached candidate sets for a sub-account (after a local write). */
export function invalidateContactsCache(subAccountId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${subAccountId}|`)) cache.delete(key);
  }
}

/**
 * Every contact this caller may see. `territoryIds === null` → the whole
 * sub-account (admin / owner / scoping off); `[]` → nothing; otherwise the
 * same `territoryId in [...]` restriction the client list used (mirrors
 * `territoryQueryPlan` + the Firestore rule).
 */
export async function loadVisibleContacts(opts: {
  subAccountId: string;
  territoryIds: string[] | null;
  fresh?: boolean;
}): Promise<Contact[]> {
  const { subAccountId, territoryIds } = opts;
  if (territoryIds && territoryIds.length === 0) return [];
  const key = cacheKey(subAccountId, territoryIds);
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.contacts;
  }

  let query: FirebaseFirestore.Query = getAdminDb()
    .collection("contacts")
    .where("subAccountId", "==", subAccountId);
  if (territoryIds) {
    query = query.where("territoryId", "in", territoryIds.slice(0, 30));
  }
  const snap = await query.get();
  const contacts = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Contact, "id">) }) as Contact,
  );

  cache.set(key, { at: Date.now(), contacts });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return contacts;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function matchesSearch(c: Contact, needle: string, digits: string): boolean {
  const hay = [
    c.name,
    c.firstName,
    c.lastName,
    c.email,
    c.phone,
    c.company,
  ]
    .map(text)
    .join("\n")
    .toLowerCase();
  if (hay.includes(needle)) return true;
  // "5551234" should find "+1 (555) 123-4…" — compare digits only.
  if (digits.length >= 3) {
    return text(c.phone).replace(/\D/g, "").includes(digits);
  }
  return false;
}

function sortValue(c: Contact, field: ContactSortField): string | number | null {
  switch (field) {
    case "createdAt":
    case "updatedAt":
      return toEpochMs(c[field]);
    case "name":
      return contactDisplayName(c, "").toLowerCase() || null;
    default:
      return text(c[field]).toLowerCase() || null;
  }
}

function compareContacts(a: Contact, b: Contact, sort: ContactSort): number {
  const av = sortValue(a, sort.field);
  const bv = sortValue(b, sort.field);
  // Blank values always sort last, whichever direction.
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  const cmp =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
  return sort.dir === "asc" ? cmp : -cmp;
}

const SORT_FIELDS: ReadonlySet<ContactSortField> = new Set<ContactSortField>([
  "name",
  "email",
  "phone",
  "company",
  "source",
  "createdAt",
  "updatedAt",
]);

export function normalizeSort(input: unknown): ContactSort {
  const raw = (input ?? {}) as { field?: unknown; dir?: unknown };
  const field = SORT_FIELDS.has(raw.field as ContactSortField)
    ? (raw.field as ContactSortField)
    : "createdAt";
  const dir = raw.dir === "asc" ? "asc" : "desc";
  return { field, dir };
}

/**
 * Evaluate search + every group (ANDed — an ad-hoc filter group plus an
 * optional saved-list group) over the caller's visible contacts.
 */
export async function matchContacts(opts: {
  subAccountId: string;
  territoryIds: string[] | null;
  search?: string;
  groups: ConditionGroup[];
  sort: ContactSort;
  fresh?: boolean;
}): Promise<{ matched: Contact[]; visibleTotal: number }> {
  const visible = await loadVisibleContacts(opts);
  const groups = opts.groups.filter((g) => (g.all?.length ?? 0) > 0);

  // One access index covering every access key referenced by any group.
  let accessIndex: Map<string, Set<string>> | null = null;
  if (groups.some(groupUsesAccessConditions)) {
    accessIndex = new Map();
    for (const g of groups) {
      const idx = await buildAccessIndexForGroup(opts.subAccountId, g);
      idx?.forEach((set, key) => accessIndex!.set(key, set));
    }
  }
  const ctx = { accessIndex, now: Date.now() };

  const needle = (opts.search ?? "").trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const matched = visible.filter(
    (c) =>
      (!needle || matchesSearch(c, needle, digits)) &&
      groups.every((g) => evalConditionGroup(g, c, ctx)),
  );
  matched.sort((a, b) => compareContacts(a, b, opts.sort));
  return { matched, visibleTotal: visible.length };
}

function iso(v: unknown): string | null {
  const ms = toEpochMs(v);
  return ms === null ? null : new Date(ms).toISOString();
}

export function toContactRow(c: Contact): ContactRow {
  return {
    id: c.id,
    name: text(c.name),
    firstName: text(c.firstName),
    lastName: text(c.lastName),
    email: text(c.email),
    phone: text(c.phone),
    company: text(c.company),
    address: text(c.address),
    source: text(c.source),
    tags: Array.isArray(c.tags) ? c.tags.filter((t) => typeof t === "string") : [],
    pipelineStage: c.pipelineStage ?? null,
    city: text(c.city),
    state: text(c.state),
    postalCode: text(c.postalCode),
    country: text(c.country),
    territoryId: c.territoryId ?? null,
    customFields:
      c.customFields && typeof c.customFields === "object" ? c.customFields : null,
    emailOptedOut: c.emailOptedOut === true,
    smsOptedOut: c.smsOptedOut === true,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export function paginate<T>(
  items: T[],
  page: number,
): { slice: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / CONTACTS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * CONTACTS_PAGE_SIZE;
  return {
    slice: items.slice(start, start + CONTACTS_PAGE_SIZE),
    page: current,
    pageCount,
  };
}
