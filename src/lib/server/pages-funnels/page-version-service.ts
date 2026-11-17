import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Data as PuckData } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import { decodeStoredPuckData, readStoredPuckData } from "@/lib/pages-funnels/puck-storage";
import { normalizePopupMap, type PopupDefinitionMap } from "@/types/pages-funnels-popup";
import {
  PAGE_VERSION_LIMIT,
  isPageVersionReason,
  isValidVersionId,
  type PageVersionList,
  type PageVersionMeta,
} from "@/lib/pages-funnels/page-versions";
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
import { draftConflict, preparePageWrite, type PuckPersistenceResult } from "@/lib/server/pages-funnels-puck-service";

/**
 * Page Version History V1 (2026-11-17) — list, read one version (for the
 * read-only preview) and restore. Every function re-checks that the page
 * belongs to the caller's workspace (the route already checked the caller is
 * that workspace's admin or its agency owner) and that the version belongs to
 * that page — a version id from another page or workspace reads as not found.
 */

type Failure = Exclude<PuckPersistenceResult, { ok: true }>;
const notFound = (what = "Page"): Failure => ({ ok: false, error: `${what} not found`, status: 404 });

async function ownedPage(subAccountId: string, pageId: string) {
  const ref = getAdminDb().collection("pages").doc(pageId);
  const snap = await ref.get();
  const doc = snap.data() as Record<string, unknown> | undefined;
  if (!doc || doc.subAccountId !== subAccountId) return null;
  return { ref, doc };
}

export async function listPageVersions(subAccountId: string, pageId: string): Promise<({ ok: true } & PageVersionList) | Failure> {
  const page = await ownedPage(subAccountId, pageId);
  if (!page) return notFound();
  // Metadata only — the designs themselves are never sent for the list.
  const snap = await versionsCol(page.ref)
    .select("reason", "createdAtMs", "createdByName", "sizeBytes", "fingerprint", "restoredFromAtMs")
    .orderBy("createdAtMs", "desc")
    .limit(PAGE_VERSION_LIMIT * 2)
    .get();
  const publishedFp = page.doc.status === "published" ? publishedFingerprintOf(page.doc) : null;
  const draftFp = snapshotOfStored(page.doc.puckDraftData, page.doc.puckDraftPopups)?.fingerprint ?? null;
  const versions: PageVersionMeta[] = [];
  let liveVersionId: string | null = null;
  let liveIsPublishEntry = false;
  let draftVersionId: string | null = null;
  for (const d of snap.docs) {
    const reason = d.get("reason");
    if (!isPageVersionReason(reason)) continue;
    const fp = d.get("fingerprint") as string | undefined;
    // "Current live" marks the newest Published entry holding the live design,
    // else the newest entry of any kind holding it.
    if (publishedFp && fp === publishedFp) {
      const isPublishEntry = reason === "publish" || reason === "previous_live";
      if (!liveVersionId || (isPublishEntry && !liveIsPublishEntry)) {
        liveVersionId = d.id;
        liveIsPublishEntry = isPublishEntry;
      }
    }
    if (!draftVersionId && draftFp && fp === draftFp) draftVersionId = d.id;
    versions.push({
      id: d.id,
      reason,
      createdAtMs: (d.get("createdAtMs") as number | undefined) ?? null,
      createdByName: (d.get("createdByName") as string | null | undefined) ?? null,
      sizeBytes: (d.get("sizeBytes") as number | undefined) ?? 0,
      restoredFromAtMs: (d.get("restoredFromAtMs") as number | null | undefined) ?? null,
    });
  }
  return { ok: true, versions, liveVersionId, draftVersionId, draftRevision: draftRevisionOf(page.doc), limit: PAGE_VERSION_LIMIT };
}

/** One version's design, for the read-only preview. */
export async function getPageVersion(
  subAccountId: string,
  pageId: string,
  versionId: unknown
): Promise<{ ok: true; data: PuckData; popups: PopupDefinitionMap; meta: PageVersionMeta } | Failure> {
  if (!isValidVersionId(versionId)) return { ok: false, error: "Version not found", status: 404 };
  const page = await ownedPage(subAccountId, pageId);
  if (!page) return notFound();
  const snap = await versionsCol(page.ref).doc(versionId).get();
  const v = snap.data();
  if (!v || v.pageId !== pageId || v.subAccountId !== subAccountId || !isPageVersionReason(v.reason)) return notFound("Version");
  const decoded = decodeStoredPuckData(v.data);
  if (!decoded.ok) return { ok: false, error: "This version can't be read.", status: 409 };
  return {
    ok: true,
    data: decoded.data,
    popups: normalizePopupMap(v.popups),
    meta: {
      id: snap.id,
      reason: v.reason,
      createdAtMs: (v.createdAtMs as number | undefined) ?? null,
      createdByName: (v.createdByName as string | null | undefined) ?? null,
      sizeBytes: (v.sizeBytes as number | undefined) ?? 0,
      restoredFromAtMs: (v.restoredFromAtMs as number | null | undefined) ?? null,
    },
  };
}

