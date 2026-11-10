import type { FunnelStatus, FunnelStepType } from "@/types/checkout";
import type { PageDoc, PageStatus, PageType } from "@/types/pages-funnels";
import { toMillis } from "@/lib/pages-funnels/thumbnail";

/**
 * Pages & Funnels home — pure list logic shared by the library UI and its
 * checks (2026-11). Search, filters, sorting and paging run on the
 * workspace's own page records (already loaded by the page listener).
 */

/** One funnel step that shows a page. */
export interface PageFunnelUse {
  funnelId: string;
  funnelName: string;
  funnelStatus: FunnelStatus;
  stepId: string;
  stepName: string;
  stepType: FunnelStepType;
  stepNumber: number;
}

export interface PagesLibraryFunnel {
  id: string;
  name: string;
  status: FunnelStatus;
  stepCount: number;
  createdAt: number;
  updatedAt: number;
}

export const FUNNEL_STEP_TYPE_LABELS: Record<FunnelStepType, string> = {
  page: "Page",
  checkout: "Checkout",
  upsell: "Upsell",
  downsell: "Downsell",
  thank_you: "Thank you",
};

export const FUNNEL_STATUS_LABELS: Record<FunnelStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };

export const PAGE_STATUS_LABELS: Record<PageStatus, string> = { draft: "Draft", published: "Published" };

export const PAGES_PER_PAGE = 12;
export const FUNNELS_PER_PAGE = 10;

/** Funnel filter: every page, only pages no funnel step uses, or one funnel's pages. */
export type FunnelFilter = "all" | "standalone" | `funnel:${string}`;
export type PageSort = "updated" | "name";

export interface PageFilters {
  query: string;
  type: PageType | null;
  status: PageStatus | null;
  funnel: FunnelFilter;
  sort: PageSort;
}

export const DEFAULT_PAGE_FILTERS: PageFilters = { query: "", type: null, status: null, funnel: "all", sort: "updated" };

const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").trim();

export function pageUpdatedMs(page: Pick<PageDoc, "updatedAt" | "createdAt">): number {
  return toMillis(page.updatedAt) ?? toMillis(page.createdAt) ?? 0;
}

export function filterPages<P extends Pick<PageDoc, "id" | "name" | "pageType" | "status" | "updatedAt" | "createdAt">>(
  pages: P[],
  filters: PageFilters,
  usage: Record<string, PageFunnelUse[]>,
): P[] {
  const q = norm(filters.query);
  const out = pages.filter((p) => {
    if (filters.type && p.pageType !== filters.type) return false;
    if (filters.status && p.status !== filters.status) return false;
    const uses = usage[p.id] ?? [];
    if (filters.funnel === "standalone" && uses.length) return false;
    if (filters.funnel.startsWith("funnel:")) {
      const id = filters.funnel.slice("funnel:".length);
      if (!uses.some((u) => u.funnelId === id)) return false;
    }
    if (q && !norm(p.name ?? "").includes(q) && !uses.some((u) => norm(u.funnelName).includes(q))) return false;
    return true;
  });
  return out.sort((a, b) =>
    filters.sort === "name" ? (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }) : pageUpdatedMs(b) - pageUpdatedMs(a),
  );
}

export function filterFunnels(funnels: PagesLibraryFunnel[], query: string, status: FunnelStatus | null): PagesLibraryFunnel[] {
  const q = norm(query);
  return funnels.filter((f) => (!status || f.status === status) && (!q || norm(f.name).includes(q)));
}

/** Clamp a 1-based page number to the result count. */
export function clampPage(page: number, total: number, perPage: number): number {
  const last = Math.max(1, Math.ceil(total / perPage));
  return Math.min(Math.max(1, page), last);
}

/** "Spring Launch · Step 3 Upsell" — the label a page card shows for one use. */
export function describeUse(u: PageFunnelUse): string {
  return `${u.funnelName} · Step ${u.stepNumber} ${FUNNEL_STEP_TYPE_LABELS[u.stepType]}`;
}
