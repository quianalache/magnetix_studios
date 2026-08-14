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
 *   - No password, no session, no relationship list on the person doc
 *     itself.
 *   - The link direction is [Member | staff user] -> Person, never the
 *     reverse. A field on the many side avoids array-mutation races
 *     across concurrent logins/sessions and needs no transaction to add
 *     a new relationship.
 *
 * Reconciliation is LAZY, on authentication only (no backfill migration
 * run by this task) — every real place a Member session is minted today
 * (ensureMember, authenticateMemberWithPassword, consumeMemberPasswordToken)
 * calls `ensurePersonLinkForMember` once, idempotently. An existing Member
 * that never logs in again simply never gets a `personId` until it does;
 * that's an accepted, deliberate tradeoff for zero migration risk.
 *
 * Staff <-> Person bridge (2026-08-14) — the identity/authorization
 * boundary is load-bearing here, not decorative: `ensurePersonLinkForStaffUser`
 * writes ONLY `users/{uid}.personId`. It never reads or writes Firebase
 * custom claims, `subAccountMembers`, `agencyMembers`, or any Member doc's
 * own tenant relationship. A staff user and a Member sharing one personId
 * means "same human," nothing more — every existing authorization check
 * (requireSubAccountMember, requireAgencyOwner, getCurrentMember's `sa`
 * scope check) is completely unaware personId exists and stays fully
 * authoritative for "what can this identity access." personId reconciles
 * to the SAME person as an existing Member with the same email (both go
 * through the identical `ensurePersonIdentity` email lookup) — a staff
 * account and a Member account for the same real email always converge
 * on one `people` doc, never create two.
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

/**
 * Lazily link a staff/business Firebase Auth account (its `users/{uid}`
 * doc) to its person identity. Same contract as `ensurePersonLinkForMember`
 * in every respect — no-op once linked, best-effort/non-blocking, resolves
 * through the identical `ensurePersonIdentity` email lookup so a staff
 * account and a Member account sharing one real email always converge on
 * the SAME `people` doc rather than creating a second one.
 *
 * IDENTITY ONLY: writes exactly one field (`personId`) onto exactly one
 * `users/{uid}` doc. Never reads or writes Firebase custom claims,
 * `subAccountMembers`, `agencyMembers`, or any Member/Contact record —
 * staff authorization is untouched and remains fully authoritative.
 */
export async function ensurePersonLinkForStaffUser(staffUser: {
  uid: string;
  email: string;
  personId?: string | null;
}): Promise<string | null | undefined> {
  if (staffUser.personId) return staffUser.personId;

  try {
    const personId = await ensurePersonIdentity(staffUser.email);
    await getAdminDb()
      .doc(`users/${staffUser.uid}`)
      .set({ personId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return personId;
  } catch (err) {
    console.warn("[person-identity-service] ensurePersonLinkForStaffUser failed", err);
    return staffUser.personId;
  }
}

/**
 * Dual-role detection readiness (2026-08-14) — read-only, not called by
 * any UI yet (no Business Center / MyMagnetix gateway exists). Answers
 * ONLY "does this person have at least one active staff/business
 * account" — never which one, never what it's allowed to do; that stays
 * with the existing Firebase-claims/subAccountMembers authorization path.
 * `users` is a normal top-level collection, so this equality query is
 * covered by Firestore's automatic single-field indexing — no new index
 * needed, unlike the Member-side lookup below.
 */
export async function personHasStaffAccess(personId: string): Promise<boolean> {
  const snap = await getAdminDb()
    .collection("users")
    .where("personId", "==", personId)
    .where("status", "==", "active")
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Dual-role detection readiness (2026-08-14) — read-only, not called by
 * any UI yet. Answers ONLY "does this person have at least one Member
 * relationship in any sub-account" — never which business, never what
 * that Member is entitled to; the existing tenant-scoped Member/session
 * checks remain authoritative for actual access.
 *
 * Unlike `personHasStaffAccess`, this queries ACROSS every sub-account's
 * `members` subcollection via a collection-group query, which needs its
 * own explicit collection-group index (added to firestore.indexes.json
 * and deployed alongside this change — see the Build Log). This is the
 * one piece of "genuinely necessary" infrastructure Step 5 asked for.
 */
export async function personHasMemberRelationships(personId: string): Promise<boolean> {
  const snap = await getAdminDb()
    .collectionGroup("members")
    .where("personId", "==", personId)
    .limit(1)
    .get();
  return !snap.empty;
}
