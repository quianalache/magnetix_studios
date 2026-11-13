import "server-only";

import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { cleanTagName, isRegistrableTagName, tagKey } from "@/lib/contacts/tag-names";
import type { ContactTagDoc, ContactTagKeyDoc } from "@/types/contact-tags";

/**
 * Central tag registry (Contacts & Tags, 2026-11). Server-only; the
 * collections are default-deny in firestore.rules.
 *
 * Uniqueness: `contactTagKeys/{sha(key)}` points a tag key at the tag that
 * owns it. A key is either a tag's current name ("primary") or a name it
 * used to have ("alias", after a rename or merge). Creating or renaming
 * goes through a transaction on that index doc, so two concurrent writers
 * can never mint two definitions for "VIP" and "vip".
 */

export const tagsCol = (subAccountId: string) =>
  getAdminDb().collection(`subAccounts/${subAccountId}/contactTags`);
export const tagKeysCol = (subAccountId: string) =>
  getAdminDb().collection(`subAccounts/${subAccountId}/contactTagKeys`);
export const tagOpsCol = (subAccountId: string) =>
  getAdminDb().collection(`subAccounts/${subAccountId}/contactTagOps`);

export function keyDocId(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}

function toTag(id: string, data: FirebaseFirestore.DocumentData): ContactTagDoc {
  return {
    id,
    subAccountId: String(data.subAccountId ?? ""),
    agencyId: String(data.agencyId ?? ""),
    name: String(data.name ?? ""),
    key: String(data.key ?? ""),
    aliases: Array.isArray(data.aliases) ? data.aliases.filter((a: unknown) => typeof a === "string") : [],
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
    createdByUid: (data.createdByUid as string | null) ?? null,
    createdVia: String(data.createdVia ?? "unknown"),
  };
}

export async function listRegistryTags(subAccountId: string): Promise<ContactTagDoc[]> {
  const snap = await tagsCol(subAccountId).get();
  return snap.docs
    .map((d) => toTag(d.id, d.data()))
    .filter((t) => t.subAccountId === subAccountId && t.name);
}

export async function getRegistryTag(subAccountId: string, tagId: string): Promise<ContactTagDoc | null> {
  if (!/^[A-Za-z0-9]{1,64}$/.test(tagId)) return null;
  const snap = await tagsCol(subAccountId).doc(tagId).get();
  if (!snap.exists) return null;
  const tag = toTag(snap.id, snap.data()!);
  return tag.subAccountId === subAccountId ? tag : null;
}

/** The tag that owns `name`'s key (as its name or an alias), if any. */
export async function findTagByName(subAccountId: string, name: string): Promise<ContactTagDoc | null> {
  const key = tagKey(name);
  if (!key) return null;
  const idx = await tagKeysCol(subAccountId).doc(keyDocId(key)).get();
  const tagId = (idx.data() as ContactTagKeyDoc | undefined)?.tagId;
  return tagId ? getRegistryTag(subAccountId, tagId) : null;
}

/**
 * Map each name to the registry's display name for the same key (or alias
 * of a renamed / merged tag). Names with no registry entry map to null.
 * Two batched reads, whatever the number of names.
 */
export async function resolveRegistryNames(
  subAccountId: string,
  names: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const keys = [...new Set(names.map(tagKey).filter(Boolean))];
  if (keys.length === 0) return out;
  const db = getAdminDb();
  const idxSnaps = await db.getAll(...keys.map((k) => tagKeysCol(subAccountId).doc(keyDocId(k))));
  const tagIdByKey = new Map<string, string>();
  idxSnaps.forEach((s, i) => {
    const tagId = (s.data() as ContactTagKeyDoc | undefined)?.tagId;
    if (tagId) tagIdByKey.set(keys[i], tagId);
  });
  const tagIds = [...new Set(tagIdByKey.values())];
  const nameById = new Map<string, string>();
  if (tagIds.length > 0) {
    const tagSnaps = await db.getAll(...tagIds.map((id) => tagsCol(subAccountId).doc(id)));
    for (const s of tagSnaps) {
      if (s.exists && s.get("subAccountId") === subAccountId) nameById.set(s.id, String(s.get("name") ?? ""));
    }
  }
  for (const n of names) {
    const id = tagIdByKey.get(tagKey(n));
    out.set(n, (id && nameById.get(id)) || null);
  }
  return out;
}

