import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { decodeStoredPuckData, encodePuckData, type EncodedPuckData } from "@/lib/pages-funnels/puck-storage";
import { encodePopupMapForStorage, normalizePopupMap, type StoredPopupMap } from "@/types/pages-funnels-popup";
import { firestoreStorageSize } from "@/lib/pages-funnels/popup-content";
import { collectMediaVideoIds } from "@/lib/pages-funnels/puck/media-video";
import { PAGE_VERSION_LIMIT, type PageVersionReason } from "@/lib/pages-funnels/page-versions";

/**
 * Page Version History — low-level helpers shared by the page save / publish /
 * revert service and the version service (kept separate so neither imports the
 * other). See lib/pages-funnels/page-versions.ts for the policy.
 *
 * Fingerprints: SHA-256 of the design (encoded page tree + normalized Popups,
 * serialized with sorted keys so Firestore's map ordering never matters).
 * Timestamps are not part of the design, so re-saving the same design is never
 * a new version.
 */

export const VERSIONS_SUBCOLLECTION = "versions";
/** One version document must stay under Firestore's 1 MiB, with room for metadata. */
export const VERSION_PAYLOAD_LIMIT_BYTES = 950_000;

export const versionsCol = (pageRef: DocumentReference) => pageRef.collection(VERSIONS_SUBCOLLECTION);

export interface DesignSnapshot {
  data: EncodedPuckData;
  popups: StoredPopupMap;
  fingerprint: string;
  sizeBytes: number;
  mediaVideoIds: string[];
}

export interface VersionActor {
  uid: string;
  name: string | null;
}

/** Page-doc marker of the newest version (saves a query on every autosave). */
export interface PageHistoryMarker {
  latestFingerprint: string | null;
  latestAtMs: number | null;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonical(v))).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function designFingerprint(data: EncodedPuckData, popups: StoredPopupMap): string {
  return createHash("sha256").update(canonical({ data, popups })).digest("hex");
}

/** A snapshot of a design that is about to be written (already validated + encoded). */
export function snapshotOfPrepared(page: EncodedPuckData, stored: StoredPopupMap): DesignSnapshot {
  const decoded = decodeStoredPuckData(page);
  const normalized = normalizePopupMap(stored);
  return {
    data: page,
    popups: stored,
    fingerprint: designFingerprint(page, stored),
    sizeBytes: firestoreStorageSize({ data: page, popups: stored }),
    mediaVideoIds: collectMediaVideoIds(decoded.ok ? decoded.data : null, normalized),
  };
}

/** A snapshot of a design as stored on the page doc (draft or published). Null when there is none / it can't be read. */
export function snapshotOfStored(rawPage: unknown, rawPopups: unknown): DesignSnapshot | null {
  const decoded = decodeStoredPuckData(rawPage);
  if (!decoded.ok) return null;
  const data = decoded.stored === "encoded" ? (rawPage as EncodedPuckData) : encodePuckData(decoded.data);
  return snapshotOfPrepared(data, encodePopupMapForStorage(normalizePopupMap(rawPopups)));
}

export function draftRevisionOf(doc: Record<string, unknown>): number {
  const rev = doc.puckDraftRevision;
  return typeof rev === "number" && Number.isFinite(rev) ? rev : 0;
}

export function historyMarkerOf(doc: Record<string, unknown>): PageHistoryMarker {
  const raw = (doc.puckHistory ?? null) as { latestFingerprint?: unknown; latestAtMs?: unknown } | null;
  return {
    latestFingerprint: typeof raw?.latestFingerprint === "string" ? raw.latestFingerprint : null,
    latestAtMs: typeof raw?.latestAtMs === "number" ? raw.latestAtMs : null,
  };
}

/** The published design's fingerprint, or null when the page has no published copy. */
export function publishedFingerprintOf(doc: Record<string, unknown>): string | null {
  return doc.puckPublishedData != null ? snapshotOfStored(doc.puckPublishedData, doc.puckPublishedPopups)?.fingerprint ?? null : null;
}

/**
 * Queue a version write inside the caller's transaction. Returns the new id,
 * or null when the snapshot can't fit in one document (the caller decides
 * whether that blocks the operation — it does for safety snapshots).
 */
export function writeVersion(
  tx: Transaction,
  pageRef: DocumentReference,
  doc: Record<string, unknown>,
  snap: DesignSnapshot,
  reason: PageVersionReason,
  actor: VersionActor,
  extra: { restoredFromVersionId?: string; restoredFromAtMs?: number | null } = {}
): string | null {
  if (snap.sizeBytes > VERSION_PAYLOAD_LIMIT_BYTES) return null;
  const ref = versionsCol(pageRef).doc();
  tx.create(ref, {
    pageId: pageRef.id,
    subAccountId: doc.subAccountId ?? null,
    agencyId: doc.agencyId ?? null,
    reason,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
    createdByUid: actor.uid,
    createdByName: actor.name,
    fingerprint: snap.fingerprint,
    sizeBytes: snap.sizeBytes,
    data: snap.data,
    popups: snap.popups,
    mediaVideoIds: snap.mediaVideoIds,
    ...(extra.restoredFromVersionId ? { restoredFromVersionId: extra.restoredFromVersionId, restoredFromAtMs: extra.restoredFromAtMs ?? null } : {}),
  });
  return ref.id;
}

/**
 * Bounded retention (runs right after a successful write, outside its
 * transaction): keep at most PAGE_VERSION_LIMIT versions, deleting the oldest
 * first, but never the newest copy of the design that is live right now, and
 * never a version named in `keep` (the ones the operation just created or
 * relied on). Reads metadata only. Safe to run twice concurrently — both pick
 * the same oldest versions.
 */
export async function pruneVersions(pageRef: DocumentReference, publishedFingerprint: string | null, keep: string[] = []): Promise<number> {
  const snap = await versionsCol(pageRef).select("fingerprint", "createdAtMs").get();
  if (snap.size <= PAGE_VERSION_LIMIT) return 0;
  const docs = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, fp: d.get("fingerprint") as string | undefined, at: (d.get("createdAtMs") as number | undefined) ?? 0 }))
    .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  const protectedIds = new Set(keep);
  const live = publishedFingerprint ? docs.find((d) => d.fp === publishedFingerprint) : undefined;
  if (live) protectedIds.add(live.id);
  let excess = docs.length - PAGE_VERSION_LIMIT;
  const toDelete: DocumentReference[] = [];
  for (const d of [...docs].reverse()) {
    if (excess <= 0) break;
    if (protectedIds.has(d.id)) continue;
    toDelete.push(d.ref);
    excess--;
  }
  if (!toDelete.length) return 0;
  const batch = pageRef.firestore.batch();
  toDelete.forEach((r) => batch.delete(r));
  await batch.commit();
  return toDelete.length;
}

/** Display name for "Saved by" — the person's profile name, never their email. */
export async function versionActor(uid: string): Promise<VersionActor> {
  try {
    const user = await getAdminDb().doc(`users/${uid}`).get();
    const name = user.get("displayName");
    return { uid, name: typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : null };
  } catch {
    return { uid, name: null };
  }
}
