import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Data as PuckData } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";

/**
 * Admin-SDK persistence for the NEW Puck builder's draft/publish content
 * (Puck Persistence + Publish Foundation task, master spec §24.12).
 *
 * Deliberately NOT modeled on V1's own `src/lib/firestore/pages-funnels.ts`
 * (client SDK, direct `updateDoc` from React components, gated only by
 * Firestore rules) — this repo's dominant, more-recent pattern for
 * sensitive per-tenant writes is an Admin-SDK service called from an
 * authenticated API route (see e.g. `custom-fields`'s POST handler), which
 * this follows: the caller's sub-account admin membership is verified by
 * the API route (`requireSubAccountAdmin`) BEFORE either function here
 * runs, and both additionally re-verify the target page actually belongs
 * to that sub-account — the route-level check alone only proves the caller
 * administers *a* sub-account, not that this specific `pageId` is theirs.
 *
 * Every write here is a single targeted `.update()` call — never a
 * full-document `.set()` — matching the repo-wide targeted-update
 * convention (`ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() })`,
 * confirmed repo-wide in `agents-watchdog-service.ts`/`chart-design-service.ts`/etc.).
 * `blocks` (V1's own page content) is NEVER touched by either function —
 * `savePuckDraft` only ever writes `puckDraftData`/`puckDraftUpdatedAt`.
 * `publishPuckPage` additionally sets the top-level `status`/`publishedAt`
 * V1 also uses — see that function's own doc comment for exactly why that
 * one specific overlap is deliberate, not an accidental V1 side-effect.
 */

const PAGES_COLLECTION = "pages";

export type PuckPersistenceResult =
  | { ok: true }
  | { ok: false; error: string; status: 404 | 403 };

async function loadOwnedPage(
  subAccountId: string,
  pageId: string
): Promise<
  { ref: FirebaseFirestore.DocumentReference } | PuckPersistenceResult
> {
  const db = getAdminDb();
  const ref = db.collection(PAGES_COLLECTION).doc(pageId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: "Page not found", status: 404 };
  }
  const page = snap.data() as Omit<PageDoc, "id">;
  if (page.subAccountId !== subAccountId) {
    // Deliberately the same "Page not found" message as the missing-doc
    // case above, not "Forbidden" — this is a cross-tenant pageId guess,
    // and confirming the id merely belongs to someone else is itself a
    // (small) information leak.
    return { ok: false, error: "Page not found", status: 404 };
  }
  return { ref };
}

/**
 * Save Draft / autosave — both call this exact same function (one save
 * code path, per the task's explicit instruction not to duplicate save
 * logic between the manual button and the debounced autosave).
 */
export async function savePuckDraft(
  subAccountId: string,
  pageId: string,
  data: PuckData
): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;

  const now = FieldValue.serverTimestamp();
  await owned.ref.update({
    puckDraftData: data,
    puckDraftUpdatedAt: now,
    updatedAt: now,
  });
  return { ok: true };
}

/**
 * Publish — writes `puckDraftData` AND `puckPublishedData` (plus both their
 * timestamps) in ONE `.update()` call, using the exact same `data` payload
 * for both fields. This is deliberate, not a shortcut: it's what makes
 * "Publish must ensure the current draft is durably saved first" atomic
 * rather than two sequential writes that could race with a concurrent edit
 * landing between them (the exact non-atomicity V1's own publish handler
 * has — `updatePageBlocks()` then `publishPage()` as two separate
 * `updateDoc` calls — deliberately not repeated here). A single Firestore
 * document `.update()` is atomic at the document level, so this genuinely
 * cannot leave `puckPublishedData` pointing at anything other than exactly
 * what `puckDraftData` was set to in the same call.
 *
 * Also sets the SAME top-level `status`/`publishedAt` fields V1's own
 * `publishPage()` sets — deliberately, not a V1 side-effect leaking in:
 * `/p/[pageId]`'s existing gate (`if (page.status !== "published")
 * notFound()`) is the one thing this task was told to reuse rather than
 * duplicate (§10 "use the actual production public `<Render>` path"), so
 * "is this page live at all" stays a single page-level concept V1 and Puck
 * share, while `puckPublishedData` separately controls WHAT renders once
 * it's live. A page Publish-ed for the first time from the new builder,
 * that never went through V1's own Publish, would otherwise 404 at
 * `/p/[pageId]` despite the user having just clicked Publish.
 */
export async function publishPuckPage(
  subAccountId: string,
  pageId: string,
  data: PuckData
): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;

  const now = FieldValue.serverTimestamp();
  await owned.ref.update({
    puckDraftData: data,
    puckDraftUpdatedAt: now,
    puckPublishedData: data,
    puckPublishedAt: now,
    status: "published",
    publishedAt: now,
    updatedAt: now,
  });
  return { ok: true };
}
