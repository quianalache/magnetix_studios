/**
 * Page Version History (V1, 2026-11-17) — shared, client-safe definitions.
 *
 * A version is a server-written checkpoint of a page's DESIGN: the Puck tree
 * (`puckDraftData` shape) plus the page's Popups. It never holds page identity
 * or operational records (name, slug, status, published copy, funnel, analytics,
 * Reading Result settings). Stored at `pages/{pageId}/versions/{versionId}`
 * (server-only — Firestore's default deny covers the subcollection).
 *
 * Owner-approved policy:
 *   - at most 15 versions per page (the current live design is never pruned);
 *   - an automatic checkpoint at most every 30 minutes, only while the page is
 *     actually being edited (autosaves with changes) — never on a timer;
 *   - checkpoints on manual Save Draft, Publish, and before Revert / Restore;
 *   - Restore replaces the DRAFT only; the live page changes only on Publish.
 */

export const PAGE_VERSION_LIMIT = 15;
export const AUTO_CHECKPOINT_INTERVAL_MS = 30 * 60 * 1000;

export type PageVersionReason =
  | "manual"
  | "auto"
  | "publish"
  | "previous_live"
  | "before_revert"
  | "before_restore"
  | "restored";

export const PAGE_VERSION_REASON_LABELS: Record<PageVersionReason, string> = {
  manual: "Manual save",
  auto: "Auto-saved",
  publish: "Published",
  previous_live: "Previously live",
  before_revert: "Before revert",
  before_restore: "Before restore",
  restored: "Restored version",
};

/** List entry — metadata only; the design is fetched separately for preview. */
export interface PageVersionMeta {
  id: string;
  reason: PageVersionReason;
  createdAtMs: number | null;
  createdByName: string | null;
  sizeBytes: number;
  /** For "restored" entries: when the version that was restored was saved. */
  restoredFromAtMs: number | null;
}

export interface PageVersionList {
  versions: PageVersionMeta[];
  /** Newest version holding the design that is live right now (published pages only). */
  liveVersionId: string | null;
  /** Newest version identical to the saved draft. */
  draftVersionId: string | null;
  draftRevision: number;
  limit: number;
}

export function isPageVersionReason(value: unknown): value is PageVersionReason {
  return typeof value === "string" && value in PAGE_VERSION_REASON_LABELS;
}

/** Version ids are Firestore auto ids. */
export function isValidVersionId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{1,64}$/.test(value);
}

/** "Today · 2:30 PM", "Yesterday · 4:10 PM", "Jan 28 · 11:25 AM" (+ year when not this year). */
export function formatVersionTime(ms: number | null, now: Date = new Date()): string {
  if (ms == null) return "Saving…";
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Yesterday · ${time}`;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  return `${date} · ${time}`;
}
