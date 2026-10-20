import type { PageDoc } from "@/types/pages-funnels";

/**
 * Which editor owns a page's content (2026-10-20).
 *
 * The legacy (V1) editor at `/pages-funnels/{pageId}` reads and writes only
 * `page.blocks`. The New Builder at `/pages-funnels/{pageId}/new-builder`
 * reads `puckDraftData` and writes only the Puck fields, and once a page has
 * `puckPublishedData` the public page at `/p/{pageId}` renders that snapshot
 * instead of `blocks`.
 *
 * So the moment a page has ANY Puck content, the New Builder is its
 * authoritative editor: the legacy editor would show stale or empty
 * `blocks`, silently drop every Puck-only element (Rows/Columns, Rich Text,
 * Video, Accordion, Public Reading Tool…), and its Save/Publish would write
 * `blocks` that the public page no longer reads. Pages with no Puck content
 * yet keep the legacy editor, which is still the default editor — moving
 * those is a product cutover, not a routing fix.
 */
export function pageUsesNewBuilder(
  page: Pick<PageDoc, "puckDraftData" | "puckPublishedData">
): boolean {
  return !!page.puckDraftData || !!page.puckPublishedData;
}

/** Sub-account-relative path of the editor that owns this page. */
export function pageEditorPath(
  page: Pick<PageDoc, "id" | "puckDraftData" | "puckPublishedData">
): string {
  return pageUsesNewBuilder(page)
    ? `/pages-funnels/${page.id}/new-builder`
    : `/pages-funnels/${page.id}`;
}
