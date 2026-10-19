import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Data, ComponentData } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  applyEmbedPatch,
  defaultEmbedSettings,
  normalizeEmbedConfig,
} from "@/lib/energetic-decoder/embeds";
import { assertContentSetSelectable, ContentSetError } from "@/lib/server/content-set-service";
import type { EmbedConfig } from "@/types/embed-config";

/**
 * Embeds (Public Reading Tool, Phase 1) — the configured client experience
 * records. Flat top-level `embedConfigs`, same convention as
 * `reportDesigns`/`chartDesigns`; server-only (no client rules), every read
 * and write tenant-checked here.
 */

export class EmbedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EmbedError";
  }
}

function col() {
  return getAdminDb().collection("embedConfigs");
}

export async function listEmbedConfigs(subAccountId: string): Promise<EmbedConfig[]> {
  const snap = await col().where("subAccountId", "==", subAccountId).get();
  return snap.docs
    .map((d) => normalizeEmbedConfig(d.id, d.data()))
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

/** Null for a missing or foreign id — never reveals another workspace's Embed. */
export async function getEmbedConfig(subAccountId: string, embedId: string): Promise<EmbedConfig | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(embedId)) return null;
  const snap = await col().doc(embedId).get();
  if (!snap.exists || snap.get("subAccountId") !== subAccountId) return null;
  return normalizeEmbedConfig(snap.id, snap.data()!);
}

export async function createEmbedConfig(opts: {
  agencyId: string;
  subAccountId: string;
  name: string;
  placementNote?: string;
}): Promise<EmbedConfig> {
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    name: opts.name.trim().slice(0, 80) || "Untitled embed",
    placementNote: opts.placementNote?.trim().slice(0, 200) ?? "",
    status: "draft",
    ...defaultEmbedSettings(),
    stats: { readings: 0, contacts: 0, lastReadingAt: null },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  const snap = await ref.get();
  return normalizeEmbedConfig(ref.id, snap.data()!);
}

/** Every referenced id must belong to this sub-account before it's stored. */
async function assertReferencesInTenant(next: EmbedConfig): Promise<void> {
  const db = getAdminDb();
  try {
    await assertContentSetSelectable(next.subAccountId, next.reading.contentSetId);
  } catch (err) {
    if (err instanceof ContentSetError) throw new EmbedError(err.message, 400);
    throw err;
  }
  if (next.reading.chartDesignSetId) {
    const set = await db.collection("chartDesignSets").doc(next.reading.chartDesignSetId).get();
    if (!set.exists || set.get("subAccountId") !== next.subAccountId) {
      throw new EmbedError("That Chart Design doesn’t exist. Choose another.", 400);
    }
  }
  const step = next.afterSubmit.nextStep;
  if (step.kind === "course") {
    const course = await db.doc(`subAccounts/${next.subAccountId}/standaloneCourses/${step.courseId}`).get();
    if (!course.exists) throw new EmbedError("That course doesn’t exist. Choose another next step.", 400);
  }
  if (step.kind === "offer") {
    const offer = await db.doc(`subAccounts/${next.subAccountId}/courseOffers/${step.offerId}`).get();
    if (!offer.exists) throw new EmbedError("That Offer doesn’t exist. Choose another next step.", 400);
  }
}

