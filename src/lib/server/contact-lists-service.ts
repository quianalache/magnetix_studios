import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sanitizeConditionGroup } from "@/lib/segmentation/sanitize-group";
import type { ContactListDoc, ContactListView } from "@/types/contact-lists";
import type { ConditionGroup } from "@/types/workflows";

/**
 * Contact Lists (Contacts redesign, 2026-09-25) — saved, dynamic contact
 * segments. A list stores ONLY its filter definition (a ConditionGroup for
 * the shared segmentation engine); membership is always computed against
 * live contact data by whoever evaluates it (the contacts search endpoint,
 * the Broadcast audience resolver). See types/contact-lists.ts.
 *
 * Tenancy: every read checks the doc's `subAccountId` against the caller's
 * sub-account — a list id from another sub-account resolves as "not found".
 */

const COLLECTION = "contactLists";
export const MAX_LISTS_PER_SUB_ACCOUNT = 100;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;

export class ContactListError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function iso(v: unknown): string | null {
  const maybe = v as { toDate?: () => Date } | null | undefined;
  return maybe && typeof maybe.toDate === "function"
    ? maybe.toDate().toISOString()
    : null;
}

export function toContactListView(
  doc: ContactListDoc,
  caller: { uid: string; isAdmin: boolean },
): ContactListView {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description ?? "",
    group: doc.group ?? { match: "all", all: [] },
    createdByUid: doc.createdByUid,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    canEdit: caller.isAdmin || doc.createdByUid === caller.uid,
  };
}

/** Load a list, or null when missing / owned by another sub-account. */
export async function getContactList(
  subAccountId: string,
  listId: string,
): Promise<ContactListDoc | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(listId)) return null;
  const snap = await getAdminDb().collection(COLLECTION).doc(listId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<ContactListDoc, "id">;
  if (data.subAccountId !== subAccountId) return null;
  return { id: snap.id, ...data };
}

export async function listContactLists(
  subAccountId: string,
): Promise<ContactListDoc[]> {
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ContactListDoc, "id">) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function cleanName(v: unknown): string {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new ContactListError("Give the list a name.", 400);
  return name.slice(0, MAX_NAME);
}

function cleanDescription(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_DESCRIPTION) : "";
}

function cleanGroup(v: unknown): ConditionGroup {
  const res = sanitizeConditionGroup(v);
  if (!res.ok) throw new ContactListError(res.error, 400);
  if (res.group.all.length === 0) {
    throw new ContactListError(
      "Add at least one filter — a list with no conditions would just be every contact.",
      400,
    );
  }
  return res.group;
}

async function assertUniqueName(
  subAccountId: string,
  name: string,
  exceptId?: string,
): Promise<void> {
  const existing = await listContactLists(subAccountId);
  const clash = existing.find(
    (l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) {
    throw new ContactListError(`A list named "${clash.name}" already exists.`, 409);
  }
}

export async function createContactList(opts: {
  subAccountId: string;
  agencyId: string;
  uid: string;
  name: unknown;
  description?: unknown;
  group: unknown;
}): Promise<ContactListDoc> {
  const name = cleanName(opts.name);
  const group = cleanGroup(opts.group);
  const existing = await listContactLists(opts.subAccountId);
  if (existing.length >= MAX_LISTS_PER_SUB_ACCOUNT) {
    throw new ContactListError(
      `A workspace can have up to ${MAX_LISTS_PER_SUB_ACCOUNT} Contact Lists.`,
      400,
    );
  }
  await assertUniqueName(opts.subAccountId, name);
  const ref = getAdminDb().collection(COLLECTION).doc();
  const doc = {
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    name,
    description: cleanDescription(opts.description),
    group,
    createdByUid: opts.uid,
    updatedByUid: opts.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);
  const fresh = await ref.get();
  return { id: ref.id, ...(fresh.data() as Omit<ContactListDoc, "id">) };
}

export async function updateContactList(opts: {
  subAccountId: string;
  listId: string;
  caller: { uid: string; isAdmin: boolean };
  name?: unknown;
  description?: unknown;
  group?: unknown;
}): Promise<ContactListDoc> {
  const existing = await getContactList(opts.subAccountId, opts.listId);
  if (!existing) throw new ContactListError("Contact List not found.", 404);
  if (!opts.caller.isAdmin && existing.createdByUid !== opts.caller.uid) {
    throw new ContactListError(
      "Only the list's creator or a workspace admin can change it.",
      403,
    );
  }
  const patch: Record<string, unknown> = {
    updatedByUid: opts.caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (opts.name !== undefined) {
    const name = cleanName(opts.name);
    await assertUniqueName(opts.subAccountId, name, existing.id);
    patch.name = name;
  }
  if (opts.description !== undefined) patch.description = cleanDescription(opts.description);
  if (opts.group !== undefined) patch.group = cleanGroup(opts.group);
  const ref = getAdminDb().collection(COLLECTION).doc(existing.id);
  await ref.update(patch);
  const fresh = await ref.get();
  return { id: ref.id, ...(fresh.data() as Omit<ContactListDoc, "id">) };
}

export async function deleteContactList(opts: {
  subAccountId: string;
  listId: string;
  caller: { uid: string; isAdmin: boolean };
}): Promise<void> {
  const existing = await getContactList(opts.subAccountId, opts.listId);
  if (!existing) throw new ContactListError("Contact List not found.", 404);
  if (!opts.caller.isAdmin && existing.createdByUid !== opts.caller.uid) {
    throw new ContactListError(
      "Only the list's creator or a workspace admin can delete it.",
      403,
    );
  }
  await getAdminDb().collection(COLLECTION).doc(existing.id).delete();
}
