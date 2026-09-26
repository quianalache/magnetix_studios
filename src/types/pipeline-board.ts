import type { Deal, DealPriority } from "./deals";
import type { Pipeline } from "./pipelines";

/**
 * Multiple Pipelines (2026-09-25) — wire shapes for the server-side deal
 * query that backs BOTH the Board and the List view (one retrieval path,
 * one filter model). Timestamps travel as ISO strings; `hydrateDealRow`
 * turns them back into `Date`s so the existing card/dialog components —
 * which read `Timestamp | Date` via `toDate()` — work unchanged.
 */

export const BOARD_STAGE_PAGE_SIZE = 25;
export const DEAL_LIST_PAGE_SIZE = 25;

/** Money totals are never summed across currencies. */
export type CurrencyTotals = Record<string, number>;

export interface DealFilters {
  search: string;
  stageIds: string[];
  priorities: DealPriority[];
  minValue: number | null;
  maxValue: number | null;
  countries: string[];
  territories: string[];
}

export const EMPTY_DEAL_FILTERS: DealFilters = {
  search: "",
  stageIds: [],
  priorities: [],
  minValue: null,
  maxValue: null,
  countries: [],
  territories: [],
};

export type DealSortField =
  | "title"
  | "value"
  | "stage"
  | "priority"
  | "expectedCloseDate"
  | "updatedAt"
  | "stageChangedAt"
  | "createdAt";

export interface DealSort {
  field: DealSortField;
  dir: "asc" | "desc";
}

export interface DealContactSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  company: string | null;
}

/** The next open task / upcoming appointment linked to a deal. */
export interface DealNextActivity {
  id: string;
  title: string;
  /** ISO due date (task) or start time (appointment); null when unset. */
  at: string | null;
}

/** A deal as the board/list receive it. */
export interface DealRowWire {
  id: string;
  title: string;
  value: number;
  currency: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  priority: DealPriority;
  description: string | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  completed: boolean;
  territoryId: string | null;
  customFields: Deal["customFields"];
  createdAt: string | null;
  updatedAt: string | null;
  stageChangedAt: string | null;
  contact: DealContactSummary | null;
  nextTask?: DealNextActivity | null;
  nextAppointment?: DealNextActivity | null;
}

export interface PipelineStats {
  openCount: number;
  wonCount: number;
  lostCount: number;
  openValue: CurrencyTotals;
  wonValue: CurrencyTotals;
  /** won / (won + lost), 0–100; null when nothing has closed yet. */
  winRate: number | null;
  /** Deals per stage id (all stages, incl. archived ones that still hold deals). */
  stageCounts: Record<string, number>;
}

export interface BoardColumn {
  stageId: string;
  count: number;
  totals: CurrencyTotals;
  deals: DealRowWire[];
}

export interface BoardResponse {
  pipeline: Pipeline;
  stats: PipelineStats;
  columns: BoardColumn[];
  /** Countries that appear on this pipeline's (unfiltered) deals — filter options. */
  countries: string[];
  /** Deals per stage ignoring filters (Manage Stages needs the real counts). */
  allStageCounts: Record<string, number>;
}

export interface DealListResponse {
  pipeline: Pipeline;
  stats: PipelineStats;
  rows: DealRowWire[];
  total: number;
  page: number;
  pageCount: number;
  countries: string[];
  allStageCounts: Record<string, number>;
}

export interface PipelineSummary {
  pipeline: Pipeline;
  stats: PipelineStats;
  /** Most recent of the pipeline doc's and its deals' updatedAt, ISO. */
  lastActivityAt: string | null;
}

export type BoardDeal = Deal & {
  contact: DealContactSummary | null;
  nextTask?: DealNextActivity | null;
  nextAppointment?: DealNextActivity | null;
};

/** ISO → Date so the existing `toDate()`-based helpers keep working. */
export function hydrateDealRow(row: DealRowWire): BoardDeal {
  const d = (v: string | null) => (v ? new Date(v) : null);
  return {
    ...row,
    agencyId: "",
    subAccountId: "",
    createdByUid: "",
    createdAt: d(row.createdAt) as unknown as Deal["createdAt"],
    updatedAt: d(row.updatedAt) as unknown as Deal["updatedAt"],
    stageChangedAt: d(row.stageChangedAt) as unknown as Deal["stageChangedAt"],
  };
}

/** "USD 1,200 · EUR 300" style rendering helper input, largest first. */
export function currencyEntries(t: CurrencyTotals): [string, number][] {
  return Object.entries(t)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1]);
}