export async function updateEmbedConfig(subAccountId: string, embedId: string, rawPatch: unknown): Promise<EmbedConfig> {
  const current = await getEmbedConfig(subAccountId, embedId);
  if (!current) throw new EmbedError("Embed not found", 404);
  const result = applyEmbedPatch(current, rawPatch);
  if (!result.ok) throw new EmbedError(result.error, 400);
  const next = result.next;
  await assertReferencesInTenant(next);
  await col().doc(embedId).update({
    name: next.name,
    placementNote: next.placementNote,
    status: next.status,
    access: next.access,
    form: next.form,
    reading: next.reading,
    afterSubmit: next.afterSubmit,
    contact: next.contact,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return (await getEmbedConfig(subAccountId, embedId))!;
}

/** An Embed with Readings is kept for history — archive it instead. */
export async function deleteEmbedConfig(subAccountId: string, embedId: string): Promise<void> {
  const current = await getEmbedConfig(subAccountId, embedId);
  if (!current) throw new EmbedError("Embed not found", 404);
  if (current.stats.readings > 0) {
    throw new EmbedError("This Embed has Readings. Archive it instead so its history stays intact.", 409);
  }
  await col().doc(embedId).delete();
}

/** Lifetime counters (live submissions only — never Preview or Test). */
export async function recordEmbedReading(embedId: string, opts: { contactCreated: boolean }): Promise<void> {
  await col()
    .doc(embedId)
    .update({
      "stats.readings": FieldValue.increment(1),
      ...(opts.contactCreated ? { "stats.contacts": FieldValue.increment(1) } : {}),
      "stats.lastReadingAt": new Date().toISOString(),
    })
    .catch((err) => console.warn("[embed-config] stats increment failed", err));
}

// ── Usage ───────────────────────────────────────────────────────────────

export interface EmbedPlacementUsage {
  pageId: string;
  name: string;
  /** Placed on the published version (live to visitors) vs only the draft. */
  published: boolean;
}

function puckEmbedIds(data: Data | null | undefined): Set<string> {
  const ids = new Set<string>();
  const walk = (node: ComponentData) => {
    const props = node.props as Record<string, unknown>;
    if (node.type === "ReadingTool" && typeof props.embedId === "string" && props.embedId) ids.add(props.embedId);
    for (const value of Object.values(props)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object" && "type" in child && "props" in child) walk(child as ComponentData);
        }
      }
    }
  };
  for (const node of data?.content ?? []) walk(node);
  return ids;
}

/** Pages & Funnels pages (draft or published) that place each Embed. */
export async function listEmbedPlacements(subAccountId: string): Promise<Map<string, EmbedPlacementUsage[]>> {
  const snap = await getAdminDb()
    .collection("pages")
    .where("subAccountId", "==", subAccountId)
    .select("name", "puckDraftData", "puckPublishedData")
    .get();
  const map = new Map<string, EmbedPlacementUsage[]>();
  for (const d of snap.docs) {
    const published = puckEmbedIds(d.get("puckPublishedData") as Data | null);
    const draft = puckEmbedIds(d.get("puckDraftData") as Data | null);
    for (const id of new Set([...published, ...draft])) {
      const list = map.get(id) ?? [];
      list.push({ pageId: d.id, name: (d.get("name") as string) || "Untitled page", published: published.has(id) });
      map.set(id, list);
    }
  }
  return map;
}

// ── Test records ────────────────────────────────────────────────────────

/** Test Readings made through this Embed (and their test Contacts). */
export async function listEmbedTestRecords(subAccountId: string, embedId: string): Promise<{ readingIds: string[]; contactIds: string[] }> {
  const snap = await getAdminDb()
    .collection("energeticDecoderReadings")
    .where("subAccountId", "==", subAccountId)
    .where("test", "==", true)
    .get();
  const readings = snap.docs.filter((d) => d.get("embed.id") === embedId);
  return {
    readingIds: readings.map((d) => d.id),
    contactIds: [...new Set(readings.map((d) => d.get("contactId") as string).filter(Boolean))],
  };
}

/**
 * One-click Test cleanup: deletes this Embed's Test Readings, their
 * MyMagnetix notifications, and any test-only Contact (+ its Profiles)
 * left with no other Readings. Live records are never touched — every
 * delete re-checks the `test` / `testRecord` flag.
 */
export async function cleanupEmbedTestRecords(subAccountId: string, embedId: string): Promise<{ readings: number; contacts: number }> {
  const db = getAdminDb();
  const { readingIds, contactIds } = await listEmbedTestRecords(subAccountId, embedId);
  for (const id of readingIds) {
    const ref = db.collection("energeticDecoderReadings").doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.get("test") !== true || snap.get("subAccountId") !== subAccountId) continue;
    const notes = await db.collection("notifications").where("objectId", "==", id).get();
    for (const n of notes.docs) {
      if (n.get("objectType") === "reading") await n.ref.delete();
    }
    await ref.delete();
  }
  let contacts = 0;
  for (const contactId of contactIds) {
    const cref = db.collection("contacts").doc(contactId);
    const csnap = await cref.get();
    if (!csnap.exists || csnap.get("testRecord") !== true || csnap.get("subAccountId") !== subAccountId) continue;
    const remaining = await db.collection("energeticDecoderReadings").where("contactId", "==", contactId).limit(1).get();
    if (!remaining.empty) continue;
    const profiles = await db.collection("energeticProfiles").where("contactId", "==", contactId).get();
    for (const p of profiles.docs) {
      if (p.get("subAccountId") === subAccountId) await p.ref.delete();
    }
    await db.recursiveDelete(cref);
    contacts++;
  }
  return { readings: readingIds.length, contacts };
}
