import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { emitContactDeleted } from "@/lib/server/contacts-service";
import type { Contact } from "@/types/contacts";
import { contactMergeFields } from "@/lib/server/contact-merge-fields";
import { invalidateContactsCache } from "@/lib/server/contacts-query-service";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

/**
 * Shared engine behind every contact-merge entry point: the Meta-stub
 * "Link" tool (`/api/contacts/[id]/link`) and the general "Merge
 * contacts" tool (`/api/contacts/merge`). Both resolve to the same
 * operation — fold a losing contact into a surviving one — they just
 * differ in how the survivor's field patch gets computed and what
 * guards gate access to it.
 */

const SUBCOLLECTIONS = [
  "metaMessages",
  "messages",
  "whatsappMessages",
  "emailMessages",
  "mergeHistory",
  "notes",
  "activities",
] as const;

function tsMillis(v: unknown): number {
  const d = (v as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof d === "number" ? d : 0;
}

/** Re-point a contact-reference field from the loser to the survivor, batched.
 *  `field` defaults to "contactId" — pass an override for a doc family that
 *  names the field differently (e.g. `projects.assignedContactId`). Touches
 *  only that one field on each doc, same as every other repoint in this
 *  file — never overwrites unrelated fields. */
async function repoint(
  db: FirebaseFirestore.Firestore,
  snap: FirebaseFirestore.QuerySnapshot,
  survivorId: string,
  field: string = "contactId",
): Promise<void> {
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    batch.update(d.ref, { [field]: survivorId });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
}

/** Preserve both rows on id collision. A stable alternate id makes retries
 * safe without overwriting either contact's original metadata. */
async function copySubcollection(
  db: FirebaseFirestore.Firestore,
  loserRef: FirebaseFirestore.DocumentReference,
  survivorRef: FirebaseFirestore.DocumentReference,
  name: string,
  survivorId: string,
): Promise<void> {
  const docs = await loserRef.collection(name).get();
  for (const d of docs.docs) {
    if ((await d.ref.listCollections()).length) {
      throw new Error("Merge requires review: nested contact metadata would be lost.");
    }
    const data = d.data();
    if ("contactId" in data) data.contactId = survivorId;
    const target = survivorRef.collection(name).doc(d.id);
    const alternate = survivorRef.collection(name).doc(`merged_${createHash("sha256").update(d.ref.path).digest("hex")}`);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(target);
      if (!existing.exists) { tx.create(target, data); return; }
      if (isDeepStrictEqual(existing.data(), data)) return;
      const collision = await tx.get(alternate);
      if (!collision.exists) tx.create(alternate, data);
      else if (!isDeepStrictEqual(collision.data(), data)) throw new Error("Merge history conflict requires review.");
    });
  }
}

