import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { loadVisibleContacts } from "@/lib/server/contacts-query-service";
import { toEpochMs } from "@/lib/segmentation/eval-condition-group";
import { dealPipelineId, type Pipeline } from "@/types/pipelines";
import type { Deal } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import {
  BOARD_STAGE_PAGE_SIZE,
  DEAL_LIST_PAGE_SIZE,
  type BoardColumn,
  type CurrencyTotals,
  type DealContactSummary,
  type DealFilters,
  type DealNextActivity,
  type DealRowWire,
  type DealSort,
  type DealSortField,
  type PipelineStats,
} from "@/types/pipeline-board";

/**
 * Multiple Pipelines (2026-09-25) — the ONE server-side deal query behind
 * the Pipelines Overview stats, the Board and the List view.
 *
 * Replaces the old board's "subscribe to every deal AND every contact of
 * the sub-account in the browser". Same bounded-candidate-set pattern as
 * the Contacts list (`contacts-query-service.ts`): read the caller's
 * visible deals once (sub-account + territory scoped, mirroring the
 * Firestore rule), cache them per server instance for CACHE_TTL_MS, then
 * filter / aggregate / page in memory. The browser receives one page of
 * cards per stage (or one list page) plus exact aggregate counts/totals,
 * so statistics stay correct while cards load incrementally.
 *
 * Contact fields for search / the country filter come from the Contacts
 * list's own cached candidate set (same territory scope, same 30s cache);
 * the contact shown on each returned card is read by id for that page only.
 */

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 50;

interface CacheEntry {
  at: number;
  deals: Deal[];
}
const cache = new Map<string, CacheEntry>();

function cacheKey(subAccountId: string, territoryIds: string[] | null): string {
  return `${subAccountId}|${territoryIds ? [...territoryIds].sort().join(",") : "*"}`;
}

