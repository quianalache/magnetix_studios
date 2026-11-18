import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Data as PuckData } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_PAGE_SEO, PAGE_GOAL_LABELS, PAGE_TYPE_LABELS, type PageDoc, type PageGoal, type PageType } from "@/types/pages-funnels";
import { buildReadingResultStarterData } from "@/lib/pages-funnels/puck/reading-result-template";
import { DEFAULT_READING_RESULT_PAGE_SETTINGS, READING_SAMPLE_KINDS, type ReadingResultPageSettings, type ReadingSampleKind } from "@/types/reading-blocks";
import { pageNameProblem } from "@/lib/pages-funnels/page-settings";
import { getChartDesignSet } from "@/lib/server/chart-design-set-service";
import { PUCK_CONTENT_MAX_DEPTH, decodeStoredPuckData, encodePuckData, isPuckData, type EncodedPuckData } from "@/lib/pages-funnels/puck-storage";
import { countCheckoutBlocks, remapCheckoutConfigIds } from "@/lib/pages-funnels/checkout-block";
import { findCustomHtmlLimitProblem } from "@/lib/pages-funnels/custom-html/policy";
import {
  encodePopupMapForStorage,
  normalizePopupMap,
  parsePopupTrigger,
  type PopupDefinitionMap,
  type StoredPopupMap,
} from "@/types/pages-funnels-popup";
import {
  FIRESTORE_MAX_FIELD_DEPTH,
  PAGE_DOC_SIZE_LIMIT_BYTES,
  POPUP_CONTENT_MAX_DEPTH,
  POPUP_PAYLOAD_LIMIT_BYTES,
  fieldDepth,
  firestoreStorageSize,
} from "@/lib/pages-funnels/popup-content";
import { findNavigationProblem } from "@/lib/pages-funnels/navigation";
import { findBookingProblem } from "@/lib/pages-funnels/booking-block";
import { findPricingProblem } from "@/lib/pages-funnels/pricing";
import { findPageSettingsProblem } from "@/lib/pages-funnels/page-settings";
import { findBackgroundProblem } from "@/lib/pages-funnels/puck/background";
import { findColumnOrderProblem } from "@/lib/pages-funnels/puck/column-order";
import { findWave3BlockProblem } from "@/lib/pages-funnels/puck/wave3-validation";
import { findUnknownBlockTypes, findUnknownBlockTypesInPage, unknownBlocksSaveError } from "@/lib/pages-funnels/puck/known-blocks";
import { AUTO_CHECKPOINT_INTERVAL_MS } from "@/lib/pages-funnels/page-versions";
import {
  draftRevisionOf,
  historyMarkerOf,
  publishedFingerprintOf,
  pruneVersions,
  snapshotOfPrepared,
  snapshotOfStored,
  versionsCol,
  writeVersion,
  type PageHistoryMarker,
  type VersionActor,
} from "@/lib/server/pages-funnels/page-version-core";

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
  | { ok: true; revision?: number }
  | { ok: false; error: string; status: 400 | 404 | 403 | 409 | 413; code?: "conflict" };

/**
 * Draft revision (Page Version History, 2026-11-17): every server write that
 * replaces the draft (save, publish, revert, restore) increments
 * `puckDraftRevision` inside its transaction. A caller that sends the revision
 * it last saw (`baseRevision`) is refused with a conflict when the draft has
 * moved on since — e.g. another tab saved, or a version was restored — instead
 * of silently overwriting that newer draft. Callers that send no revision
 * (an editor tab opened before this release) keep the old behavior.
 */
export const DRAFT_CONFLICT_MESSAGE =
  "This page was changed somewhere else (another tab, another person, or a restored version). Reload to get the latest draft — your unsaved edits here weren't saved.";
export function draftConflict(): PuckPersistenceResult {
  return { ok: false, error: DRAFT_CONFLICT_MESSAGE, status: 409, code: "conflict" };
}

export interface DraftWriteOptions {
  /** "manual" = Save Draft button (a history checkpoint); "auto" = debounced autosave. */
  kind?: "manual" | "auto";
  baseRevision?: number | null;
  actor?: VersionActor | null;
}

