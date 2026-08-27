/**
 * Phase 2D task §11 — unsaved in-memory Preview handoff. Puck Data isn't
 * persisted anywhere yet (master spec Build Status: "Puck Data is still not
 * persisted"), so Preview can't just navigate to a route that re-reads a
 * saved `PageDoc` — it has to carry the CURRENT in-memory editor `Data`
 * across to a new browser tab, without writing it into Firestore (task's
 * explicit prohibition: "do not write experimental Puck Data into the live
 * PageDoc just to make Preview work") and without exposing any server
 * state.
 *
 * `sessionStorage` is the mechanism: per the HTML Standard's session-storage
 * section, an auxiliary top-level browsing context opened via
 * `window.open()` from the same script/tab is placed in the same "unit of
 * related similar-origin browsing contexts" as its opener (unless opened
 * with `noopener`, which this codebase's `editor-shell.tsx` deliberately
 * does NOT pass — see that file's own comment), and same-origin browsing
 * contexts in that unit share one `sessionStorage` area per origin. That
 * makes it a real, standard, no-new-dependency way to hand a client-only
 * value to a tab the editor itself opens — scoped to just this browser
 * session (never written anywhere durable, never visible to another user
 * or device, cleared automatically once every tab in the session closes).
 *
 * Keyed per-page (not one global key) so previewing two different pages
 * from two editor tabs in the same browser session can't clobber each
 * other's preview data.
 */
export function previewStorageKey(pageId: string): string {
  return `puck-preview:${pageId}`;
}