/** Drop cached deal sets for a sub-account (after a local write). */
export function invalidateDealsCache(subAccountId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${subAccountId}|`)) cache.delete(key);
  }
}

/**
 * Every deal this caller may see. `territoryIds === null` → the whole
 * sub-account; `[]` → nothing; otherwise `territoryId in [...]` — the same
 * restriction the Firestore rule and the old client listener applied.
 */
export async function loadVisibleDeals(opts: {
  subAccountId: string;
  territoryIds: string[] | null;
  fresh?: boolean;
}): Promise<Deal[]> {
  const { subAccountId, territoryIds } = opts;
  if (territoryIds && territoryIds.length === 0) return [];
  const key = cacheKey(subAccountId, territoryIds);
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.deals;
  }
  let query: FirebaseFirestore.Query = getAdminDb()
    .collection("deals")
    .where("subAccountId", "==", subAccountId);
  if (territoryIds) {
    query = query.where("territoryId", "in", territoryIds.slice(0, 30));
  }
  const snap = await query.get();
  const deals = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Deal, "id">) }) as Deal,
  );
  cache.set(key, { at: Date.now(), deals });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return deals;
}

function add(totals: CurrencyTotals, currency: string, value: number) {
  const c = (currency || "USD").toUpperCase();
  totals[c] = (totals[c] ?? 0) + (Number.isFinite(value) ? value : 0);
}

export function computeStats(deals: Deal[]): PipelineStats {
  const stats: PipelineStats = {
    openCount: 0,
    wonCount: 0,
    lostCount: 0,
    openValue: {},
    wonValue: {},
    winRate: null,
    stageCounts: {},
  };
  for (const d of deals) {
    stats.stageCounts[d.stageId] = (stats.stageCounts[d.stageId] ?? 0) + 1;
    if (d.stageId === "won") {
      stats.wonCount++;
      add(stats.wonValue, d.currency, d.value);
    } else if (d.stageId === "lost") {
      stats.lostCount++;
    } else {
      stats.openCount++;
      add(stats.openValue, d.currency, d.value);
    }
  }
  const closed = stats.wonCount + stats.lostCount;
  stats.winRate = closed > 0 ? Math.round((stats.wonCount / closed) * 100) : null;
  return stats;
}

/** Stats for every pipeline from one pass over the caller's visible deals. */
export async function summarizePipelines(opts: {
  subAccountId: string;
  territoryIds: string[] | null;
  pipelines: Pipeline[];
  fresh?: boolean;
}): Promise<Map<string, { stats: PipelineStats; lastDealAt: number }>> {
  const deals = await loadVisibleDeals(opts);
  const byPipeline = new Map<string, Deal[]>();
  for (const p of opts.pipelines) byPipeline.set(p.id, []);
  for (const d of deals) byPipeline.get(dealPipelineId(d))?.push(d);
  const out = new Map<string, { stats: PipelineStats; lastDealAt: number }>();
  for (const [id, list] of byPipeline) {
    out.set(id, {
      stats: computeStats(list),
      lastDealAt: list.reduce((m, d) => Math.max(m, toEpochMs(d.updatedAt) ?? 0), 0),
    });
  }
  return out;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

function matchesFilters(
  d: Deal,
  f: DealFilters,
  contact: Contact | undefined,
  needle: string,
): boolean {
  if (f.stageIds.length > 0 && !f.stageIds.includes(d.stageId)) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(d.priority)) return false;
  const value = d.value ?? 0;
  if (f.minValue !== null && value < f.minValue) return false;
  if (f.maxValue !== null && value > f.maxValue) return false;
  if (f.territories.length > 0 && !(d.territoryId && f.territories.includes(d.territoryId))) {
    return false;
  }
  if (f.countries.length > 0 && !(contact?.country && f.countries.includes(contact.country))) {
    return false;
  }
  if (needle) {
    const hay = [
      d.title,
      d.description,
      contact?.name,
      contact?.firstName,
      contact?.lastName,
      contact?.email,
      contact?.company,
    ]
      .map(text)
      .join("\n")
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

/**
 * The shared filter step for Board and List: the pipeline's deals (legacy
 * deals without `pipelineId` count for the default pipeline) narrowed by
 * the filter model. Also returns the country options of the UNFILTERED
 * pipeline so the filter dropdown doesn't shrink as filters apply.
 */
export async function matchPipelineDeals(opts: {
  subAccountId: string;
  territoryIds: string[] | null;
  pipelineId: string;
  filters: DealFilters;
  fresh?: boolean;
}): Promise<{ deals: Deal[]; all: Deal[]; countries: string[] }> {
  const visible = await loadVisibleDeals(opts);
  const all = visible.filter((d) => dealPipelineId(d) === opts.pipelineId);
  const needle = opts.filters.search.trim().toLowerCase();
  // Country filter options + search/country matching need contact fields.
  const contacts = await loadVisibleContacts({
    subAccountId: opts.subAccountId,
    territoryIds: opts.territoryIds,
    fresh: opts.fresh,
  });
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const countries = new Set<string>();
  for (const d of all) {
    const c = byId.get(d.contactId)?.country;
    if (c) countries.add(c);
  }
  const deals = all.filter((d) =>
    matchesFilters(d, opts.filters, byId.get(d.contactId), needle),
  );
  return { deals, all, countries: [...countries].sort((a, b) => a.localeCompare(b)) };
}

/** Recently-moved first — the board's historical ordering. */
function byStageChangedDesc(a: Deal, b: Deal): number {
  return (toEpochMs(b.stageChangedAt) ?? 0) - (toEpochMs(a.stageChangedAt) ?? 0);
}

function iso(v: unknown): string | null {
  const ms = toEpochMs(v);
  return ms === null ? null : new Date(ms).toISOString();
}

async function contactSummaries(ids: string[]): Promise<Map<string, DealContactSummary>> {
  const out = new Map<string, DealContactSummary>();
  const unique = [...new Set(ids.filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id)))];
  if (unique.length === 0) return out;
  const db = getAdminDb();
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((id) => db.doc(`contacts/${id}`));
    const snaps = await db.getAll(...refs, { fieldMask: ["name", "email", "phone", "company"] });
    for (const s of snaps) {
      if (!s.exists) continue;
      out.set(s.id, {
        id: s.id,
        name: text(s.get("name")) || null,
        email: text(s.get("email")) || null,
        phone: text(s.get("phone")) || null,
        company: text(s.get("company")) || null,
      });
    }
  }
  return out;
}

export type RowExtra = "nextTask" | "nextAppointment";

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Next open task (earliest due; undated last) and next upcoming appointment
 * linked to each deal. Equality + `in` queries only (no composite index);
 * the date comparison happens in memory over each deal's own records.
 */
export async function nextActivitiesForDeals(
  subAccountId: string,
  dealIds: string[],
  include: Set<RowExtra>,
): Promise<{ tasks: Map<string, DealNextActivity>; appointments: Map<string, DealNextActivity> }> {
  const tasks = new Map<string, DealNextActivity>();
  const appointments = new Map<string, DealNextActivity>();
  const ids = [...new Set(dealIds)];
  if (ids.length === 0) return { tasks, appointments };
  const db = getAdminDb();
  const now = Date.now();
  await Promise.all(
    chunks(ids, 30).map(async (chunk) => {
      const [taskSnap, eventSnap] = await Promise.all([
        include.has("nextTask")
          ? db
              .collection("tasks")
              .where("subAccountId", "==", subAccountId)
              .where("dealId", "in", chunk)
              .where("completed", "==", false)
              .get()
          : null,
        include.has("nextAppointment")
          ? db
              .collection("events")
              .where("subAccountId", "==", subAccountId)
              .where("dealId", "in", chunk)
              .get()
          : null,
      ]);
      for (const t of taskSnap?.docs ?? []) {
        const dealId = String(t.get("dealId"));
        const due = toEpochMs(t.get("dueAt"));
        const cur = tasks.get(dealId);
        const curDue = cur?.at ? Date.parse(cur.at) : null;
        const better =
          !cur || (due !== null && (curDue === null || due < curDue));
        if (better) {
          tasks.set(dealId, {
            id: t.id,
            title: text(t.get("title")),
            at: due === null ? null : new Date(due).toISOString(),
          });
        }
      }
      for (const e of eventSnap?.docs ?? []) {
        const status = text(e.get("status")) || "scheduled";
        if (status === "cancelled" || status === "completed" || status === "no_show") continue;
        const start = toEpochMs(e.get("startAt"));
        if (start === null || start < now) continue;
        const dealId = String(e.get("dealId"));
        const cur = appointments.get(dealId);
        if (!cur || start < Date.parse(cur.at!)) {
          appointments.set(dealId, {
            id: e.id,
            title: text(e.get("title")),
            at: new Date(start).toISOString(),
          });
        }
      }
    }),
  );
  return { tasks, appointments };
}

export async function toRows(
  deals: Deal[],
  opts: { subAccountId?: string; include?: Set<RowExtra> } = {},
): Promise<DealRowWire[]> {
  const include = opts.include ?? new Set<RowExtra>();
  const [contacts, next] = await Promise.all([
    contactSummaries(deals.map((d) => d.contactId)),
    opts.subAccountId && include.size > 0
      ? nextActivitiesForDeals(opts.subAccountId, deals.map((d) => d.id), include)
      : null,
  ]);
  return deals.map((d) => ({
    id: d.id,
    title: d.title ?? "",
    value: typeof d.value === "number" ? d.value : 0,
    currency: (d.currency || "USD").toUpperCase(),
    contactId: d.contactId,
    pipelineId: dealPipelineId(d),
    stageId: d.stageId,
    priority: d.priority ?? "medium",
    description: d.description ?? null,
    expectedCloseDate: d.expectedCloseDate ?? null,
    lostReason: d.lostReason ?? null,
    completed: d.completed === true,
    territoryId: d.territoryId ?? null,
    customFields: d.customFields ?? null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    stageChangedAt: iso(d.stageChangedAt),
    contact: contacts.get(d.contactId) ?? null,
    ...(include.has("nextTask") ? { nextTask: next?.tasks.get(d.id) ?? null } : {}),
    ...(include.has("nextAppointment")
      ? { nextAppointment: next?.appointments.get(d.id) ?? null }
      : {}),
  }));
}

export function parseRowExtras(raw: unknown): Set<RowExtra> {
  const out = new Set<RowExtra>();
  if (Array.isArray(raw)) {
    for (const v of raw) if (v === "nextTask" || v === "nextAppointment") out.add(v);
  }
  return out;
}

/**
 * Board columns: exact count + per-currency totals for every stage, and a
 * page of cards (`offset` per stage for "load more"). Stages come from the
 * pipeline's active stages plus any archived stage that still holds deals
 * (shouldn't happen — archiving requires reassignment — but never hide a
 * deal). Deals on a stage id the pipeline doesn't know are grouped under
 * their raw id so they stay visible.
 */
export async function buildBoardColumns(opts: {
  pipeline: Pipeline;
  deals: Deal[];
  offsets?: Record<string, number>;
  onlyStageId?: string | null;
  include?: Set<RowExtra>;
}): Promise<BoardColumn[]> {
  const grouped = new Map<string, Deal[]>();
  for (const d of opts.deals) {
    if (!grouped.has(d.stageId)) grouped.set(d.stageId, []);
    grouped.get(d.stageId)!.push(d);
  }
  const order = opts.pipeline.stages
    .filter((s) => !s.archived || (grouped.get(s.id)?.length ?? 0) > 0)
    .map((s) => s.id);
  for (const id of grouped.keys()) if (!order.includes(id)) order.push(id);

  const pageDeals: Deal[] = [];
  const slices = new Map<string, Deal[]>();
  for (const stageId of order) {
    if (opts.onlyStageId && stageId !== opts.onlyStageId) continue;
    const list = (grouped.get(stageId) ?? []).sort(byStageChangedDesc);
    const offset = Math.max(0, Math.floor(opts.offsets?.[stageId] ?? 0));
    const slice = list.slice(offset, offset + BOARD_STAGE_PAGE_SIZE);
    slices.set(stageId, slice);
    pageDeals.push(...slice);
  }
  const rows = await toRows(pageDeals, {
    subAccountId: opts.pipeline.subAccountId,
    include: opts.include,
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));
  return order
    .filter((id) => !opts.onlyStageId || id === opts.onlyStageId)
    .map((stageId) => {
      const list = grouped.get(stageId) ?? [];
      const totals: CurrencyTotals = {};
      for (const d of list) add(totals, d.currency, d.value);
      return {
        stageId,
        count: list.length,
        totals,
        deals: (slices.get(stageId) ?? []).map((d) => rowById.get(d.id)!),
      };
    });
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SORT_FIELDS = new Set<DealSortField>([
  "title",
  "value",
  "stage",
  "priority",
  "expectedCloseDate",
  "updatedAt",
  "stageChangedAt",
  "createdAt",
]);

export function normalizeDealSort(input: unknown): DealSort {
  const s = (input ?? {}) as Record<string, unknown>;
  const field = SORT_FIELDS.has(s.field as DealSortField)
    ? (s.field as DealSortField)
    : "updatedAt";
  return { field, dir: s.dir === "asc" ? "asc" : "desc" };
}

/** List view: one sorted page, same filter model as the board. */
export async function buildListPage(opts: {
  pipeline: Pipeline;
  deals: Deal[];
  sort: DealSort;
  page: number;
  include?: Set<RowExtra>;
}): Promise<{ rows: DealRowWire[]; total: number; page: number; pageCount: number }> {
  const stageIndex = new Map(opts.pipeline.stages.map((s, i) => [s.id, i]));
  const key = (d: Deal): string | number | null => {
    switch (opts.sort.field) {
      case "title":
        return (d.title ?? "").toLowerCase() || null;
      case "value":
        return d.value ?? 0;
      case "stage":
        return stageIndex.get(d.stageId) ?? 999;
      case "priority":
        return PRIORITY_RANK[d.priority] ?? 1;
      case "expectedCloseDate":
        return d.expectedCloseDate ?? null;
      default:
        return toEpochMs(d[opts.sort.field]);
    }
  };
  const dir = opts.sort.dir === "asc" ? 1 : -1;
  const sorted = [...opts.deals].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    // Empty values always sort last, whichever direction.
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka < kb) return -1 * dir;
    if (ka > kb) return 1 * dir;
    return a.id.localeCompare(b.id);
  });
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / DEAL_LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page || 1)), pageCount);
  const slice = sorted.slice((page - 1) * DEAL_LIST_PAGE_SIZE, page * DEAL_LIST_PAGE_SIZE);
  return {
    rows: await toRows(slice, { subAccountId: opts.pipeline.subAccountId, include: opts.include }),
    total,
    page,
    pageCount,
  };
}

/** Parse the shared filter model from an untrusted request body. */
export function parseDealFilters(raw: unknown): DealFilters {
  const b = (raw ?? {}) as Record<string, unknown>;
  const strList = (v: unknown, max = 50) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.length <= 128).slice(0, max)
      : [];
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    search: typeof b.search === "string" ? b.search.slice(0, 200) : "",
    stageIds: strList(b.stageIds),
    priorities: strList(b.priorities).filter(
      (p): p is DealFilters["priorities"][number] =>
        p === "high" || p === "medium" || p === "low",
    ),
    minValue: num(b.minValue),
    maxValue: num(b.maxValue),
    countries: strList(b.countries, 250),
    territories: strList(b.territories),
  };
}