const isStale = (baseRevision: number | null | undefined, doc: Record<string, unknown>) =>
  typeof baseRevision === "number" && baseRevision !== draftRevisionOf(doc);

const tooLarge = (error: string): PuckPersistenceResult => ({ ok: false, error, status: 413 });

/**
 * Every check a draft save or publish runs before writing (storage contract
 * of 2026-11-03 — page AND Popup Puck trees are stored as `puck-json-v1`
 * JSON strings, see lib/pages-funnels/puck-storage.ts). Returns exactly what
 * to write, or the clear error to return instead of letting Firestore fail
 * generically.
 */
export function preparePageWrite(
  data: PuckData,
  popups: unknown,
  currentDoc: Record<string, unknown>,
  replacedFields: readonly string[]
): { page: EncodedPuckData; stored: StoredPopupMap } | PuckPersistenceResult {
  if (!isPuckData(data)) return { ok: false, error: "The page content couldn't be read. Reload the page and try again.", status: 400 };
  // Unknown-block safety guard: this build must never write over content it
  // can't represent — not over a STORED page holding block types it doesn't
  // know (a newer build saved them; writing would strip or mangle them), and
  // not from an incoming tree carrying such types. Nothing is written.
  const storedUnknown = findUnknownBlockTypesInPage(currentDoc);
  if (storedUnknown.length) return { ok: false, error: unknownBlocksSaveError(storedUnknown), status: 409 };
  const incomingUnknown = findUnknownBlockTypes(data, popups);
  if (incomingUnknown.length) return { ok: false, error: unknownBlocksSaveError(incomingUnknown), status: 400 };
  // Application sanity cap (NOT a Firestore limit — the tree is stored as a string).
  if (fieldDepth(data) > PUCK_CONTENT_MAX_DEPTH) {
    return tooLarge("This page has blocks nested too deeply to save. Move a block out of its nested container and try again.");
  }
  const htmlProblem = findCustomHtmlLimitProblem(data);
  if (htmlProblem) return tooLarge(htmlProblem);
  // Navigation blocks are checked strictly here (renders read leniently), so a
  // malformed menu is a clear error instead of a silently changed one.
  const navigationProblem = findNavigationProblem(data);
  if (navigationProblem) return { ok: false, error: navigationProblem, status: 400 };
  const bookingProblem = findBookingProblem(data);
  if (bookingProblem) return { ok: false, error: bookingProblem, status: 400 };
  const pricingProblem = findPricingProblem(data);
  if (pricingProblem) return { ok: false, error: pricingProblem, status: 400 };
  const settingsProblem = findPageSettingsProblem(data as never);
  if (settingsProblem) return { ok: false, error: settingsProblem, status: 400 };
  const backgroundIssue = findBackgroundProblem(data) ?? findBackgroundProblem(popups);
  if (backgroundIssue) return { ok: false, error: backgroundIssue, status: 400 };
  const columnOrderIssue = findColumnOrderProblem(data) ?? findColumnOrderProblem(popups);
  if (columnOrderIssue) return { ok: false, error: columnOrderIssue, status: 400 };
  const blockIssue = findWave3BlockProblem(data) ?? findWave3BlockProblem(popups);
  if (blockIssue) return { ok: false, error: blockIssue, status: 400 };

  // Malformed Popups are refused, never silently dropped (dropping would delete them on save).
  const incoming = popups && typeof popups === "object" && !Array.isArray(popups) ? Object.keys(popups) : [];
  const normalized = normalizePopupMap(popups);
  if (incoming.length !== Object.keys(normalized).length) {
    return { ok: false, error: "A popup couldn't be read. Reload the page and try again.", status: 400 };
  }
  // Triggers are checked strictly here (reads normalize leniently to Manual),
  // so a bad delay is a clear error instead of a silent change of behavior.
  for (const id of incoming) {
    const raw = (popups as Record<string, { trigger?: unknown }>)[id];
    const trigger = parsePopupTrigger(raw?.trigger);
    if (!trigger.ok) return { ok: false, error: `The popup “${normalized[id].name}”: ${trigger.error}`, status: 400 };
  }
  for (const popup of Object.values(normalized)) {
    if (fieldDepth(popup.content) > POPUP_CONTENT_MAX_DEPTH) {
      return tooLarge(`The popup “${popup.name}” has blocks nested too deeply to save.`);
    }
  }
  // An Open Popup action whose Popup was deleted keeps its target id (Slice 5):
  // the editor shows it as missing and the runtime treats it as inert, so a
  // stale reference is never a save error and is never rewritten silently.

  const stored = encodePopupMapForStorage(normalized);
  if (firestoreStorageSize(stored) > POPUP_PAYLOAD_LIMIT_BYTES) {
    return tooLarge("This page's popups are too large to save. Remove a popup or some of its content.");
  }
  const page = encodePuckData(data);
  // Firestore's 20-level map/array limit applies to what is WRITTEN: the page
  // envelope (1 level) and the stored Popup map (3). Checked, never assumed.
  if (fieldDepth(page) > FIRESTORE_MAX_FIELD_DEPTH || fieldDepth(stored) > FIRESTORE_MAX_FIELD_DEPTH) {
    return tooLarge("This page can't be saved in its current shape. Reload the page and try again.");
  }
  // The whole document (page draft + published + both Popup maps) must stay under Firestore's 1 MiB.
  const next: Record<string, unknown> = { ...currentDoc };
  for (const field of replacedFields) next[field] = field.endsWith("Popups") ? stored : page;
  // Measured the way Firestore counts it (field names + values), not as JSON text.
  if (firestoreStorageSize(next) > PAGE_DOC_SIZE_LIMIT_BYTES) {
    return tooLarge("This page and its popups are too large to save. Remove some content and try again.");
  }
  return { page, stored };
}

