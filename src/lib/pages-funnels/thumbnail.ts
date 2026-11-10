import type { PageDoc, PageThumbnailVariant } from "@/types/pages-funnels";

/**
 * Automatic page thumbnails — PURE rules (Pages & Funnels home, 2026-11).
 *
 * A thumbnail is a screenshot of the top of the real rendered page:
 *  - published pages show their PUBLISHED version (what visitors see),
 *  - pages that were never published show their saved DRAFT,
 *  - Reading Result Pages never get one (they show one person's Reading).
 * The server service (lib/server/pages-funnels/page-thumbnail-service.ts)
 * does the capture; everything here is plain data so it can be tested and
 * shared with the client.
 */

/** Capture viewport (CSS px) — a typical laptop's first screen. */
export const THUMBNAIL_VIEWPORT = { width: 1280, height: 800 } as const;
/** Stored at half scale: sharp at card size, small on disk (~40–90 KB). */
export const THUMBNAIL_SCALE = 0.5;

/** Don't re-queue the same version sooner than this (a failed capture retries after it). */
export const RETRY_AFTER_MS = 15 * 60_000;
/** Drafts change constantly: at most one draft capture per page per hour. */
export const DRAFT_MIN_INTERVAL_MS = 60 * 60_000;

/** Most captures queued by one library visit. */
export const MAX_QUEUED_PER_VISIT = 6;

type TimestampLike = { toMillis?: () => number; seconds?: number; _seconds?: number } | number | null | undefined;

/** Firestore Timestamp (admin or client), serialized timestamp or ms → ms. */
export function toMillis(v: unknown): number | null {
  const t = v as TimestampLike;
  if (typeof t === "number") return Number.isFinite(t) ? t : null;
  if (!t || typeof t !== "object") return null;
  if (typeof t.toMillis === "function") return t.toMillis();
  const s = typeof t.seconds === "number" ? t.seconds : typeof t._seconds === "number" ? t._seconds : null;
  return s === null ? null : s * 1000;
}

export interface ThumbnailTarget {
  variant: PageThumbnailVariant;
  sourceVersion: number;
}

type ThumbPage = Pick<PageDoc, "pageType" | "status" | "puckPublishedData" | "puckDraftData" | "puckPublishedAt" | "puckDraftUpdatedAt" | "thumbnail" | "thumbnailRequest">;

/** Which version a page's thumbnail should show, or null when it can't have one. */
export function thumbnailTarget(page: ThumbPage): ThumbnailTarget | null {
  if (page.pageType === "reading_result") return null;
  if (page.status === "published" && page.puckPublishedData) {
    const v = toMillis(page.puckPublishedAt);
    return v === null ? null : { variant: "published", sourceVersion: v };
  }
  if (page.puckDraftData) {
    const v = toMillis(page.puckDraftUpdatedAt);
    return v === null ? null : { variant: "draft", sourceVersion: v };
  }
  return null;
}

/** True when the stored thumbnail already shows the target version. */
export function thumbnailIsCurrent(page: ThumbPage, target: ThumbnailTarget): boolean {
  const t = page.thumbnail;
  return !!t && t.variant === target.variant && t.sourceVersion >= target.sourceVersion;
}

/**
 * Should a capture be queued now? Null when not; the target when yes.
 * Applies the throttles so a library visit never re-queues work that is
 * already pending, just failed, or (for drafts) ran within the last hour.
 */
export function thumbnailToQueue(page: ThumbPage, now: number): ThumbnailTarget | null {
  const target = thumbnailTarget(page);
  if (!target || thumbnailIsCurrent(page, target)) return null;
  const req = page.thumbnailRequest;
  if (req && req.variant === target.variant && req.sourceVersion >= target.sourceVersion && now - req.at < RETRY_AFTER_MS) return null;
  if (target.variant === "draft" && page.thumbnail?.variant === "draft" && now - page.thumbnail.capturedAt < DRAFT_MIN_INTERVAL_MS) return null;
  return target;
}
