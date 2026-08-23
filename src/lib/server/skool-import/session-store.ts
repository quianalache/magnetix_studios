import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Cookie } from "playwright-core";
import { getAdminDb } from "@/lib/firebase/admin";
import { encryptSecret, decryptSecret } from "./crypto";

/**
 * The Skool import session — the "smallest safe import-session abstraction"
 * this pass builds so Scan/Verify/Preview/Import can pick it up later by
 * `importSessionId` alone. Deliberately NOT a live browser handle (nothing
 * on Vercel serverless can hold one across requests — see the Connect
 * report): what actually persists is the AUTHENTICATED COOKIES, encrypted
 * at rest, which a fresh headless browser re-hydrates per request
 * (headless-browser.ts's `CookieSeededHeadlessTransport`).
 *
 * The Skool PASSWORD is never a field on this type and never reaches
 * Firestore — see connect/route.ts.
 */

const COLLECTION = "skoolImportSessions";

/** V1 choice, documented per the "session TTL/cleanup" requirement: an
 *  active-but-idle session expires 30 minutes after its last touch. Long
 *  enough for a real owner to read the Connect success state and move on
 *  to Scan without rushing, short enough that an abandoned tab doesn't
 *  leave a decrypt-able cookie blob sitting around indefinitely. Nothing
 *  costly is "left running" when this lapses (no process to leak) — lapsed
 *  sessions are just inert Firestore docs, reaped lazily on next read. */
const SESSION_TTL_MS = 30 * 60 * 1000;

export type SkoolImportState = "connected"; // more states join here in Scan/Verify/Preview/Import passes

export interface SkoolImportSession {
  id: string;
  subAccountId: string;
  groupId: string;
  createdByMemberId: string;
  skoolGroupSlug: string;
  skoolCommunityName: string;
  state: SkoolImportState;
  createdAt: Timestamp;
  lastActivityAt: Timestamp;
  /** Not exposed outside this module — see `getSessionCookies`. */
  encryptedCookies: string;
}

export type PublicSkoolImportSession = Omit<SkoolImportSession, "encryptedCookies">;

function toPublic(doc: SkoolImportSession): PublicSkoolImportSession {
  return {
    id: doc.id,
    subAccountId: doc.subAccountId,
    groupId: doc.groupId,
    createdByMemberId: doc.createdByMemberId,
    skoolGroupSlug: doc.skoolGroupSlug,
    skoolCommunityName: doc.skoolCommunityName,
    state: doc.state,
    createdAt: doc.createdAt,
    lastActivityAt: doc.lastActivityAt,
  };
}

function col() {
  return getAdminDb().collection(COLLECTION);
}

function isExpired(session: SkoolImportSession): boolean {
  const last = session.lastActivityAt?.toMillis?.() ?? 0;
  return Date.now() - last > SESSION_TTL_MS;
}

export async function createImportSession(opts: {
  subAccountId: string;
  groupId: string;
  createdByMemberId: string;
  skoolGroupSlug: string;
  skoolCommunityName: string;
  cookies: Cookie[];
}): Promise<PublicSkoolImportSession> {
  const ref = col().doc();
  const now = FieldValue.serverTimestamp();
  const doc = {
    subAccountId: opts.subAccountId,
    groupId: opts.groupId,
    createdByMemberId: opts.createdByMemberId,
    skoolGroupSlug: opts.skoolGroupSlug,
    skoolCommunityName: opts.skoolCommunityName,
    state: "connected" as const,
    createdAt: now,
    lastActivityAt: now,
    encryptedCookies: encryptSecret(JSON.stringify(opts.cookies)),
  };
  await ref.set(doc);
  const snap = await ref.get();
  return toPublic({ id: ref.id, ...(snap.data() as Omit<SkoolImportSession, "id">) });
}

/** Scoped to (subAccountId, groupId) so a session can never be read/acted
 *  on from an unrelated destination Community. */
export async function getImportSession(
  subAccountId: string,
  groupId: string,
  sessionId: string,
): Promise<PublicSkoolImportSession | null> {
  const snap = await col().doc(sessionId).get();
  if (!snap.exists) return null;
  const session = { id: snap.id, ...(snap.data() as Omit<SkoolImportSession, "id">) };
  if (session.subAccountId !== subAccountId || session.groupId !== groupId) return null;
  if (isExpired(session)) {
    await snap.ref.delete().catch(() => {});
    return null;
  }
  return toPublic(session);
}

/**
 * Re-hydrates the real cookies for a live step to drive a fresh headless
 * browser with (Scan/Verify/Preview — not called by anything in this
 * pass). Never returns them to an HTTP response; server-side use only.
 * Bumps `lastActivityAt` so an in-progress multi-step import doesn't
 * expire out from under an owner who's actively working through it.
 */
export async function getSessionCookies(
  subAccountId: string,
  groupId: string,
  sessionId: string,
): Promise<Cookie[] | null> {
  const ref = col().doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const session = { id: snap.id, ...(snap.data() as Omit<SkoolImportSession, "id">) };
  if (session.subAccountId !== subAccountId || session.groupId !== groupId) return null;
  if (isExpired(session)) {
    await ref.delete().catch(() => {});
    return null;
  }
  await ref.update({ lastActivityAt: FieldValue.serverTimestamp() }).catch(() => {});
  return JSON.parse(decryptSecret(session.encryptedCookies)) as Cookie[];
}

/** Explicit Disconnect, or cleanup after a failed step later. */
export async function deleteImportSession(
  subAccountId: string,
  groupId: string,
  sessionId: string,
): Promise<void> {
  const ref = col().doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const session = { id: snap.id, ...(snap.data() as Omit<SkoolImportSession, "id">) };
  if (session.subAccountId !== subAccountId || session.groupId !== groupId) return;
  await ref.delete();
}