/**
 * Restoring brings back the version's DESIGN (page tree + Popups) but keeps
 * the page's CURRENT Page Settings — SEO title / description, social image,
 * noindex and tracking ids live in `root.props.pageSettings`, and an old
 * version must never silently bring back obsolete SEO or tracking. When the
 * current draft has no stored settings (older pages fall back to `page.seo`),
 * the restored tree carries none either, so the same fallback keeps applying.
 */
export function withCurrentPageSettings(restored: PuckData, current: PuckData | null): PuckData {
  const root = (restored.root ?? {}) as { props?: Record<string, unknown> } & Record<string, unknown>;
  const props: Record<string, unknown> = { ...(root.props ?? {}) };
  const currentSettings = (current?.root as { props?: Record<string, unknown> } | undefined)?.props?.pageSettings;
  if (currentSettings !== undefined) props.pageSettings = currentSettings;
  else delete props.pageSettings;
  return { ...restored, root: { ...root, props } } as PuckData;
}

/**
 * Restore a version as the page's DRAFT (never publishes — the live page,
 * `puckPublishedData`, status and publish timestamps are not touched). In ONE
 * transaction: confirm the draft hasn't moved since the editor last saw it
 * (`baseRevision`), confirm the version belongs to this page, validate the
 * design with the same checks as Save Draft, keep the current draft as a
 * "Before restore" version (the restore fails rather than lose it), write the
 * design, and record a "Restored version" entry. Page identity and
 * operational data are never copied from the version: name, slug, type, goal,
 * funnel, Reading Result settings, analytics and Page Settings stay as they
 * are now. Connected blocks (Checkout, Forms, Booking, Offers, videos) keep
 * their saved configuration and are resolved by the same server checks as
 * any draft — a restore can't make a payment, bypass the funnel checkout
 * context, or reach another workspace's records.
 */
export async function restorePageVersion(
  subAccountId: string,
  pageId: string,
  versionId: unknown,
  options: { baseRevision?: number | null; actor: VersionActor }
): Promise<PuckPersistenceResult> {
  if (!isValidVersionId(versionId)) return { ok: false, error: "Version not found", status: 404 };
  const page = await ownedPage(subAccountId, pageId);
  if (!page) return notFound();
  const created: string[] = [];
  const result = await getAdminDb().runTransaction(async (tx): Promise<PuckPersistenceResult & { publishedFp?: string | null }> => {
    created.length = 0;
    const pageSnap = await tx.get(page.ref);
    const doc = pageSnap.data() as Record<string, unknown> | undefined;
    if (!doc || doc.subAccountId !== subAccountId) return notFound();
    if (typeof options.baseRevision === "number" && options.baseRevision !== draftRevisionOf(doc)) return draftConflict();
    const versionSnap = await tx.get(versionsCol(page.ref).doc(versionId));
    const v = versionSnap.data();
    if (!v || v.pageId !== pageId || v.subAccountId !== subAccountId) {
      return { ok: false, error: "That version is no longer available. Reopen Version History and try again.", status: 404 };
    }
    const decoded = decodeStoredPuckData(v.data);
    if (!decoded.ok) return { ok: false, error: "This version can't be read, so it can't be restored.", status: 409 };
    const restoredData = withCurrentPageSettings(decoded.data, readStoredPuckData(doc.puckDraftData));
    const prepared = preparePageWrite(restoredData, normalizePopupMap(v.popups), doc, ["puckDraftData", "puckDraftPopups"]);
    if ("ok" in prepared) return prepared;

    const restored = snapshotOfPrepared(prepared.page, prepared.stored);
    const current = snapshotOfStored(doc.puckDraftData, doc.puckDraftPopups);
    if (current && current.fingerprint === restored.fingerprint) {
      // The draft already is this design — nothing to change.
      return { ok: true, revision: draftRevisionOf(doc) };
    }
    const marker = historyMarkerOf(doc);
    let nextMarker: PageHistoryMarker = marker;
    const nowMs = Date.now();
    if (current && current.fingerprint !== marker.latestFingerprint) {
      const id = writeVersion(tx, page.ref, doc, current, "before_restore", options.actor);
      if (!id) return { ok: false, error: "The current draft is too large to keep in Version History, so it wasn't replaced.", status: 413 };
      created.push(id);
    }
    const restoredId = writeVersion(tx, page.ref, doc, restored, "restored", options.actor, {
      restoredFromVersionId: versionId,
      restoredFromAtMs: (v.createdAtMs as number | undefined) ?? null,
    });
    if (restoredId) {
      created.push(restoredId);
      nextMarker = { latestFingerprint: restored.fingerprint, latestAtMs: nowMs };
    }
    const revision = draftRevisionOf(doc) + 1;
    const now = FieldValue.serverTimestamp();
    tx.update(page.ref, {
      puckDraftData: prepared.page,
      puckDraftPopups: prepared.stored,
      puckDraftUpdatedAt: now,
      puckDraftRevision: revision,
      ...(nextMarker !== marker ? { puckHistory: nextMarker } : {}),
      updatedAt: now,
    });
    return { ok: true, revision, publishedFp: publishedFingerprintOf(doc) };
  });
  if (result.ok && created.length) {
    await pruneVersions(page.ref, result.publishedFp ?? null, [...created, versionId]).catch((err) =>
      console.error(`[page-versions] prune failed for ${pageId}`, err)
    );
  }
  return result.ok ? { ok: true, revision: result.revision } : result;
}