export type CreateTagResult =
  | { status: "created"; tag: ContactTagDoc }
  | { status: "exists"; tag: ContactTagDoc };

/**
 * Create one definition, or return the existing tag that already owns the
 * name's key. An alias key (an old name of another tag) is taken over by
 * the new tag — creators can reuse a name they renamed away from.
 */
export async function createRegistryTag(input: {
  subAccountId: string;
  agencyId: string;
  name: string;
  createdByUid: string | null;
  createdVia: string;
}): Promise<CreateTagResult> {
  const name = cleanTagName(input.name);
  const key = tagKey(name);
  const db = getAdminDb();
  const idxRef = tagKeysCol(input.subAccountId).doc(keyDocId(key));
  return db.runTransaction(async (tx) => {
    const idx = await tx.get(idxRef);
    const owner = idx.data() as ContactTagKeyDoc | undefined;
    let aliasOwner: FirebaseFirestore.DocumentSnapshot | null = null;
    if (owner?.tagId) {
      const ownerSnap = await tx.get(tagsCol(input.subAccountId).doc(owner.tagId));
      if (ownerSnap.exists && owner.kind === "primary") {
        return { status: "exists" as const, tag: toTag(ownerSnap.id, ownerSnap.data()!) };
      }
      if (ownerSnap.exists) aliasOwner = ownerSnap;
    }
    const ref = tagsCol(input.subAccountId).doc();
    const now = Date.now();
    const doc = {
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      name,
      key,
      aliases: [] as string[],
      createdAt: now,
      updatedAt: now,
      createdByUid: input.createdByUid,
      createdVia: input.createdVia,
    };
    if (aliasOwner) {
      const aliases = (aliasOwner.get("aliases") as string[] | undefined) ?? [];
      tx.update(aliasOwner.ref, { aliases: aliases.filter((a) => a !== key), updatedAt: now });
    }
    tx.set(ref, doc);
    tx.set(idxRef, { tagId: ref.id, kind: "primary" } satisfies ContactTagKeyDoc);
    return { status: "created" as const, tag: { id: ref.id, ...doc } };
  });
}

/**
 * Canonical display names for a set of incoming names, registering any
 * new ones (registry synchronization for every tag writer). Returns a map
 * cleaned-name → canonical name. Names the registry can't hold (legacy
 * over-long names, commas) pass through unchanged and unregistered.
 */
export async function registerTagNames(input: {
  subAccountId: string;
  agencyId: string;
  names: string[];
  createdByUid: string | null;
  createdVia: string;
}): Promise<Map<string, string>> {
  const cleaned = [...new Set(input.names.map(cleanTagName).filter(Boolean))];
  const out = new Map<string, string>();
  if (cleaned.length === 0) return out;
  const resolved = await resolveRegistryNames(input.subAccountId, cleaned);
  for (const name of cleaned) {
    const known = resolved.get(name);
    if (known) {
      out.set(name, known);
      continue;
    }
    if (!isRegistrableTagName(name)) {
      out.set(name, name);
      continue;
    }
    try {
      const res = await createRegistryTag({
        subAccountId: input.subAccountId,
        agencyId: input.agencyId,
        name,
        createdByUid: input.createdByUid,
        createdVia: input.createdVia,
      });
      out.set(name, res.tag.name);
    } catch (err) {
      // Registry trouble must never block tagging a contact.
      console.warn("[contact-tags] register failed", err);
      out.set(name, name);
    }
  }
  return out;
}
