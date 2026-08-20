import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Member } from "@/types/community";

/**
 * Skool migration, Gap 2 — preserving authorship for former/unresolvable
 * Skool members instead of dropping their posts/comments.
 *
 * Investigated (not assumed) against the real Member schema and every real
 * consumer of `Member.email` before choosing this design, per explicit
 * instruction to choose based on the code, not convenience. Findings:
 *  - No code path sends email automatically on Member creation; every real
 *    send requires an explicit real-person form submission with that exact
 *    address.
 *  - Firestore has NO email-uniqueness enforcement (client writes to
 *    `members` are fully denied by firestore.rules — uniqueness is a pure
 *    app-level `.limit(1)` convention). A SHARED placeholder email would
 *    therefore risk `.limit(1)`-based lookups resolving to an arbitrary one
 *    of several docs; a DETERMINISTIC PER-AUTHOR email avoids that.
 *  - The codebase's only email-shape check is
 *    `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — no TLD allow/deny list anywhere — so
 *    RFC 6761's reserved `.invalid` TLD passes it while remaining
 *    structurally non-deliverable.
 *  - `Member`/`GroupMembership` are a genuinely clean two-tier model:
 *    `memberCount` only increments at GroupMembership-creation call sites,
 *    never at Member-creation ones, so a Member with zero GroupMemberships
 *    is invisible to active-member counting/UI everywhere it was checked.
 *
 * Chosen design (Option A/C hybrid from the 4 offered): a real, MINIMAL,
 * non-login Member doc — never `ensureMember` (which unconditionally
 * creates/links a CRM Contact + MyMagnetix Person; preserving authorship on
 * old posts is not "a genuine product reason" to do that per explicit
 * instruction), keyed by a deterministic reserved `*@invalid` email so a
 * rerun always resolves to the SAME doc.
 */

function reservedHistoricalEmail(skoolUserId: string): string {
  return `skool-import+${skoolUserId}@invalid`;
}

function membersCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/members`);
}

/** Read-only lookup — used by the dry-run branch (mirrors `findMemberByEmail`'s
 *  role for ordinary members) so a plan pass never writes. */
export async function findHistoricalAuthorMember(
  subAccountId: string,
  skoolUserId: string,
): Promise<Member | null> {
  const snap = await membersCol(subAccountId)
    .where("email", "==", reservedHistoricalEmail(skoolUserId))
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<Member, "id">) };
}

export interface HistoricalAuthorInput {
  subAccountId: string;
  agencyId: string;
  skoolUserId: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Idempotently get-or-create a minimal "historical author" Member — never
 * called during a dry run (see `findHistoricalAuthorMember` above for that
 * path). What this deliberately does NOT do, each confirmed safe by the
 * investigation above:
 *  - no CRM Contact / MyMagnetix Person is created or linked (`contactId`/
 *    `personId` stay null — `ensureMember` is never called)
 *  - no GroupMembership is ever created for this Member — `importer.ts` §4
 *    already skips membership creation for any member whose
 *    `membershipTab !== "active"`, which every historical author is by
 *    definition (they have no resolvable email precisely because they're
 *    former/churned) — no new logic was needed there
 *  - no login is possible (`passwordHash: null`; the reserved `.invalid`
 *    email can never receive or complete a real magic-link flow)
 *  - no email is ever sent (nothing in this codebase sends mail merely
 *    because a Member doc exists)
 *  - member counts stay accurate (see the two-tier-model finding above)
 *
 * `status: "active"` (not `"removed"`) is a deliberate choice, not an
 * oversight: it could not be confirmed that feed/post rendering never
 * filters by `Member.status` anywhere, and getting that wrong would
 * silently hide the very content this exists to preserve — defeating the
 * whole point. The real protection against login/access/email comes from
 * the reserved undeliverable email + null passwordHash + zero
 * GroupMembership + zero automatic sends, all independently confirmed
 * sufficient above, not from `status`.
 *
 * Idempotent + reconcilable: keyed by the deterministic reserved email, so
 * a rerun always finds the same doc rather than creating a duplicate. If
 * this same human later rejoins with a real email, the existing
 * `community_members` importMappings entry (external id = this stable
 * Skool user id) is what a FUTURE, explicit reconciliation step would use
 * to merge old authorship into the new real Member — never attempted
 * automatically here, and never based on display name alone, per explicit
 * instruction.
 */
export async function ensureHistoricalAuthorMember(input: HistoricalAuthorInput): Promise<Member> {
  const existing = await findHistoricalAuthorMember(input.subAccountId, input.skoolUserId);
  if (existing) return existing;

  const docRef = await membersCol(input.subAccountId).add({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    email: reservedHistoricalEmail(input.skoolUserId),
    displayName: input.name || null,
    avatarUrl: input.avatarUrl,
    bio: "",
    phone: null,
    address: null,
    contactId: null,
    personId: null,
    passwordHash: null,
    passwordUpdatedAt: null,
    importedHistoricalOnly: true,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastSeenAt: null,
  });
  const snap = await docRef.get();
  return { id: docRef.id, ...(snap.data() as Omit<Member, "id">) };
}
