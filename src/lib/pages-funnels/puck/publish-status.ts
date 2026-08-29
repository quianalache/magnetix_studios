import type { Timestamp, FieldValue } from "firebase/firestore";
import type { PageDoc } from "@/types/pages-funnels";

/**
 * Derives the new builder's Puck-specific publish status from a `PageDoc`
 * (Puck Persistence + Publish Foundation task, master spec §24.12 "Page
 * Status" requirement — "do not invent fake status if current metadata
 * cannot support it").
 *
 * Deliberately three states, not two, and deliberately NOT the same thing
 * as V1's own `page.status` ("draft"|"published") field:
 *
 * - `"v1-only"`: this page has never been Published from the new builder
 *   (`puckPublishedData` doesn't exist yet). Whatever V1's own `status`
 *   says IS what's actually live at `/p/[pageId]` right now — showing a
 *   Puck-flavored "Draft"/"Published" badge here would be actively
 *   misleading for a page V1 already published. The caller should fall
 *   back to rendering V1's existing status badge unchanged for this case.
 * - `"published"`: this page HAS been Published from the new builder, and
 *   the draft hasn't changed since (or is not newer than) that publish.
 * - `"published-outdated"`: published from the new builder at some point,
 *   but the draft has been edited/saved since — the public page is still
 *   showing the OLDER published snapshot, not these newer changes.
 */
export type PuckPublishStatus = "v1-only" | "published" | "published-outdated";

function toMillis(
  value: Timestamp | FieldValue | null | undefined
): number | null {
  if (!value) return null;
  // A real Firestore Timestamp (read back from a committed/synced snapshot)
  // has `.toMillis()`; a raw `FieldValue` sentinel (e.g. an unresolved
  // `serverTimestamp()`) does not — treat anything without it as "unknown
  // yet" rather than throwing.
  if (typeof (value as Timestamp).toMillis === "function") {
    return (value as Timestamp).toMillis();
  }
  return null;
}

export function derivePuckPublishStatus(
  page: Pick<
    PageDoc,
    "puckPublishedData" | "puckPublishedAt" | "puckDraftUpdatedAt"
  >
): PuckPublishStatus {
  if (!page.puckPublishedData) return "v1-only";

  const publishedMs = toMillis(page.puckPublishedAt);
  const draftMs = toMillis(page.puckDraftUpdatedAt);

  if (publishedMs != null && draftMs != null && draftMs > publishedMs) {
    return "published-outdated";
  }
  return "published";
}