/** Merge the loser's inbox conversation index doc into the survivor's. */
async function mergeConversation(
  db: FirebaseFirestore.Firestore,
  loserId: string,
  survivorId: string,
  survivor: { name: string; phone: string },
): Promise<void> {
  const loserConvRef = db.doc(`conversations/${loserId}`);
  const survivorConvRef = db.doc(`conversations/${survivorId}`);
  const [l, s] = await Promise.all([loserConvRef.get(), survivorConvRef.get()]);
  if (!l.exists) return; // loser never carried a conversation — nothing to merge
  const lc = l.data() ?? {};

  if (!s.exists) {
    // Survivor had no conversation — adopt the loser's, re-keyed to the survivor.
    await survivorConvRef.set({
      ...lc,
      contactId: survivorId,
      contactName: survivor.name || (lc.contactName as string) || "",
      contactPhone: survivor.phone || (lc.contactPhone as string) || null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    const sc = s.data() ?? {};
    const channelsSeen = Array.from(
      new Set([
        ...((sc.channelsSeen as string[]) ?? []),
        ...((lc.channelsSeen as string[]) ?? []),
      ]),
    );
    const patch: Record<string, unknown> = {
      channelsSeen,
      contactName: survivor.name || (sc.contactName as string) || "",
      contactPhone: survivor.phone || (sc.contactPhone as string) || null,
      unreadCount:
        ((sc.unreadCount as number) ?? 0) + ((lc.unreadCount as number) ?? 0),
      updatedAt: FieldValue.serverTimestamp(),
    };
    // Adopt the loser's "last message" fields only when they're newer.
    if (tsMillis(lc.lastMessageAt) > tsMillis(sc.lastMessageAt)) {
      patch.lastChannel = lc.lastChannel;
      patch.lastDirection = lc.lastDirection;
      patch.lastMessagePreview = lc.lastMessagePreview;
      patch.lastMessageAt = lc.lastMessageAt as Timestamp;
    }
    await survivorConvRef.set(patch, { merge: true });
  }
  await loserConvRef.delete();
}

/**
 * Fold `loserId` into `survivorId`: every record that referenced the
 * loser (deals, tasks, events, quotes, form submissions, web chat
 * sessions, voice calls, community Member identity, external billing
 * subscriptions/payments, assigned Projects) gets re-pointed,
 * message/notes/activity subcollections move onto the survivor, the
 * inbox conversation threads merge, `survivorPatch` is applied to the
 * survivor doc, and the loser is recursively deleted. Not reversible —
 * callers confirm with the operator first.
 *
 * Ordering guarantee: every repoint in step 2 happens (awaited,
 * sequentially) before the loser is deleted in step 5. If any query or
 * write in step 2 throws, the function throws before reaching the
 * delete — the loser Contact is never removed until every reference
 * family above has been successfully repointed.
 *
 * Known gap: per-broadcast `sends` and voice-campaign `recipients`
 * subcollections are doc-ID-keyed by contactId and are NOT re-pointed
 * (they're point-in-time delivery receipts, not live records — left
 * under the loser's old id rather than paying for a full collection
 * scan on every merge).
 */
export async function performContactMerge(params: {
  db: FirebaseFirestore.Firestore;
  subAccountId: string;
  loserId: string;
  survivorId: string;
  survivorPatch: Record<string, unknown>;
  conversationContact: { name: string; phone: string };
  loserData: Omit<Contact, "id">;
}): Promise<void> {
  const {
    db,
    subAccountId: sub,
    loserId,
    survivorId,
    survivorPatch,
    conversationContact,
    loserData,
  } = params;
  const loserRef = db.doc(`contacts/${loserId}`);
  const survivorRef = db.doc(`contacts/${survivorId}`);

  if (loserId === survivorId) throw new Error("Cannot merge a contact into itself.");
  const [loserSnap, survivorSnap, collections, loserConversation, survivorConversation] = await Promise.all([
    loserRef.get(), survivorRef.get(), loserRef.listCollections(),
    db.doc(`conversations/${loserId}`).get(), db.doc(`conversations/${survivorId}`).get(),
  ]);
  const currentLoser = loserSnap.data() as Omit<Contact, "id"> | undefined;
  const currentSurvivor = survivorSnap.data() as Omit<Contact, "id"> | undefined;
  if (!currentLoser || !currentSurvivor || currentLoser.subAccountId !== sub || currentSurvivor.subAccountId !== sub || currentLoser.agencyId !== currentSurvivor.agencyId)
    throw new Error("Contacts must belong to the same sub-account and agency.");
  if (currentLoser.metaUserId && currentSurvivor.metaUserId && currentLoser.metaUserId !== currentSurvivor.metaUserId)
    throw new Error("Conflicting Meta identities require review.");
  if (collections.some((collection) => !(SUBCOLLECTIONS as readonly string[]).includes(collection.id)))
    throw new Error("Merge requires review: unsupported contact metadata would be lost.");
  for (const conversation of [loserConversation, survivorConversation]) {
    if (conversation.exists && (conversation.data()?.subAccountId !== sub || conversation.data()?.agencyId !== currentSurvivor.agencyId))
      throw new Error("Conversation tenancy mismatch.");
  }

  // Retain complete original metadata (including conflicting custom fields,
  // identities, consent evidence and conversation controls) before deletion.
  const historyRef = survivorRef.collection("mergeHistory").doc(loserId);
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(historyRef)).exists) tx.create(historyRef, {
      loserId, survivorId, subAccountId: sub, agencyId: currentSurvivor.agencyId,
      loser: currentLoser, survivor: currentSurvivor,
      loserConversation: loserConversation.data() ?? null,
      survivorConversation: survivorConversation.data() ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // 1. Move the loser's own subcollections onto the survivor.
  for (const name of SUBCOLLECTIONS) {
    await copySubcollection(db, loserRef, survivorRef, name, survivorId);
  }

  // 2. Re-point every record that referenced the loser (mirrors the
  //    contact-delete blocker set) so nothing orphans.
  const [
    deals,
    tasks,
    events,
    quotes,
    submissions,
    webChats,
    voiceCalls,
    members,
    externalSubscriptions,
    externalPayments,
    projects,
  ] = await Promise.all([
    db.collection("deals").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
    db.collection("tasks").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
    db.collection("events").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
    db.collection("quotes").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
    db.collectionGroup("submissions").where("contactId", "==", loserId).get(),
    db.collection("subAccounts").doc(sub).collection("webChatSessions").where("contactId", "==", loserId).get(),
    db.collection("subAccounts").doc(sub).collection("voiceCalls").where("contactId", "==", loserId).get(),
    // Community member identity — Member.contactId is the link BACK to the
    // CRM record; left unrepointed, a merge would delete the loser Contact
    // out from under an active community Member.
    db.collection(`subAccounts/${sub}/members`).where("contactId", "==", loserId).get(),
    // Billing/purchase history that must survive the contact it was
    // recorded against.
    db.collection("externalSubscriptions").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
    db.collection("externalPayments").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
    // Project assignment — different field name than the rest (assignedContactId).
    db.collection("projects").where("subAccountId", "==", sub).where("assignedContactId", "==", loserId).get(),
  ]);
  for (const snap of [deals, tasks, events, quotes, submissions, webChats, voiceCalls, members, externalSubscriptions, externalPayments]) {
    await repoint(db, snap, survivorId);
  }
  await repoint(db, projects, survivorId, "assignedContactId");

  // 3. Merge the inbox conversation index.
  await mergeConversation(db, loserId, survivorId, conversationContact);

  // 4. Apply the computed field patch to the survivor.
  await survivorRef.update({
    ...survivorPatch,
    ...contactMergeFields(currentSurvivor, currentLoser),
    // Explicit primary choices from the general merge still win.
    ...Object.fromEntries(["name", "email", "phone"].filter((key) => survivorPatch[key] !== undefined).map((key) => [key, survivorPatch[key]])),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 5. Remove the loser + its (now-copied) subcollections, and fire
  //    contact.deleted from the pre-delete snapshot.
  await db.recursiveDelete(loserRef);
  // Contacts list search cache (Contacts redesign) — drop the merged-away row now.
  invalidateContactsCache(sub);
  emitContactDeleted({
    subAccountId: sub,
    agencyId: loserData.agencyId,
    contactId: loserId,
    data: loserData,
  });
}