async function loadOwnedPage(
  subAccountId: string,
  pageId: string
): Promise<
  { ref: FirebaseFirestore.DocumentReference; doc: Record<string, unknown> } | PuckPersistenceResult
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
  return { ref, doc: page as Record<string, unknown> };
}

/**
 * Save Draft / autosave — both call this exact same function (one save
 * code path, per the task's explicit instruction not to duplicate save
 * logic between the manual button and the debounced autosave).
 */
export async function savePuckDraft(
  subAccountId: string,
  pageId: string,
  data: PuckData,
  popups: PopupDefinitionMap = {},
  options: DraftWriteOptions = {}
): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  const actor = options.actor ?? { uid: "system", name: null };
  const created: string[] = [];
  const result = await getAdminDb().runTransaction(async (tx): Promise<PuckPersistenceResult & { publishedFp?: string | null }> => {
    created.length = 0;
    const snap = await tx.get(owned.ref);
    const doc = snap.data() as Record<string, unknown> | undefined;
    if (!doc || doc.subAccountId !== subAccountId) return { ok: false, error: "Page not found", status: 404 };
    if (isStale(options.baseRevision, doc)) return draftConflict();
    const prepared = preparePageWrite(data, popups, doc, ["puckDraftData", "puckDraftPopups"]);
    if ("ok" in prepared) return prepared;

    // Version History checkpoints (see lib/pages-funnels/page-versions.ts):
    //   - Save Draft (manual): the design being saved, unless it's identical
    //     to the newest version.
    //   - Autosave: when no version was taken in the last 30 minutes, the draft
    //     as it stood BEFORE this save — so the first edits of a session (and
    //     then roughly every 30 minutes of active editing) leave a restore
    //     point. Autosave only runs when something changed, so an idle editor
    //     never creates versions.
    const marker = historyMarkerOf(doc);
    let nextMarker: PageHistoryMarker = marker;
    const nowMs = Date.now();
    if (options.kind === "manual") {
      const next = snapshotOfPrepared(prepared.page, prepared.stored);
      if (next.fingerprint !== marker.latestFingerprint) {
        const id = writeVersion(tx, owned.ref, doc, next, "manual", actor);
        if (id) {
          created.push(id);
          nextMarker = { latestFingerprint: next.fingerprint, latestAtMs: nowMs };
        }
      }
    } else if (marker.latestAtMs == null || nowMs - marker.latestAtMs >= AUTO_CHECKPOINT_INTERVAL_MS) {
      const before = snapshotOfStored(doc.puckDraftData, doc.puckDraftPopups);
      if (before && before.fingerprint !== marker.latestFingerprint) {
        const id = writeVersion(tx, owned.ref, doc, before, "auto", actor);
        if (id) {
          created.push(id);
          nextMarker = { latestFingerprint: before.fingerprint, latestAtMs: nowMs };
        }
      }
    }

    const revision = draftRevisionOf(doc) + 1;
    const now = FieldValue.serverTimestamp();
    tx.update(owned.ref, {
      puckDraftData: prepared.page,
      puckDraftPopups: prepared.stored,
      puckDraftUpdatedAt: now,
      puckDraftRevision: revision,
      ...(nextMarker !== marker ? { puckHistory: nextMarker } : {}),
      updatedAt: now,
    });
    return { ok: true, revision, publishedFp: created.length ? publishedFingerprintOf(doc) : null };
  });
  if (result.ok && created.length) await pruneVersions(owned.ref, result.publishedFp ?? null, created).catch((err) => console.error(`[page-versions] prune failed for ${pageId}`, err));
  return result.ok ? { ok: true, revision: result.revision } : result;
}

