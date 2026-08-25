import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { dispatchNotificationEmail } from "@/lib/server/notification-email-service";
import type { NotificationDoc, NotificationEventType, NotificationObjectType } from "@/types/notifications";

/**
 * MyMagnetix Notifications V1 — the reusable notification/event service.
 * Person-owned (never Member-owned, see the type's own doc comment), one
 * flat top-level `notifications` collection (same convention as
 * `skoolScanResults`/`skoolImportSessions` elsewhere in this codebase —
 * simple id lookups, no composite-index risk beyond the two queries this
 * file actually needs, both declared in firestore.indexes.json).
 *
 * Every write in this file goes through the Admin SDK only — Firestore's
 * default-deny catch-all rule already blocks direct client access to any
 * collection with no explicit rule (see firestore.rules), so a Person can
 * only ever reach their own notifications through the API routes below,
 * which resolve `personId` from the authenticated session — never from
 * anything the client sends. See notify-read/route.ts's own comment for
 * the ownership check that enforces this per-write, not just per-route.
 */

const COLLECTION = "notifications";
const LIST_LIMIT = 30;
/** Bounds a single "mark all read" write — matches the product's explicit
 *  "no need for infinite historical archive" scope; a person with more
 *  unread than this can just keep opening the panel, each batch clears
 *  the oldest-unread first (see markAllReadForPerson). */
const MARK_ALL_READ_BATCH_CAP = 200;

function col() {
  return getAdminDb().collection(COLLECTION);
}

/** Firestore doc ids can't contain `/` — every real id this file builds a
 *  dedupe key from (personId, memberId, postId, courseId, groupId) is
 *  itself already `/`-free, but this stays defensive rather than assuming. */
function sanitizeIdSegment(s: string): string {
  return s.replace(/\//g, "_");
}

export interface CreateNotificationInput {
  personId: string;
  subAccountId: string | null;
  eventType: NotificationEventType;
  objectType: NotificationObjectType;
  objectId: string | null;
  actorPersonId?: string | null;
  actorMemberId?: string | null;
  title: string;
  message?: string | null;
  destination: string;
  meta?: NotificationDoc["meta"];
  /** The one real-world thing that must never produce two notifications —
   *  e.g. a specific reply's commentId, a specific course's courseId. This
   *  IS what makes `dedupeKey` deterministic; see the module comment. */
  sourceObjectId: string;
}

/**
 * Idempotent by construction: the Firestore doc id IS the dedupe key
 * (`eventType:sourceObjectId:personId`), and `.create()` — not `.set()` —
 * is used, which fails (silently, expected) if that id already exists.
 * Safe to call from a webhook retry, a duplicated workflow execution, a
 * page refresh, or a QStash retry without any extra locking — two callers
 * racing to create the SAME notification just means one wins and the
 * other's `create()` rejects, which this function swallows.
 *
 * For events that legitimately recur (a second, different reply; a second,
 * different mention), each has its OWN distinct `sourceObjectId` (the new
 * comment's id) — a genuinely new notification, not a duplicate.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const dedupeKey = [
    input.eventType,
    sanitizeIdSegment(input.sourceObjectId),
    sanitizeIdSegment(input.personId),
  ].join(":");

  const doc: Omit<NotificationDoc, "id" | "createdAt"> & { createdAt: FieldValue } = {
    personId: input.personId,
    subAccountId: input.subAccountId,
    eventType: input.eventType,
    objectType: input.objectType,
    objectId: input.objectId,
    actorPersonId: input.actorPersonId ?? null,
    actorMemberId: input.actorMemberId ?? null,
    title: input.title,
    message: input.message ?? null,
    destination: input.destination,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
    dedupeKey,
    meta: input.meta ?? {},
  };

  try {
    await col().doc(dedupeKey).create(doc);
  } catch (err) {
    // ALREADY_EXISTS (code 6) is the expected, safe outcome of a duplicate
    // call — anything else is a real problem worth a log line, but must
    // never throw into the caller's write path (every producer call site
    // is a `void`/best-effort fire, same discipline as emitWebhookEvent).
    const code = (err as { code?: number })?.code;
    if (code !== 6) {
      console.error("[notification-service] createNotification failed:", err instanceof Error ? err.message : String(err));
    }
    return; // duplicate OR failed write — either way, no email dispatch
  }

  // Email is a delivery CHANNEL on the notification, never independent of
  // it (product requirement) — fired exactly here, exactly once, only on
  // the branch where a NEW notification doc was actually just created.
  // Never awaited — a slow/failed email must never delay or fail the
  // caller's own write path.
  //
  // A `after()`-wrapped version was tried and reverted: live QA on this
  // pass caught two real cases (course access, community access) where a
  // plain `void` fire completed reliably, then two more (a reply, a
  // mention) where the SAME call wrapped in `after()` never completed at
  // all — no delivery doc, no logged error, in this exact deployment.
  // Rather than ship an unproven wrapper on top of a pattern already
  // proven twice, this stays a plain fire — the same discipline every
  // other `void emitWebhookEvent(...)`/`void awardPoints(...)` call in
  // this codebase already uses. Flagged in the report as worth a real
  // investigation later, not silently dropped.
  void dispatchNotificationEmail({
    id: dedupeKey,
    personId: input.personId,
    subAccountId: input.subAccountId,
    eventType: input.eventType,
    objectType: input.objectType,
    title: input.title,
    destination: input.destination,
    meta: input.meta ?? {},
  });
}

function toNotification(id: string, data: FirebaseFirestore.DocumentData): NotificationDoc {
  return { id, ...(data as Omit<NotificationDoc, "id">) };
}

/** Newest first, bounded — see the module comment on why no infinite
 *  archive. Server-verified `personId` only; callers never pass one
 *  through from client input (see the API route). */
export async function listRecentNotificationsForPerson(personId: string): Promise<NotificationDoc[]> {
  const snap = await col()
    .where("personId", "==", personId)
    .orderBy("createdAt", "desc")
    .limit(LIST_LIMIT)
    .get();
  return snap.docs.map((d) => toNotification(d.id, d.data()));
}

/** Real count, not derived from the (possibly truncated) list above — a
 *  Firestore aggregate query, not a full-document fetch. */
export async function countUnreadForPerson(personId: string): Promise<number> {
  const snap = await col().where("personId", "==", personId).where("readAt", "==", null).count().get();
  return snap.data().count;
}

/** Ownership is re-verified here, not just at the route layer — this is
 *  the actual write, so this is the real enforcement point. Silently a
 *  no-op if the notification doesn't exist or belongs to someone else,
 *  matching this codebase's established "scoped read returns null/no-op
 *  rather than leaking a 403 that confirms the doc exists" convention. */
export async function markNotificationRead(notificationId: string, personId: string): Promise<void> {
  const ref = col().doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.personId !== personId) return;
  if (snap.data()?.readAt) return; // already read — avoid a pointless write
  await ref.update({ readAt: FieldValue.serverTimestamp() });
}

/** Clears up to MARK_ALL_READ_BATCH_CAP unread notifications, oldest-first
 *  isn't necessary here (no ordering requirement for a bulk clear) — a
 *  single Firestore batch, one write. */
export async function markAllReadForPerson(personId: string): Promise<void> {
  const snap = await col()
    .where("personId", "==", personId)
    .where("readAt", "==", null)
    .limit(MARK_ALL_READ_BATCH_CAP)
    .get();
  if (snap.empty) return;
  const batch = getAdminDb().batch();
  const now = FieldValue.serverTimestamp();
  for (const doc of snap.docs) batch.update(doc.ref, { readAt: now });
  await batch.commit();
}
