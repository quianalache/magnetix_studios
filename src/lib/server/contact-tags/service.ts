import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  invalidateContactsCache,
  loadVisibleContacts,
} from "@/lib/server/contacts-query-service";
import {
  cleanTagName,
  isRegistrableTagName,
  looseTagKey,
  tagKey,
  validateTagName,
} from "@/lib/contacts/tag-names";
import {
  TAG_USAGE_TYPES,
  type ContactTagDoc,
  type ContactTagKeyDoc,
  type TagDetailResponse,
  type TagDuplicateGroup,
  type TagListResponse,
  type TagOperationDoc,
  type TagReference,
  type TagSummary,
  type TagUsageSection,
  type TagUsageType,
} from "@/types/contact-tags";
import {
  createRegistryTag,
  getRegistryTag,
  keyDocId,
  listRegistryTags,
  tagKeysCol,
  tagOpsCol,
  tagsCol,
} from "./registry";
import {
  loadReferenceItems,
  referencesForKeys,
  rewriteItem,
  type ReferenceItem,
  type TagInvalidator,
  type TagMapper,
} from "./references";

/**
 * Contacts & Tags library service (2026-11). Builds the Tags library from
 * the registry PLUS every tag still found only on contacts or in settings
 * (shown as unregistered rows until registered), and runs rename / merge /
 * delete as recorded, retryable operations.
 */

export class TagServiceError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const SECTION_PAGE_SIZE = 50;
const CONTACT_BATCH = 400;

/* -------------------------------- Rows -------------------------------- */

interface Row {
  summary: TagSummary;
  keys: Set<string>;
  registry: ContactTagDoc | null;
  /** Spelling → contact count, for every spelling of this tag's keys. */
  spellings: Map<string, number>;
  references: TagReference[];
}

interface Snapshot {
  rows: Row[];
  items: ReferenceItem[];
}

function pseudoId(key: string): string {
  return `u_${Buffer.from(key, "utf8").toString("base64url")}`;
}