/**
 * Publish — writes `puckDraftData` AND `puckPublishedData` (plus both their
 * timestamps) in ONE atomic write, using the exact same `data` payload for
 * both fields — "Publish must ensure the current draft is durably saved
 * first" without two sequential writes that could race with a concurrent
 * edit (the non-atomicity of the former legacy publish handler, deliberately
 * not repeated here). Since 2026-11-17 it runs as a transaction so the draft
 * revision check and the Version History checkpoints land in the same commit.
 *
 * Also sets the SAME top-level `status`/`publishedAt` fields the former
 * legacy publish flow set — deliberately: `/p/[pageId]`'s gate (`if
 * (page.status !== "published") notFound()`) keeps "is this page live at
 * all" a single page-level concept, while `puckPublishedData` separately
 * controls WHAT renders once it's live. A page Publish-ed for the first time
 * from the new builder would otherwise 404 at `/p/[pageId]`.
 *
 * Version History: the published design is recorded as a "Published"
 * version — when the newest version already holds exactly this design (e.g.
 * Save Draft just before Publish), that entry is relabeled "Published"
 * instead of storing it twice. The design that was live until now is kept as
 * "Previously live" if history doesn't already hold it (pages published
 * before Version History existed), so a publish never loses the old live page.
 * Nothing is recorded unless the publish itself commits.
 */
export const MULTIPLE_CHECKOUTS_MESSAGE =
  "This page has more than one Checkout block. A page can hold one Checkout block — remove the extra one (buttons can scroll to the checkout or link to it), then publish.";

/** Checkout blocks in a page tree plus its Popups. */
export function pageCheckoutBlockCount(data: unknown, popups: PopupDefinitionMap | null | undefined): number {
  return countCheckoutBlocks(data) + Object.values(popups ?? {}).reduce((n, p) => n + countCheckoutBlocks(p?.content), 0);
}

