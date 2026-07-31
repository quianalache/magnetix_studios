import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { emitContactDeleted } from "@/lib/server/contacts-service";
import type { Contact } from "@/types/contacts";

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
  "notes",
  "activities",
] as const;

function tsMillis(v: unknown): number {
  const d = (v as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof d === "number" ? d : 0;
}

/** Re-point a `contactId` field from the loser to the survivor, batched. */
async function repoint(
  db: FirebaseFirestore.Firestore,
  snap: FirebaseFirestore.QuerySnapshot,
  survivorId: string,
): Promise<void> {
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    batch.update(d.ref, { contactId: survivorId });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
}

/** Copy a loser subcollection onto the survivor (preserving doc ids). */
async function copySubcollection(
  db: FirebaseFirestore.Firestore,
  loserRef: FirebaseFirestore.DocumentReference,
  survivorRef: FirebaseFirestore.DocumentReference,
  name: string,
  survivorId: string,
): Promise<void> {
  const docs = await loserRef.collection(name).get();
  let batch = db.batch();
  let n = 0;
  for (const d of docs.docs) {
    const data = d.data();
    if ("contactId" in data) data.contactId = survivorId;
    batch.set(survivorRef.collection(name).doc(d.id), data, { merge: true });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
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
  await loserConvRef.delete().catch(() => {});
}

/**
 * Fold `loserId` into `survivorId`: every record that referenced the
 * loser (deals, tasks, events, quotes, form submissions, web chat
 * sessions, voice calls) gets re-pointed, message/notes/activity
 * subcollections move onto the survivor, the inbox conversation
 * threads merge, `survivorPatch` is applied to the survivor doc, and
 * the loser is recursively deleted. Not reversible — callers confirm
 * with the operator first.
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

  // 1. Move the loser's own subcollections onto the survivor.
  for (const name of SUBCOLLECTIONS) {
    await copySubcollection(db, loserRef, survivorRef, name, survivorId);
  }

  // 2. Re-point every record that referenced the loser (mirrors the
  //    contact-delete blocker set) so nothing orphans.
  const [deals, tasks, events, quotes, submissions, webChats, voiceCalls] =
    await Promise.all([
      db.collection("deals").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
      db.collection("tasks").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
      db.collection("events").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
      db.collection("quotes").where("subAccountId", "==", sub).where("contactId", "==", loserId).get(),
      db.collectionGroup("submissions").where("contactId", "==", loserId).get(),
      db.collection("subAccounts").doc(sub).collection("webChatSessions").where("contactId", "==", loserId).get(),
      db.collection("subAccounts").doc(sub).collection("voiceCalls").where("contactId", "==", loserId).get(),
    ]);
  for (const snap of [deals, tasks, events, quotes, submissions, webChats, voiceCalls]) {
    await repoint(db, snap, survivorId);
  }

  // 3. Merge the inbox conversation index.
  await mergeConversation(db, loserId, survivorId, conversationContact);

  // 4. Apply the computed field patch to the survivor.
  await survivorRef.update({
    ...survivorPatch,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 5. Remove the loser + its (now-copied) subcollections, and fire
  //    contact.deleted from the pre-delete snapshot.
  await db.recursiveDelete(loserRef);
  emitContactDeleted({
    subAccountId: sub,
    agencyId: loserData.agencyId,
    contactId: loserId,
    data: loserData,
  });
}
