import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * MyMagnetix identity foundation (2026-08-14) — the smallest safe step
 * toward "these business-specific Member relationships belong to the same
 * human," per the approved MyMagnetix product direction (person-centered
 * global account layer, sitting ABOVE tenant-specific records, never
 * replacing them).
 *
 * `people/{id}` is a new, minimal, top-level collection representing a
 * HUMAN, not a tenant relationship. It does not know about sub-accounts,
 * Communities, Courses, or anything else — its only job is to be a stable
 * id that more than one tenant-scoped `Member` doc can point back to.
 *
 * Deliberately narrow, per instruction not to over-model future features:
 *   - `id` (Firestore auto-id) is the stable identifier other records
 *     reference — NOT email. Email is a mutable lookup field only, exactly
 *     like Contact/Member reconciliation already treats it elsewhere in
 *     this codebase (findExistingContactId, findMemberByEmail). A future
 *     email change on a person doc doesn't orphan anything referencing
 *     `personId`, the same reasoning the existing Member lookup-by-query
 *     (not deterministic doc id) already uses.
 *   - No password, no session, no staff/uid link, no relationship list.
 *     Staff (Firebase Auth) identity is explicitly NOT touched or linked
 *     here — the approved principles said don't treat staff and member
 *     permissions as interchangeable; whether/how to eventually link a
 *     staff uid to a person doc is evaluated in the Build Log, not built.
 *   - The link direction is Member -> Person (`Member.personId`), not
 *     Person -> [Member ids]. A field on the many side avoids array-
 *     mutation races across concurrent logins in different sub-accounts
 *     and needs no transaction to add a new relationship.
 *
 * Reconciliation is LAZY, on authentication only (no backfill migration
 * run by this task) — every real place a Member session is minted today
 * (ensureMember, authenticateMemberWithPassword, consumeMemberPasswordToken)
 * calls `ensurePersonLinkForMember` once, idempotently. An existing Member
 * that never logs in again simply never gets a `personId` until it does;
 * that's an accepted, deliberate tradeoff for zero migration risk.
 */

/**
 * Shape of a `people/{id}` doc. No reader function returns this yet — the
 * first real consumer is the future cross-tenant relationship lookup
 * described in the Build Log (a `collectionGroup("members").where(
 * "personId", "==", personId)` query), deliberately not built in this task
 * since nothing calls it yet and it needs its own Firestore collection-
 * group index entry (firestore.indexes.json) before it would work in
 * production. Kept here as the documented target shape.
 */
export interface PersonIdentity {
  id: string;
  primaryEmail: string;
  createdAt: string | null;
  updatedAt: string | null;
}

function col() {
  return getAdminDb().collection("people");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve the person identity for an email, creating one if none exists
 * yet. Query-by-field (not a deterministic doc id keyed on email) — same
 * reasoning as findMemberByEmail: an email is a lookup key, not a
 * permanent identifier, so this stays correct if a person doc's own
 * `primaryEmail` is ever changed later (not built yet; no UI edits this
 * field today).
 *
 * Idempotent and safe under concurrent calls for the SAME email: at worst
 * two near-simultaneous first-ever logins for a brand-new email could each
 * create a `people` doc (same tiny race `ensureMember` already accepts and
 * documents for brand-new Member docs) — vanishingly unlikely, and named
 * here rather than silently ignored.
 */
export async function ensurePersonIdentity(email: string): Promise<string> {
  const normalized = normalizeEmail(email);
  const existing = await col().where("primaryEmail", "==", normalized).limit(1).get();
  if (!existing.empty) return existing.docs[0].id;

  const ref = await col().add({
    primaryEmail: normalized,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Lazily link a tenant Member doc to its person identity. No-op (zero
 * reads beyond the one already-loaded `member`, zero writes) when a
 * `personId` is already set — the common case after the first login post-
 * rollout. Writes exactly ONE field (`personId`) onto the ONE Member doc
 * passed in; never touches any other Member doc, any Contact, or any other
 * sub-account's data. This is the entire "reconciliation" behavior — there
 * is no merge, no dedupe-by-guessing beyond the email-equality lookup
 * `ensurePersonIdentity` already does, and no ambiguity resolution: two
 * DIFFERENT emails never produce the same personId, so two humans who
 * happen to share a surname/contact info some other way are never merged.
 * The one real edge case (a human changes their email and reappears as a
 * "new" person) is accepted, not guessed around — flagged in the Build Log
 * as a known future limitation, not solved here.
 *
 * Best-effort, same contract as this file's own Contact-reconciliation
 * neighbor in member-account.ts ("a reconciliation blip must not block the
 * member from signing in — the [identity] link is recoverable, the login
 * is not"): a failure here is logged and swallowed, returning the
 * member's existing personId (often null/undefined) rather than throwing.
 * Every real caller is inside an active login/session-issuing path — this
 * must never turn a working login into a failed one, since it's retried
 * for free on the member's next login.
 */
export async function ensurePersonLinkForMember(
  subAccountId: string,
  member: { id: string; email: string; personId?: string | null },
): Promise<string | null | undefined> {
  if (member.personId) return member.personId;

  try {
    const personId = await ensurePersonIdentity(member.email);
    await getAdminDb()
      .doc(`subAccounts/${subAccountId}/members/${member.id}`)
      .set({ personId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return personId;
  } catch (err) {
    console.warn("[person-identity-service] ensurePersonLinkForMember failed", err);
    return member.personId;
  }
}