export async function publishPuckPage(
  subAccountId: string,
  pageId: string,
  data: PuckData,
  popups: PopupDefinitionMap = {},
  options: DraftWriteOptions = {}
): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  const actor = options.actor ?? { uid: "system", name: null };
  const created: string[] = [];
  const result = await getAdminDb().runTransaction(async (tx): Promise<PuckPersistenceResult & { publishedFp?: string }> => {
    created.length = 0;
    const snap = await tx.get(owned.ref);
    const doc = snap.data() as Record<string, unknown> | undefined;
    if (!doc || doc.subAccountId !== subAccountId) return { ok: false, error: "Page not found", status: 404 };
    if (isStale(options.baseRevision, doc)) return draftConflict();
    const prepared = preparePageWrite(data, popups, doc, ["puckDraftData", "puckDraftPopups", "puckPublishedData", "puckPublishedPopups"]);
    if ("ok" in prepared) return prepared;
    // Page-first funnels (owner decision 2026-11-17): ONE Checkout block per
    // page, so a buyer can never pay twice on one page. Drafts may hold more
    // while the creator rearranges; publishing needs exactly one at most.
    if (pageCheckoutBlockCount(data, popups) > 1) return { ok: false, error: MULTIPLE_CHECKOUTS_MESSAGE, status: 400 };
    const history = await tx.get(versionsCol(owned.ref).select("fingerprint", "createdAtMs"));

    const next = snapshotOfPrepared(prepared.page, prepared.stored);
    const nowMs = Date.now();
    const fingerprints = new Set(history.docs.map((d) => d.get("fingerprint") as string));
    const previous = doc.puckPublishedData != null ? snapshotOfStored(doc.puckPublishedData, doc.puckPublishedPopups) : null;
    if (previous && previous.fingerprint !== next.fingerprint && !fingerprints.has(previous.fingerprint)) {
      const id = writeVersion(tx, owned.ref, doc, previous, "previous_live", actor);
      if (id) created.push(id);
    }
    const newest = [...history.docs].sort((a, b) => ((b.get("createdAtMs") as number) ?? 0) - ((a.get("createdAtMs") as number) ?? 0))[0];
    if (newest && newest.get("fingerprint") === next.fingerprint) {
      tx.update(newest.ref, { reason: "publish", createdAt: FieldValue.serverTimestamp(), createdAtMs: nowMs, createdByUid: actor.uid, createdByName: actor.name });
    } else {
      const id = writeVersion(tx, owned.ref, doc, next, "publish", actor);
      if (id) created.push(id);
    }

    const revision = draftRevisionOf(doc) + 1;
    const now = FieldValue.serverTimestamp();
    // ONE document update: page draft + page published + both Popup maps land
    // together, so no reader can ever see page version B with Popups version A.
    tx.update(owned.ref, {
      puckDraftData: prepared.page,
      puckDraftPopups: prepared.stored,
      puckDraftUpdatedAt: now,
      puckDraftRevision: revision,
      puckHistory: { latestFingerprint: next.fingerprint, latestAtMs: nowMs },
      puckPublishedData: prepared.page,
      puckPublishedPopups: prepared.stored,
      puckPublishedAt: now,
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    return { ok: true, revision, publishedFp: next.fingerprint };
  });
  if (result.ok && created.length) await pruneVersions(owned.ref, result.publishedFp ?? null, created).catch((err) => console.error(`[page-versions] prune failed for ${pageId}`, err));
  return result.ok ? { ok: true, revision: result.revision } : result;
}

// ── Page management (Wave 3 Page Settings) ──────────────────────────────────
//
// Page NAME is internal management metadata: it changes immediately and never
// touches content, the page id, or the URL (public URLs are `/p/{id}`).
// Unpublish and Revert act on the existing draft / published pair:
//   - Unpublish flips `status` back to "draft". Both the draft and the
//     published copies (content, popups, publishable Page Settings) are kept;
//     the public route serves only `status === "published"`, so the page
//     404s until it's published again. Publishing again is the ordinary
//     Publish (the current draft becomes the live page).
//   - Revert copies the published content AND published popups back over the
//     draft in one transaction — Page Settings live inside the content tree,
//     so they revert with it. The published copy is untouched.

export async function renamePuckPage(subAccountId: string, pageId: string, name: string): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  await owned.ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

export async function unpublishPuckPage(subAccountId: string, pageId: string): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  if (owned.doc.status !== "published") {
    return { ok: false, error: "This page isn't published.", status: 409 };
  }
  await owned.ref.update({ status: "draft", unpublishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

export async function revertPuckDraftToPublished(
  subAccountId: string,
  pageId: string,
  options: { actor?: VersionActor | null } = {}
): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  const actor = options.actor ?? { uid: "system", name: null };
  const created: string[] = [];
  const result = await getAdminDb().runTransaction(async (tx): Promise<PuckPersistenceResult & { publishedFp?: string | null }> => {
    created.length = 0;
    const snap = await tx.get(owned.ref);
    const doc = snap.data() as Record<string, unknown> | undefined;
    if (!doc || doc.subAccountId !== subAccountId) return { ok: false, error: "Page not found", status: 404 };
    if (doc.puckPublishedData == null) {
      return { ok: false, error: "This page has never been published, so there's nothing to revert to.", status: 409 };
    }
    const unknown = findUnknownBlockTypesInPage(doc);
    if (unknown.length) return { ok: false, error: unknownBlocksSaveError(unknown), status: 409 };
    // Version History: keep the draft being replaced as "Before revert" (unless
    // the newest version already holds it, or it already equals the live page).
    const marker = historyMarkerOf(doc);
    const publishedFp = publishedFingerprintOf(doc);
    const current = snapshotOfStored(doc.puckDraftData, doc.puckDraftPopups);
    let nextMarker: PageHistoryMarker = marker;
    if (current && current.fingerprint !== marker.latestFingerprint && current.fingerprint !== publishedFp) {
      const id = writeVersion(tx, owned.ref, doc, current, "before_revert", actor);
      if (!id) return { ok: false, error: "The current draft is too large to keep in Version History, so it wasn't replaced.", status: 413 };
      created.push(id);
      nextMarker = { latestFingerprint: current.fingerprint, latestAtMs: Date.now() };
    }
    tx.update(owned.ref, {
      puckDraftData: doc.puckPublishedData,
      puckDraftPopups: doc.puckPublishedPopups ?? {},
      // The draft now equals the published copy: same timestamp, so the
      // builder shows "Published" (not "Unpublished changes").
      puckDraftUpdatedAt: doc.puckPublishedAt ?? null,
      puckDraftRevision: draftRevisionOf(doc) + 1,
      ...(nextMarker !== marker ? { puckHistory: nextMarker } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, revision: draftRevisionOf(doc) + 1, publishedFp };
  });
  if (result.ok && created.length) await pruneVersions(owned.ref, result.publishedFp ?? null, created).catch((err) => console.error(`[page-versions] prune failed for ${pageId}`, err));
  return result.ok ? { ok: true, revision: result.revision } : result;
}

/**
 * Duplicate a page (pre-Funnel safety, 2026-11-05) — server-side, so the
 * copy is tenancy-checked and complete. The copy is a NEW, independent page in
 * the SAME workspace built from the source's CURRENT DRAFT experience:
 *   - draft content (Page Settings live inside it, so SEO / social image /
 *     noindex / tracking come along),
 *   - draft Popups with their triggers, content and actions,
 *   - Reading Result settings and the legacy fields the page list shows.
 * It starts as a Draft with NO published snapshot, so it isn't public until
 * someone publishes it. Popup ids are page-local keys (each page stores its
 * own popup map), so they're kept as-is: every Open Popup action in the
 * copied content still points at the copied popup. Nothing shared or
 * historical is copied (publish history, analytics, AI generation telemetry).
 */
export async function duplicatePuckPage(
  subAccountId: string,
  sourcePageId: string,
  uid: string
): Promise<{ ok: true; pageId: string } | Exclude<PuckPersistenceResult, { ok: true }>> {
  const owned = await loadOwnedPage(subAccountId, sourcePageId);
  if ("ok" in owned) return owned as Exclude<PuckPersistenceResult, { ok: true }>;
  const src = owned.doc;
  const unknown = findUnknownBlockTypesInPage(src);
  if (unknown.length) return { ok: false, error: unknownBlocksSaveError(unknown), status: 409 };
  const baseName = typeof src.name === "string" && src.name.trim() ? src.name.trim() : "Untitled page";
  const suffix = " (Copy)";
  const name = baseName.length + suffix.length > 60 ? `${baseName.slice(0, 60 - suffix.length).trimEnd()}${suffix}` : `${baseName}${suffix}`;
  const draft = src.puckDraftData ?? src.puckPublishedData ?? null;
  const popups = src.puckDraftPopups ?? src.puckPublishedPopups ?? {};
  const now = FieldValue.serverTimestamp();
  const ref = getAdminDb().collection(PAGES_COLLECTION).doc();
  await ref.set({
    name,
    slug: typeof src.slug === "string" ? `${src.slug}-copy`.slice(0, 120) : "",
    pageType: src.pageType ?? "generic",
    goal: src.goal ?? "other",
    status: "draft",
    origin: src.origin ?? "blank",
    funnelId: null,
    blocks: Array.isArray(src.blocks) ? src.blocks : [],
    seo: src.seo ?? { title: "", description: "", ogImage: "" },
    templateId: src.templateId ?? null,
    agencyId: src.agencyId ?? null,
    subAccountId,
    createdByUid: uid,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    ...(draft ? { puckDraftData: draft, puckDraftUpdatedAt: now } : {}),
    puckDraftPopups: popups,
    ...(src.readingResult ? { readingResult: src.readingResult } : {}),
  });
  return { ok: true, pageId: ref.id };
}

/**
 * Re-point a page's EXPLICIT Checkout block connections (draft content and
 * draft Popups) — Duplicate Step (2026-11-16 fix): the copied page of a copied
 * Checkout step must use the copy's own new checkout, not the original step's.
 * Only ids in `map` change; automatic blocks and every other id are left as is.
 * Returns how many blocks changed. Never touches the published copy (a page
 * copied by Duplicate Step is a new draft with no published copy).
 */
export async function remapPageCheckoutConfigs(subAccountId: string, pageId: string, map: Record<string, string>): Promise<number> {
  return remapPageCheckoutWith(subAccountId, pageId, (id) => map[id] ?? id);
}

/**
 * Page-first funnels (2026-11-17): make every EXPLICIT Checkout block on a
 * page's draft (content and Popups) automatic, so the page sells through its
 * own funnel step's checkout. Used when a page becomes a funnel's checkout
 * page; never touches the published copy.
 */
export async function clearPageCheckoutConnections(subAccountId: string, pageId: string): Promise<number> {
  return remapPageCheckoutWith(subAccountId, pageId, () => "");
}

/** How many Checkout blocks a page's current draft holds (content + Popups); 0 for a foreign or missing page. */
export async function countPageCheckoutBlocks(subAccountId: string, pageId: string): Promise<number> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return 0;
  const raw = owned.doc.puckDraftData ?? owned.doc.puckPublishedData ?? null;
  const decoded = raw != null ? decodeStoredPuckData(raw as never) : null;
  const popups = normalizePopupMap(owned.doc.puckDraftPopups ?? owned.doc.puckPublishedPopups);
  return countCheckoutBlocks(decoded?.ok ? decoded.data : null) + Object.values(popups).reduce((n, p) => n + countCheckoutBlocks(p.content), 0);
}

async function remapPageCheckoutWith(subAccountId: string, pageId: string, remap: (configId: string) => string): Promise<number> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return 0;
  const decoded = owned.doc.puckDraftData != null ? decodeStoredPuckData(owned.doc.puckDraftData as never) : null;
  const page = decoded?.ok ? remapCheckoutConfigIds(decoded.data, remap) : { data: null, changed: 0 };
  const popups = normalizePopupMap(owned.doc.puckDraftPopups);
  let popupChanges = 0;
  const nextPopups: PopupDefinitionMap = {};
  for (const [id, popup] of Object.entries(popups)) {
    const r = remapCheckoutConfigIds(popup.content, remap);
    popupChanges += r.changed;
    nextPopups[id] = { ...popup, content: r.data };
  }
  if (!page.changed && !popupChanges) return 0;
  const patch: Record<string, unknown> = {};
  if (page.changed && page.data) patch.puckDraftData = encodePuckData(page.data);
  if (popupChanges) patch.puckDraftPopups = encodePopupMapForStorage(nextPopups);
  patch.puckDraftRevision = FieldValue.increment(1);
  await owned.ref.update(patch);
  return page.changed + popupChanges;
}

// ── Security hardening (2026-11-16): page writes that used to go straight from
// the browser to Firestore. The Firestore rules now refuse every client create
// and update of `pages/{id}` (design, publish state and metadata are server-
// owned), so these two operations run here, behind the same workspace-admin
// check as Save Draft / Publish.

function pageSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "page"
  );
}

