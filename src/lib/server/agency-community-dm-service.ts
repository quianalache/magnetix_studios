import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { DmInboxItem, DmMemberView, DmMessageView } from "@/types/community";

/**
 * Agency Community direct messages — the agency-scope sibling of
 * community-dm-service.ts, rooted at `agencies/{agencyId}/dmThreads` /
 * `agencies/{agencyId}/dmBlocks` instead of `subAccounts/{id}/...`.
 * Algorithms (thread id, unread, batch write) transfer verbatim; the two
 * real adaptations are:
 *   - identity: a DM participant id is a Person id (`personId`), never a
 *     tenant Member id — the agency roster doc already carries `personId`
 *     directly (see community-agency-service.ts), so display hydration is
 *     a plain roster lookup, no Member-doc join needed.
 *   - eligibility ("shareAGroup"): two Persons may DM only if they share an
 *     active membership in any published AGENCY community (agency-wide,
 *     same "any shared group" semantics as tenant, scoped to this one
 *     agency) — this also means the agency OWNER (a Firebase uid, not a
 *     Person) does not participate in Agency Community DMs in this pass;
 *     there is no fake-Member identity invented for them.
 */

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

export function dmThreadId(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function threadsCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/dmThreads`);
}

/** Every published community's roster entry for this exact personId,
 *  across the whole agency — the DM eligibility/display primitive. */
async function findRosterEntriesForPerson(
  agencyId: string,
  personId: string,
): Promise<{ groupId: string; displayName: string | null; email: string; status: string }[]> {
  const db = getAdminDb();
  const groupsSnap = await db
    .collection(`agencies/${agencyId}/communityGroups`)
    .where("status", "==", "published")
    .get();
  const results: { groupId: string; displayName: string | null; email: string; status: string }[] = [];
  for (const g of groupsSnap.docs) {
    const memSnap = await db
      .collection(`agencies/${agencyId}/communityGroups/${g.id}/members`)
      .where("personId", "==", personId)
      .limit(1)
      .get();
    if (!memSnap.empty) {
      const data = memSnap.docs[0].data();
      results.push({
        groupId: g.id,
        displayName: (data.displayName as string | null) ?? null,
        email: data.email as string,
        status: data.status as string,
      });
    }
  }
  return results;
}

async function memberView(agencyId: string, personId: string): Promise<DmMemberView> {
  const entries = await findRosterEntriesForPerson(agencyId, personId);
  const active = entries.find((e) => e.status === "active") ?? entries[0];
  if (!active) return { memberId: personId, displayName: "Former member", avatarUrl: null };
  return {
    memberId: personId,
    displayName: active.displayName?.trim() || active.email.split("@")[0] || "Member",
    avatarUrl: null,
  };
}

export async function memberViewById(agencyId: string, personId: string): Promise<DmMemberView> {
  return memberView(agencyId, personId);
}

/* ------------------------------- Blocking ------------------------------ */

function blockId(blockerId: string, blockedId: string) {
  return `${blockerId}__${blockedId}`;
}

export async function isBlockedPair(agencyId: string, a: string, b: string): Promise<boolean> {
  const db = getAdminDb();
  const [x, y] = await db.getAll(
    db.doc(`agencies/${agencyId}/dmBlocks/${blockId(a, b)}`),
    db.doc(`agencies/${agencyId}/dmBlocks/${blockId(b, a)}`),
  );
  return x.exists || y.exists;
}

export async function hasBlocked(agencyId: string, blockerId: string, blockedId: string): Promise<boolean> {
  const snap = await getAdminDb().doc(`agencies/${agencyId}/dmBlocks/${blockId(blockerId, blockedId)}`).get();
  return snap.exists;
}

export async function setBlockServerSide(opts: {
  agencyId: string;
  blockerId: string;
  blockedId: string;
  blocked: boolean;
}): Promise<void> {
  const ref = getAdminDb().doc(`agencies/${opts.agencyId}/dmBlocks/${blockId(opts.blockerId, opts.blockedId)}`);
  if (opts.blocked) {
    await ref.set({ blockerId: opts.blockerId, blockedId: opts.blockedId, createdAt: FieldValue.serverTimestamp() });
  } else {
    await ref.delete();
  }
}

/* ---------------------------- Same-group check ------------------------- */

export async function shareAnAgencyGroup(agencyId: string, a: string, b: string): Promise<boolean> {
  const [entriesA, entriesB] = await Promise.all([
    findRosterEntriesForPerson(agencyId, a),
    findRosterEntriesForPerson(agencyId, b),
  ]);
  const activeGroupsA = new Set(entriesA.filter((e) => e.status === "active").map((e) => e.groupId));
  return entriesB.some((e) => e.status === "active" && activeGroupsA.has(e.groupId));
}

export async function listDmableAgencyMembersServerSide(opts: {
  agencyId: string;
  viewerId: string;
  q?: string;
  limit?: number;
}): Promise<DmMemberView[]> {
  const db = getAdminDb();
  const groupsSnap = await db
    .collection(`agencies/${opts.agencyId}/communityGroups`)
    .where("status", "==", "published")
    .get();

  const personIds = new Set<string>();
  for (const g of groupsSnap.docs) {
    const viewerEntrySnap = await db
      .collection(`agencies/${opts.agencyId}/communityGroups/${g.id}/members`)
      .where("personId", "==", opts.viewerId)
      .where("status", "==", "active")
      .limit(1)
      .get();
    if (viewerEntrySnap.empty) continue;
    const memsSnap = await db
      .collection(`agencies/${opts.agencyId}/communityGroups/${g.id}/members`)
      .where("status", "==", "active")
      .get();
    for (const m of memsSnap.docs) {
      const personId = m.data().personId as string | null;
      if (personId && personId !== opts.viewerId) personIds.add(personId);
    }
  }
  if (personIds.size === 0) return [];

  const [blockedByMe, blockedMe] = await Promise.all([
    db.collection(`agencies/${opts.agencyId}/dmBlocks`).where("blockerId", "==", opts.viewerId).get(),
    db.collection(`agencies/${opts.agencyId}/dmBlocks`).where("blockedId", "==", opts.viewerId).get(),
  ]);
  for (const d of blockedByMe.docs) personIds.delete(d.data().blockedId as string);
  for (const d of blockedMe.docs) personIds.delete(d.data().blockerId as string);

  const views = await Promise.all([...personIds].map((id) => memberView(opts.agencyId, id)));
  const q = opts.q?.trim().toLowerCase();
  const filtered = q ? views.filter((v) => v.displayName.toLowerCase().includes(q)) : views;
  filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return filtered.slice(0, opts.limit ?? 50);
}

export interface CanDmResult {
  ok: boolean;
  reason?: string;
}

export async function canDm(agencyId: string, viewerId: string, otherId: string): Promise<CanDmResult> {
  if (viewerId === otherId) return { ok: false, reason: "That's you." };
  if (await isBlockedPair(agencyId, viewerId, otherId)) {
    return { ok: false, reason: "You can't message this member." };
  }
  if (!(await shareAnAgencyGroup(agencyId, viewerId, otherId))) {
    return { ok: false, reason: "You can only message members of a shared community." };
  }
  return { ok: true };
}

/* ------------------------------- Messaging ----------------------------- */

export async function sendAgencyMessageServerSide(opts: {
  agencyId: string;
  senderId: string;
  otherId: string;
  body: string;
}): Promise<{ threadId: string; message: DmMessageView }> {
  const { agencyId, senderId, otherId } = opts;
  const body = opts.body.trim();
  if (!body) throw new Error("Empty message");
  if (body.length > 5000) throw new Error("Message is too long");

  const id = dmThreadId(senderId, otherId);
  const threadRef = threadsCol(agencyId).doc(id);
  const existing = await threadRef.get();

  if (await isBlockedPair(agencyId, senderId, otherId)) {
    throw new Error("You can't message this member.");
  }
  if (!existing.exists) {
    if (!(await shareAnAgencyGroup(agencyId, senderId, otherId))) {
      throw new Error("You can only message members of a shared community.");
    }
  }

  const msgRef = threadRef.collection("messages").doc();
  const now = FieldValue.serverTimestamp();
  const batch = getAdminDb().batch();
  batch.set(msgRef, { senderId, body, createdAt: now });
  batch.set(
    threadRef,
    {
      memberIds: [senderId, otherId].sort(),
      lastMessage: { body, senderId },
      lastMessageAt: now,
      [`reads.${senderId}`]: now,
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now }),
    },
    { merge: true },
  );
  await batch.commit();

  return { threadId: id, message: { id: msgRef.id, senderId, body, createdAtMs: Date.now() } };
}

async function assertParticipant(agencyId: string, threadId: string, viewerId: string): Promise<string[] | null> {
  const snap = await threadsCol(agencyId).doc(threadId).get();
  if (!snap.exists) return null;
  const ids = (snap.data()!.memberIds as string[]) ?? [];
  return ids.includes(viewerId) ? ids : null;
}

export async function listAgencyMessagesServerSide(opts: {
  agencyId: string;
  threadId: string;
  viewerId: string;
  sinceMs?: number;
}): Promise<DmMessageView[] | null> {
  const ids = await assertParticipant(opts.agencyId, opts.threadId, opts.viewerId);
  if (ids === null) return null;
  const snap = await threadsCol(opts.agencyId)
    .doc(opts.threadId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(500)
    .get();
  let rows = snap.docs.map((d) => ({
    id: d.id,
    senderId: d.data().senderId as string,
    body: d.data().body as string,
    createdAtMs: toMillis(d.data().createdAt) ?? 0,
  }));
  if (opts.sinceMs) rows = rows.filter((m) => m.createdAtMs > opts.sinceMs!);
  return rows;
}

export async function getAgencyThreadOther(opts: {
  agencyId: string;
  threadId: string;
  viewerId: string;
}): Promise<DmMemberView | null> {
  const ids = await assertParticipant(opts.agencyId, opts.threadId, opts.viewerId);
  if (ids === null) return null;
  const otherId = ids.find((x) => x !== opts.viewerId);
  if (!otherId) return null;
  return memberView(opts.agencyId, otherId);
}

export async function markAgencyThreadReadServerSide(opts: {
  agencyId: string;
  threadId: string;
  viewerId: string;
}): Promise<void> {
  const ids = await assertParticipant(opts.agencyId, opts.threadId, opts.viewerId);
  if (ids === null) return;
  await threadsCol(opts.agencyId)
    .doc(opts.threadId)
    .update({ [`reads.${opts.viewerId}`]: FieldValue.serverTimestamp() });
}

function isUnread(data: FirebaseFirestore.DocumentData, viewerId: string) {
  const lastSender = data.lastMessage?.senderId as string | undefined;
  if (!lastSender || lastSender === viewerId) return false;
  const lastAt = toMillis(data.lastMessageAt) ?? 0;
  const readAt = toMillis(data.reads?.[viewerId]) ?? 0;
  return lastAt > readAt;
}

export async function listAgencyInboxServerSide(opts: {
  agencyId: string;
  viewerId: string;
}): Promise<DmInboxItem[]> {
  const snap = await threadsCol(opts.agencyId).where("memberIds", "array-contains", opts.viewerId).get();
  const threads = snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((t) => t.data.lastMessage)
    .sort((a, b) => (toMillis(b.data.lastMessageAt) ?? 0) - (toMillis(a.data.lastMessageAt) ?? 0));

  return Promise.all(
    threads.map(async (t) => {
      const otherId = ((t.data.memberIds as string[]) ?? []).find((x) => x !== opts.viewerId) ?? opts.viewerId;
      return {
        threadId: t.id,
        other: await memberView(opts.agencyId, otherId),
        lastBody: (t.data.lastMessage?.body as string) ?? "",
        lastAtMs: toMillis(t.data.lastMessageAt),
        unread: isUnread(t.data, opts.viewerId),
      };
    }),
  );
}

export async function unreadAgencyThreadCount(opts: { agencyId: string; viewerId: string }): Promise<number> {
  const snap = await threadsCol(opts.agencyId).where("memberIds", "array-contains", opts.viewerId).get();
  return snap.docs.filter((d) => isUnread(d.data(), opts.viewerId)).length;
}
