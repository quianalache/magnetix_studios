import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Data as PuckData } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PageDoc } from "@/types/pages-funnels";
import { PUCK_CONTENT_MAX_DEPTH, encodePuckData, isPuckData, type EncodedPuckData } from "@/lib/pages-funnels/puck-storage";
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
  | { ok: false; error: string; status: 400 | 404 | 403 | 409 | 413 };

const tooLarge = (error: string): PuckPersistenceResult => ({ ok: false, error, status: 413 });

/**
 * Every check a draft save or publish runs before writing (storage contract
 * of 2026-11-03 — page AND Popup Puck trees are stored as `puck-json-v1`
 * JSON strings, see lib/pages-funnels/puck-storage.ts). Returns exactly what
 * to write, or the clear error to return instead of letting Firestore fail
 * generically.
 */
function preparePageWrite(
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
  popups: PopupDefinitionMap = {}
): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  const prepared = preparePageWrite(data, popups, owned.doc, ["puckDraftData", "puckDraftPopups"]);
  if ("ok" in prepared) return prepared;

  const now = FieldValue.serverTimestamp();
  await owned.ref.update({
    puckDraftData: prepared.page,
    puckDraftPopups: prepared.stored,
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
 * landing between them (the exact non-atomicity of the former legacy publish
 * handler — content write followed by publish as two separate
 * `updateDoc` calls — deliberately not repeated here). A single Firestore
 * document `.update()` is atomic at the document level, so this genuinely
 * cannot leave `puckPublishedData` pointing at anything other than exactly
 * what `puckDraftData` was set to in the same call.
 *
 * Also sets the SAME top-level `status`/`publishedAt` fields the former
 * legacy publish flow set — deliberately, not a legacy side-effect leaking in:
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
  data: PuckData,
  popups: PopupDefinitionMap = {}
): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  const prepared = preparePageWrite(data, popups, owned.doc, ["puckDraftData", "puckDraftPopups", "puckPublishedData", "puckPublishedPopups"]);
  if ("ok" in prepared) return prepared;

  const now = FieldValue.serverTimestamp();
  // ONE document update: page draft + page published + both Popup maps land
  // together, so no reader can ever see page version B with Popups version A.
  await owned.ref.update({
    puckDraftData: prepared.page,
    puckDraftPopups: prepared.stored,
    puckDraftUpdatedAt: now,
    puckPublishedData: prepared.page,
    puckPublishedPopups: prepared.stored,
    puckPublishedAt: now,
    status: "published",
    publishedAt: now,
    updatedAt: now,
  });
  return { ok: true };
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

export async function revertPuckDraftToPublished(subAccountId: string, pageId: string): Promise<PuckPersistenceResult> {
  const owned = await loadOwnedPage(subAccountId, pageId);
  if ("ok" in owned) return owned;
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(owned.ref);
    const doc = snap.data() as Record<string, unknown> | undefined;
    if (!doc || doc.subAccountId !== subAccountId) return { ok: false, error: "Page not found", status: 404 } as const;
    if (doc.puckPublishedData == null) {
      return { ok: false, error: "This page has never been published, so there's nothing to revert to.", status: 409 } as const;
    }
    const unknown = findUnknownBlockTypesInPage(doc);
    if (unknown.length) return { ok: false, error: unknownBlocksSaveError(unknown), status: 409 } as const;
    tx.update(owned.ref, {
      puckDraftData: doc.puckPublishedData,
      puckDraftPopups: doc.puckPublishedPopups ?? {},
      // The draft now equals the published copy: same timestamp, so the
      // builder shows "Published" (not "Unpublished changes").
      puckDraftUpdatedAt: doc.puckPublishedAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true } as const;
  });
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