/**
 * Create Page (Start Blank / a page type) — the same document the browser used
 * to write: a Draft with no published copy; a Reading Result Page starts from
 * its ready-made New Builder layout and default Reading settings. The
 * workspace's agency comes from the sub-account record, never the request.
 */
export async function createPuckPage(input: {
  subAccountId: string;
  uid: string;
  name: unknown;
  pageType: unknown;
  goal: unknown;
}): Promise<{ ok: true; pageId: string } | Exclude<PuckPersistenceResult, { ok: true }>> {
  const nameProblem = pageNameProblem(input.name);
  if (nameProblem) return { ok: false, error: nameProblem, status: 400 };
  if (typeof input.pageType !== "string" || !(input.pageType in PAGE_TYPE_LABELS)) return { ok: false, error: "Choose a page type.", status: 400 };
  if (typeof input.goal !== "string" || !(input.goal in PAGE_GOAL_LABELS)) return { ok: false, error: "Choose a goal.", status: 400 };
  const db = getAdminDb();
  const sub = await db.doc(`subAccounts/${input.subAccountId}`).get();
  if (!sub.exists) return { ok: false, error: "Workspace not found", status: 404 };
  const name = (input.name as string).trim();
  const pageType = input.pageType as PageType;
  const now = FieldValue.serverTimestamp();
  const ref = db.collection(PAGES_COLLECTION).doc();
  await ref.set({
    name,
    slug: pageSlug(name),
    pageType,
    goal: input.goal as PageGoal,
    status: "draft",
    origin: "blank",
    funnelId: null,
    blocks: [],
    seo: { ...DEFAULT_PAGE_SEO, title: name },
    templateId: null,
    agencyId: (sub.get("agencyId") as string | undefined) ?? null,
    subAccountId: input.subAccountId,
    createdByUid: input.uid,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    ...(pageType === "reading_result"
      ? { puckDraftData: encodePuckData(buildReadingResultStarterData()), puckDraftUpdatedAt: now, readingResult: DEFAULT_READING_RESULT_PAGE_SETTINGS }
      : {}),
  });
  return { ok: true, pageId: ref.id };
}