function keyFromPseudoId(id: string): string | null {
  if (!id.startsWith("u_")) return null;
  try {
    return Buffer.from(id.slice(2), "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}

async function buildSnapshot(subAccountId: string, territoryIds: string[] | null): Promise<Snapshot> {
  const [contacts, registry, items] = await Promise.all([
    // Always fresh: library counts must match the database, not a cache.
    loadVisibleContacts({ subAccountId, territoryIds, fresh: true }),
    listRegistryTags(subAccountId),
    loadReferenceItems(subAccountId),
  ]);

  const rows: Row[] = [];
  const rowByKey = new Map<string, Row>();
  const mkRow = (registryTag: ContactTagDoc | null, name: string, keys: string[]): Row => {
    const row: Row = {
      registry: registryTag,
      keys: new Set(keys),
      spellings: new Map(),
      references: [],
      summary: {
        id: registryTag ? registryTag.id : pseudoId(keys[0]),
        name,
        registered: !!registryTag,
        contactCount: 0,
        usageCount: 0,
        usageByType: {},
        updatedAt: registryTag ? registryTag.updatedAt : null,
        legacyOnly: !isRegistrableTagName(name),
        variants: [],
      },
    };
    rows.push(row);
    for (const k of keys) if (!rowByKey.has(k)) rowByKey.set(k, row);
    return row;
  };
  // Registry tags claim their name AND old names (aliases) first.
  for (const t of registry) mkRow(t, t.name, [t.key || tagKey(t.name)]);
  for (const t of registry) {
    const row = rowByKey.get(t.key || tagKey(t.name))!;
    for (const a of t.aliases) {
      if (!rowByKey.has(a)) {
        rowByKey.set(a, row);
        row.keys.add(a);
      }
    }
  }

  // Tags on contacts: count each contact once per row.
  for (const c of contacts) {
    const tags = Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === "string" && !!t.trim()) : [];
    const seenRows = new Set<Row>();
    for (const t of tags) {
      const k = tagKey(t);
      let row = rowByKey.get(k);
      if (!row) row = mkRow(null, cleanTagName(t), [k]);
      row.spellings.set(t, (row.spellings.get(t) ?? 0) + 1);
      if (!seenRows.has(row)) {
        seenRows.add(row);
        row.summary.contactCount++;
      }
    }
  }
  // Names used only in settings still appear in the library.
  for (const item of items) {
    for (const u of item.uses) {
      const k = tagKey(u.value);
      if (k && !rowByKey.has(k)) mkRow(null, cleanTagName(u.value), [k]);
    }
  }

  for (const row of rows) {
    if (!row.registry && row.spellings.size > 0) {
      // Unregistered: show the most common spelling.
      const best = [...row.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      row.summary.name = best;
      row.summary.legacyOnly = !isRegistrableTagName(best);
    }
    row.summary.variants = [...row.spellings.entries()]
      .filter(([n]) => n !== row.summary.name)
      .map(([name, contactCount]) => ({ name, contactCount }))
      .sort((a, b) => b.contactCount - a.contactCount);
    row.references = referencesForKeys(items, row.keys);
    row.summary.usageCount = row.references.length;
    const byType: Partial<Record<TagUsageType, number>> = {};
    for (const r of row.references) byType[r.type] = (byType[r.type] ?? 0) + 1;
    row.summary.usageByType = byType;
  }
  return { rows, items };
}

function duplicateGroups(rows: Row[]): TagDuplicateGroup[] {
  const byLoose = new Map<string, Row[]>();
  for (const r of rows) {
    const k = looseTagKey(r.summary.name);
    if (!k) continue;
    byLoose.set(k, [...(byLoose.get(k) ?? []), r]);
  }
  const groups: TagDuplicateGroup[] = [];
  for (const [key, group] of byLoose) {
    if (group.length > 1 || group[0].summary.variants.length > 0) {
      groups.push({ key, tags: group.map((r) => r.summary) });
    }
  }
  return groups.sort((a, b) => a.key.localeCompare(b.key));
}

function findRow(rows: Row[], tagId: string): Row | null {
  const direct = rows.find((r) => r.summary.id === tagId);
  if (direct) return direct;
  const key = keyFromPseudoId(tagId);
  return key ? rows.find((r) => r.keys.has(key)) ?? null : null;
}

/* ------------------------------- Reads -------------------------------- */

export async function listTags(input: {
  subAccountId: string;
  territoryIds: string[] | null;
  canManage: boolean;
}): Promise<TagListResponse> {
  const { rows } = await buildSnapshot(input.subAccountId, input.territoryIds);
  return {
    tags: rows.map((r) => r.summary).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    canManage: input.canManage,
    duplicateGroupCount: duplicateGroups(rows).length,
    countsScoped: input.territoryIds !== null,
  };
}

export async function listDuplicateGroups(subAccountId: string, territoryIds: string[] | null): Promise<TagDuplicateGroup[]> {
  const { rows } = await buildSnapshot(subAccountId, territoryIds);
  return duplicateGroups(rows);
}

/** Conditions / Add-Remove Tag steps a delete would mark "needs attention". */
function attentionCount(refs: TagReference[]): number {
  return refs.filter((r) => r.kinds.includes("condition") || r.kinds.includes("action")).length;
}

export async function getTagDetail(input: {
  subAccountId: string;
  tagId: string;
  territoryIds: string[] | null;
  canManage: boolean;
  /** Load more of one section: `{ type, offset }`. */
  more?: { type: TagUsageType; offset: number } | null;
}): Promise<TagDetailResponse> {
  const { rows } = await buildSnapshot(input.subAccountId, input.territoryIds);
  const row = findRow(rows, input.tagId);
  if (!row) throw new TagServiceError("That tag no longer exists.", 404, "not_found");
  const sections: TagUsageSection[] = TAG_USAGE_TYPES.map((type) => {
    const all = row.references.filter((r) => r.type === type);
    const offset = input.more?.type === type ? Math.max(0, input.more.offset) : 0;
    const items = all.slice(offset, offset + SECTION_PAGE_SIZE);
    return {
      type,
      total: all.length,
      items,
      nextOffset: offset + SECTION_PAGE_SIZE < all.length ? offset + SECTION_PAGE_SIZE : null,
    };
  });
  return {
    tag: row.summary,
    sections,
    canManage: input.canManage,
    attentionReferenceCount: attentionCount(row.references),
  };
}

/* ------------------------------- Create ------------------------------- */

export async function createTag(input: {
  subAccountId: string;
  agencyId: string;
  name: unknown;
  uid: string;
}): Promise<ContactTagDoc> {
  const check = validateTagName(input.name);
  if (!check.ok) throw new TagServiceError(check.error, 400, "invalid_name");
  // A tag that already exists only on contacts or in settings is the same
  // tag — register it under its existing spelling instead of a second one.
  const { rows } = await buildSnapshot(input.subAccountId, null);
  const newKey = tagKey(check.name);
  const existing = rows.find((r) => r.keys.has(newKey));
  // An old name of a renamed / merged tag can be reused for a new tag —
  // unless contacts still carry that spelling.
  const aliasOnly =
    !!existing?.registry &&
    existing.registry.key !== newKey &&
    ![...existing.spellings.keys()].some((n) => tagKey(n) === newKey);
  if (existing && !aliasOnly) {
    throw new TagServiceError(`“${existing.summary.name}” already exists.`, 409, "exists", {
      tagId: existing.summary.id,
      name: existing.summary.name,
    });
  }
  const res = await createRegistryTag({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    name: check.name,
    createdByUid: input.uid,
    createdVia: "tags_library",
  });
  if (res.status === "exists") {
    throw new TagServiceError(`“${res.tag.name}” already exists.`, 409, "exists", {
      tagId: res.tag.id,
      name: res.tag.name,
    });
  }
  return res.tag;
}

/* ----------------------------- Operations ----------------------------- */

async function startOp(input: Omit<TagOperationDoc, "id" | "status" | "steps" | "contactsUpdated" | "referencesUpdated" | "error" | "startedAt" | "updatedAt">): Promise<FirebaseFirestore.DocumentReference> {
  const ref = tagOpsCol(input.subAccountId).doc();
  const now = Date.now();
  await ref.set({
    ...input,
    id: ref.id,
    status: "running",
    steps: {},
    contactsUpdated: 0,
    referencesUpdated: 0,
    error: null,
    startedAt: now,
    updatedAt: now,
  } satisfies TagOperationDoc);
  return ref;
}

async function markStep(ref: FirebaseFirestore.DocumentReference, step: string, extra: Record<string, unknown> = {}) {
  await ref.update({ [`steps.${step}`]: "done", ...extra, updatedAt: Date.now() });
}

/** Rewrite every referencing settings doc (transaction per doc). */
async function rewriteReferences(
  items: ReferenceItem[],
  keys: Set<string>,
  mapper: TagMapper,
  invalidate?: TagInvalidator,
): Promise<number> {
  const db = getAdminDb();
  let updated = 0;
  for (const item of items) {
    if (!item.uses.some((u) => keys.has(tagKey(u.value)))) continue;
    const changed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(db.doc(item.path));
      if (!snap.exists) return false;
      const patch = rewriteItem(item.type, snap.data()!, mapper, invalidate);
      if (!patch) return false;
      tx.update(snap.ref, patch);
      return true;
    });
    if (changed) updated++;
  }
  return updated;
}

/**
 * Replace (or remove, when `replacement` is null) every spelling of `keys`
 * on every contact in the workspace. Batched; idempotent, so a retry after
 * a failure simply finishes the job. Administrative relabels don't fire
 * Tag Added / Removed workflow events or rewrite Contact Activity.
 */
async function rewriteContactTags(subAccountId: string, keys: Set<string>, replacement: string | null): Promise<number> {
  const db = getAdminDb();
  const snap = await db.collection("contacts").where("subAccountId", "==", subAccountId).select("tags").get();
  let batch = db.batch();
  let inBatch = 0;
  let updated = 0;
  for (const d of snap.docs) {
    const tags = d.get("tags");
    if (!Array.isArray(tags) || !tags.some((t) => typeof t === "string" && keys.has(tagKey(t)))) continue;
    const seen = new Set<string>();
    const next: string[] = [];
    for (const t of tags) {
      if (typeof t !== "string") continue;
      const v = keys.has(tagKey(t)) ? replacement : t;
      if (v === null) continue;
      const k = tagKey(v);
      if (seen.has(k)) continue;
      seen.add(k);
      next.push(v);
    }
    if (next.length === tags.length && next.every((t, i) => t === tags[i])) continue;
    batch.update(d.ref, { tags: next });
    inBatch++;
    updated++;
    if (inBatch >= CONTACT_BATCH) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
  invalidateContactsCache(subAccountId);
  return updated;
}

async function ensureRegistered(subAccountId: string, agencyId: string, row: Row, uid: string): Promise<ContactTagDoc> {
  if (row.registry) return row.registry;
  const res = await createRegistryTag({
    subAccountId,
    agencyId,
    name: row.summary.name,
    createdByUid: uid,
    createdVia: "tags_library",
  });
  return res.tag;
}

async function runOp<T>(ref: FirebaseFirestore.DocumentReference, work: () => Promise<T>): Promise<T> {
  try {
    const out = await work();
    await ref.update({ status: "completed", updatedAt: Date.now() });
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Operation failed";
    await ref.update({ status: "failed", error: message.slice(0, 500), updatedAt: Date.now() }).catch(() => {});
    if (err instanceof TagServiceError) throw err;
    throw new TagServiceError(
      "The change stopped partway. Nothing was lost — run it again to finish.",
      500,
      "partial",
      { opId: ref.id },
    );
  }
}

export async function renameTag(input: {
  subAccountId: string;
  agencyId: string;
  tagId: string;
  newName: unknown;
  uid: string;
}): Promise<{ tag: ContactTagDoc; contactsUpdated: number; referencesUpdated: number }> {
  const check = validateTagName(input.newName);
  if (!check.ok) throw new TagServiceError(check.error, 400, "invalid_name");
  const snapshot = await buildSnapshot(input.subAccountId, null);
  const row = findRow(snapshot.rows, input.tagId);
  if (!row) throw new TagServiceError("That tag no longer exists.", 404, "not_found");
  const newKey = tagKey(check.name);
  const clash = snapshot.rows.find((r) => r !== row && r.keys.has(newKey));
  if (clash && (clash.registry ? clash.registry.key === newKey : true)) {
    throw new TagServiceError(
      `“${clash.summary.name}” already exists. Merge the two tags instead of renaming.`,
      409,
      "name_taken",
      { tagId: clash.summary.id, name: clash.summary.name },
    );
  }

  const fromName = row.summary.name;
  const tag = await ensureRegistered(input.subAccountId, input.agencyId, row, input.uid);
  const keys = new Set([...row.keys, tagKey(tag.name), ...tag.aliases]);
  const opRef = await startOp({
    subAccountId: input.subAccountId,
    type: "rename",
    fromNames: [fromName],
    toName: check.name,
    tagId: tag.id,
    targetTagId: null,
    startedByUid: input.uid,
  });

  return runOp(opRef, async () => {
    // 1. Registry first: from now on every writer still sending the old
    //    name is mapped to the new one (old key becomes an alias).
    const db = getAdminDb();
    await db.runTransaction(async (tx) => {
      const tagRef = tagsCol(input.subAccountId).doc(tag.id);
      const newIdx = tagKeysCol(input.subAccountId).doc(keyDocId(newKey));
      const [tagSnap, idxSnap] = await Promise.all([tx.get(tagRef), tx.get(newIdx)]);
      if (!tagSnap.exists) throw new TagServiceError("That tag no longer exists.", 404, "not_found");
      const owner = idxSnap.data() as ContactTagKeyDoc | undefined;
      let other: FirebaseFirestore.DocumentSnapshot | null = null;
      if (owner && owner.tagId !== tag.id) {
        other = await tx.get(tagsCol(input.subAccountId).doc(owner.tagId));
        if (other.exists && owner.kind === "primary") {
          throw new TagServiceError(
            `“${other.get("name")}” already exists. Merge the two tags instead of renaming.`,
            409,
            "name_taken",
            { tagId: other.id },
          );
        }
      }
      const oldKey = String(tagSnap.get("key") ?? "");
      const aliases = new Set<string>((tagSnap.get("aliases") as string[] | undefined) ?? []);
      if (oldKey && oldKey !== newKey) aliases.add(oldKey);
      aliases.delete(newKey);
      if (other?.exists) {
        const otherAliases = ((other.get("aliases") as string[] | undefined) ?? []).filter((a) => a !== newKey);
        tx.update(other.ref, { aliases: otherAliases, updatedAt: Date.now() });
      }
      tx.update(tagRef, { name: check.name, key: newKey, aliases: [...aliases], updatedAt: Date.now() });
      tx.set(newIdx, { tagId: tag.id, kind: "primary" } satisfies ContactTagKeyDoc);
      if (oldKey && oldKey !== newKey) {
        tx.set(tagKeysCol(input.subAccountId).doc(keyDocId(oldKey)), { tagId: tag.id, kind: "alias" } satisfies ContactTagKeyDoc);
      }
    });
    await markStep(opRef, "registry");
    // 2. Settings that name the tag.
    const mapper: TagMapper = (v) => (keys.has(tagKey(v)) ? check.name : v);
    const referencesUpdated = await rewriteReferences(snapshot.items, keys, mapper);
    await markStep(opRef, "references", { referencesUpdated });
    // 3. Contacts.
    const contactsUpdated = await rewriteContactTags(input.subAccountId, keys, check.name);
    await markStep(opRef, "contacts", { contactsUpdated });
    const fresh = await getRegistryTag(input.subAccountId, tag.id);
    return { tag: fresh ?? { ...tag, name: check.name, key: newKey }, contactsUpdated, referencesUpdated };
  });
}

export async function mergeTags(input: {
  subAccountId: string;
  agencyId: string;
  targetId: string;
  sourceIds: string[];
  uid: string;
}): Promise<{ tag: ContactTagDoc; contactsUpdated: number; referencesUpdated: number }> {
  const snapshot = await buildSnapshot(input.subAccountId, null);
  const target = findRow(snapshot.rows, input.targetId);
  if (!target) throw new TagServiceError("The tag to keep no longer exists.", 404, "not_found");
  const sources = [...new Set(input.sourceIds)].map((id) => findRow(snapshot.rows, id));
  if (sources.some((s) => !s)) throw new TagServiceError("One of the tags to merge no longer exists. Refresh and try again.", 409, "stale");
  const sourceRows = (sources as Row[]).filter((s) => s !== target);
  if (sourceRows.length === 0 && target.summary.variants.length === 0) {
    throw new TagServiceError("Choose at least one tag to merge into this one.", 400, "nothing_to_merge");
  }
  if (target.summary.legacyOnly) {
    throw new TagServiceError("Rename the tag you're keeping to a valid name first (up to 50 characters, no commas).", 400, "invalid_target");
  }

  const kept = await ensureRegistered(input.subAccountId, input.agencyId, target, input.uid);
  const keys = new Set<string>([...target.keys, ...sourceRows.flatMap((r) => [...r.keys])]);
  const opRef = await startOp({
    subAccountId: input.subAccountId,
    type: "merge",
    fromNames: sourceRows.map((r) => r.summary.name).concat(target.summary.variants.map((v) => v.name)),
    toName: kept.name,
    tagId: kept.id,
    targetTagId: kept.id,
    startedByUid: input.uid,
  });

  return runOp(opRef, async () => {
    const db = getAdminDb();
    // 1. Registry: merged definitions disappear; their names become
    //    aliases of the kept tag so stale writers map to it.
    await db.runTransaction(async (tx) => {
      const keptRef = tagsCol(input.subAccountId).doc(kept.id);
      const keptSnap = await tx.get(keptRef);
      if (!keptSnap.exists) throw new TagServiceError("The tag to keep no longer exists.", 404, "not_found");
      const keptKey = String(keptSnap.get("key") ?? "");
      const aliases = new Set<string>((keptSnap.get("aliases") as string[] | undefined) ?? []);
      const sourceRefs = sourceRows.filter((r) => r.registry && r.registry.id !== kept.id).map((r) => tagsCol(input.subAccountId).doc(r.registry!.id));
      const sourceSnaps = await Promise.all(sourceRefs.map((r) => tx.get(r)));
      for (const k of keys) if (k !== keptKey) aliases.add(k);
      for (const s of sourceSnaps) if (s.exists) tx.delete(s.ref);
      for (const k of keys) {
        if (k === keptKey) continue;
        tx.set(tagKeysCol(input.subAccountId).doc(keyDocId(k)), { tagId: kept.id, kind: "alias" } satisfies ContactTagKeyDoc);
      }
      tx.update(keptRef, { aliases: [...aliases], updatedAt: Date.now() });
    });
    await markStep(opRef, "registry");
    const mapper: TagMapper = (v) => (keys.has(tagKey(v)) ? kept.name : v);
    const referencesUpdated = await rewriteReferences(snapshot.items, keys, mapper);
    await markStep(opRef, "references", { referencesUpdated });
    const contactsUpdated = await rewriteContactTags(input.subAccountId, keys, kept.name);
    await markStep(opRef, "contacts", { contactsUpdated });
    const fresh = await getRegistryTag(input.subAccountId, kept.id);
    return { tag: fresh ?? kept, contactsUpdated, referencesUpdated };
  });
}

/**
 * Delete a tag after an informed confirmation (owner decision, 2026-11).
 * - Contacts lose the tag (administrative: no Tag Removed workflow events).
 * - Lists that only APPLY it (form auto-tags, checkout tags, Reading Tool
 *   tags, Create Contact steps) stop applying it.
 * - Rules that TEST it (workflow trigger / If-else / other step conditions,
 *   saved Contact Lists, broadcast-draft audiences) and Add / Remove Tag
 *   steps are kept and marked "needs attention" — they fail closed (match
 *   nobody, stop the run, refuse to send) until another tag is chosen. They
 *   are never removed or turned into "always true".
 * The server re-checks the name and reference count; stale confirmations
 * are refused. Recorded as an operation; safe to run again.
 */
export async function deleteTag(input: {
  subAccountId: string;
  tagId: string;
  uid: string;
  confirmName: unknown;
  expectedReferenceCount: unknown;
}): Promise<{ contactsUpdated: number; referencesUpdated: number; referencesNeedingAttention: number }> {
  const snapshot = await buildSnapshot(input.subAccountId, null);
  const row = findRow(snapshot.rows, input.tagId);
  if (!row) throw new TagServiceError("That tag no longer exists.", 404, "not_found");
  if (input.confirmName !== row.summary.name) {
    throw new TagServiceError("Confirm the tag name to delete it.", 400, "unconfirmed");
  }
  if (input.expectedReferenceCount !== row.references.length) {
    throw new TagServiceError(
      "Where this tag is used changed while you were reviewing. Check the list again before deleting.",
      409,
      "changed",
    );
  }
  const referencesNeedingAttention = attentionCount(row.references);
  const deletedAt = Date.now();

  const opRef = await startOp({
    subAccountId: input.subAccountId,
    type: "delete",
    fromNames: [row.summary.name, ...row.summary.variants.map((v) => v.name)],
    toName: null,
    tagId: row.registry?.id ?? row.summary.id,
    targetTagId: null,
    startedByUid: input.uid,
  });

  return runOp(opRef, async () => {
    // 1. Settings: lists stop applying it (nothing recreates it); rules
    //    that test it are marked "needs attention" and fail closed.
    const referencesUpdated = await rewriteReferences(
      snapshot.items,
      row.keys,
      (v) => (row.keys.has(tagKey(v)) ? null : v),
      (v) => (row.keys.has(tagKey(v)) ? { reason: "tag_deleted", tag: v, at: deletedAt } : null),
    );
    await markStep(opRef, "references", { referencesUpdated });
    // 2. Contacts.
    const contactsUpdated = await rewriteContactTags(input.subAccountId, row.keys, null);
    await markStep(opRef, "contacts", { contactsUpdated });
    // 3. Registry definition + its key index.
    if (row.registry) {
      const db = getAdminDb();
      const batch = db.batch();
      batch.delete(tagsCol(input.subAccountId).doc(row.registry.id));
      for (const k of row.keys) {
        const idxRef = tagKeysCol(input.subAccountId).doc(keyDocId(k));
        const idx = await idxRef.get();
        if ((idx.data() as ContactTagKeyDoc | undefined)?.tagId === row.registry.id) batch.delete(idxRef);
      }
      await batch.commit();
    }
    await markStep(opRef, "registry");
    return { contactsUpdated, referencesUpdated, referencesNeedingAttention };
  });
}

/** Latest operations (newest first) — surfaces a failed run to retry. */
export async function recentOperations(subAccountId: string): Promise<TagOperationDoc[]> {
  const snap = await tagOpsCol(subAccountId).orderBy("startedAt", "desc").limit(10).get();
  return snap.docs.map((d) => d.data() as TagOperationDoc);
}