/**
 * Reading Result Page → Reading settings (Chart Design + builder sample).
 * Same behavior as before (applies immediately, outside draft / publish);
 * only the writer moved to the server. The Chart Design must be this
 * workspace's own (or null = inherit).
 */
export async function updateReadingResultPageSettings(subAccountId: string, pageId: string, raw: unknown): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  if (owned.doc.pageType !== "reading_result") return { ok: false, error: "Reading settings are only for Reading Result Pages.", status: 400 };
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sample = r.sample;
  if (typeof sample !== "string" || !READING_SAMPLE_KINDS.includes(sample as ReadingSampleKind)) return { ok: false, error: "Choose a sample chart.", status: 400 };
  const chartDesignSetId = r.chartDesignSetId ?? null;
  if (chartDesignSetId !== null) {
    if (typeof chartDesignSetId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(chartDesignSetId) || !(await getChartDesignSet(subAccountId, chartDesignSetId))) {
      return { ok: false, error: "That Chart Design isn't available in this workspace.", status: 400 };
    }
  }
  const settings: ReadingResultPageSettings = { chartDesignSetId: chartDesignSetId as string | null, sample: sample as ReadingSampleKind };
  await owned.ref.update({ readingResult: settings, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/**
 * Delete a page (Page Version History, 2026-11-17 — was a direct browser
 * delete that left the page's subcollections behind). Removes ONLY data the
 * page owns: its Version History, its analytics rollups / dedupe markers,
 * then the page itself. Funnel steps that used the page are left as they are
 * (the delete dialog already warns about them — same behavior as before),
 * and nothing shared is touched: no funnel, purchase, contact, submission,
 * Media Library file or saved template. A second analytics pass catches a
 * visit recorded while the delete was running.
 */
export async function deletePuckPage(subAccountId: string, pageId: string): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  const db = getAdminDb();
  const owners = ["analyticsDaily", "analyticsUnique"].map((c) => owned.ref.collection(c));
  await db.recursiveDelete(versionsCol(owned.ref));
  for (const col of owners) await db.recursiveDelete(col);
  await owned.ref.delete();
  for (const col of owners) await db.recursiveDelete(col);
  return { ok: true };
}
