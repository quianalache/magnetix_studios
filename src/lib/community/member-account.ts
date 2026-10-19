import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createContactServerSide,
  updateContactServerSide,
} from "@/lib/server/contacts-service";
import { ensurePersonLinkForMember } from "@/lib/server/person-identity-service";
import type { Member } from "@/types/community";
import type { ContactAttribution } from "@/types/contacts";

/**
 * Look up a member identity by email within a sub-account. Email is the natural
 * key (one identity per email per sub-account); we query rather than use a
 * deterministic doc id so an email change wouldn't orphan the doc.
 */
export async function findMemberByEmail(
  subAccountId: string,
  email: string
): Promise<Member | null> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/members`)
    .where("email", "==", email.trim().toLowerCase())
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<Member, "id">) };
}

interface EnsureMemberInput {
  subAccountId: string;
  email: string;
  displayName?: string | null;
  /**
   * Captured at instant-signup (Standalone Courses). Magic-link callers never
   * pass this, so an existing member's phone can never be silently blanked
   * out by a plain login.
   */
  phone?: string | null;
  /** Captured at instant-signup when a Course Offer's checkout has "Collect
   *  address" enabled. Same never-blank-on-plain-login guarantee as `phone`. */
  address?: string | null;
  /**
   * Reconciled-contact source tag. Defaults to "community" (the original
   * caller). Standalone Courses passes "course" so CRM contact-source
   * reporting doesn't mislabel course buyers as community joiners — both
   * paths share this same member identity + reconciliation logic.
   */
  source?: string;
  /** Captured from the checkout/signup page's URL at landing time — see
   *  `normalizeAttribution`. First-touch only: backfilled onto the linked
   *  contact only when it has none yet. */
  attribution?: ContactAttribution | null;
  /**
   * Sign-up security (2026-10-19) — how the caller knows the email belongs
   * to the person in front of it:
   *  - "proven": a magic link, password, or verified staff/MyMagnetix
   *    identity. Marks an unverified Member verified.
   *  - "unverified-signup": an instant Offer/course sign-up where only the
   *    email string was typed. May ONLY create a brand-new Member; callers
   *    must send existing Members through a sign-in link instead.
   *  - omitted: staff/import/system callers that never mint a session.
   */
  emailProof?: "proven" | "unverified-signup";
}

/** Thrown when an unverified sign-up reaches an email that already has a
 *  Member. Callers check `findMemberByEmail` first, so this is a guard. */
export class ExistingMemberRequiresSignInError extends Error {
  constructor() {
    super("This email already has an account. Sign in to continue.");
    this.name = "ExistingMemberRequiresSignInError";
  }
}

/**
 * Record that a Member's email has just been proven. For a Member created
 * by an unverified instant sign-up this flips `emailVerified`, unhides its
 * pre-existing Contact, and rejects every session issued before now, so
 * whoever typed the email first loses access. No-op otherwise. Must run
 * BEFORE the caller signs the new session token.
 */
export async function markMemberEmailVerified(
  subAccountId: string,
  memberId: string
): Promise<void> {
  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/members/${memberId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.emailVerified !== false) return;
    tx.set(
      ref,
      {
        emailVerified: true,
        sessionsValidAfter: Date.now(),
        contactLinkUnverified: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Privileged-grant rule (2026-10-19): access granted by staff or a paid
 * invoice to a Member whose email has never been proven must not become
 * usable by whoever created that Member through an instant sign-up.
 * Rejects every existing session of an unverified Member, so the grant is
 * only reachable after a sign-in link proves the inbox. No-op for
 * verified Members.
 */
export async function requireFreshSignInIfUnverified(
  subAccountId: string,
  memberId: string
): Promise<void> {
  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/members/${memberId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.emailVerified !== false) return;
    tx.set(
      ref,
      { sessionsValidAfter: Date.now(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/**
 * Fill only the Contact fields that are currently blank. A public form must
 * never rename or re-address an established Contact just by knowing its
 * email address.
 */
async function fillBlankContactFields(
  contactId: string,
  fields: { name?: string; phone?: string; address?: string }
): Promise<void> {
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  if (!snap.exists) return;
  const current = snap.data() ?? {};
  const patch: { name?: string; phone?: string; address?: string } = {};
  if (fields.name && isBlank(current.name)) patch.name = fields.name;
  if (fields.phone && isBlank(current.phone)) patch.phone = fields.phone;
  if (fields.address && isBlank(current.address)) patch.address = fields.address;
  if (Object.keys(patch).length === 0) return;
  await updateContactServerSide({ contactId, patch });
}

/**
 * Idempotently get-or-create a member identity for `email` in this sub-account,
 * reconciling it to a CRM contact along the way (joining the community doubles
 * as lead capture). Called at magic-link VERIFY time, at password sign-in, by
 * staff bridges, or at instant-signup time for a brand-new email only.
 *
 * Contact reconciliation: reuse an existing contact matched by email within the
 * sub-account, otherwise create one (`source: "community"`) via the same
 * server-side write path the rest of the app uses, so `contact.created` fires.
 *
 * Existing Members are never overwritten (sign-up security, 2026-10-19):
 * a supplied `displayName`/`phone`/`address` only fills a field that is
 * currently blank on the Member and its Contact. Knowing someone's email
 * must never let a public form rename or re-address them.
 *
 * Concurrent verify clicks for the same brand-new email could race into two
 * member docs; the 15-minute magic link makes this vanishingly unlikely, and
 * a later slice can add a transactional guard if needed.
 */
export async function ensureMember({
  subAccountId,
  email,
  displayName,
  phone,
  address,
  source = "community",
  attribution,
  emailProof,
}: EnsureMemberInput): Promise<Member> {
  const db = getAdminDb();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await findMemberByEmail(subAccountId, normalizedEmail);
  if (existing) {
    if (emailProof === "unverified-signup") {
      throw new ExistingMemberRequiresSignInError();
    }
    if (emailProof === "proven" && existing.emailVerified === false) {
      await markMemberEmailVerified(subAccountId, existing.id);
      existing.emailVerified = true;
      delete existing.contactLinkUnverified;
    }

    const patch: Record<string, unknown> = {};
    const trimmedName = displayName?.trim();
    if (trimmedName && isBlank(existing.displayName)) {
      patch.displayName = trimmedName;
    }
    const trimmedPhone = phone?.trim();
    if (trimmedPhone && isBlank(existing.phone)) {
      patch.phone = trimmedPhone;
    }
    const trimmedAddress = address?.trim();
    if (trimmedAddress && isBlank(existing.address)) {
      patch.address = trimmedAddress;
    }

    // First-touch attribution backfill only — never overwrites an
    // existing contact's original source.
    if (attribution && existing.contactId) {
      const contactSnap = await db.doc(`contacts/${existing.contactId}`).get();
      if (contactSnap.exists && !contactSnap.data()?.attribution) {
        await updateContactServerSide({
          contactId: existing.contactId,
          patch: { attribution },
        }).catch((err) =>
          console.warn(
            "[community/member-account] attribution backfill failed",
            err
          )
        );
      }
    }

    let result = existing;
    if (Object.keys(patch).length > 0) {
      await db
        .doc(`subAccounts/${subAccountId}/members/${existing.id}`)
        .set(
          { ...patch, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      result = { ...existing, ...patch } as Member;
    }
    if (existing.contactId && (trimmedName || trimmedPhone || trimmedAddress)) {
      await fillBlankContactFields(existing.contactId, {
        name: trimmedName,
        phone: trimmedPhone,
        address: trimmedAddress,
      }).catch((err) =>
        console.warn("[community/member-account] contact sync failed", err)
      );
    }

    // MyMagnetix identity foundation (2026-08-14) — lazy, idempotent; a
    // no-op once this Member already carries a personId, and refused for
    // a Member whose email is still unverified.
    const personId = await ensurePersonLinkForMember(subAccountId, result);
    return { ...result, personId };
  }

  // Resolve tenancy + the audit actor for the reconciled contact.
  const saSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!saSnap.exists) {
    throw new Error(`Sub-account ${subAccountId} not found`);
  }
  const sa = saSnap.data()!;
  const agencyId = (sa.agencyId as string) ?? "";
  const ownerUid = (sa.createdByUid as string) ?? "";

  // Reconcile to an existing contact by email, else create one.
  let contactId: string | null = null;
  let contactPreexisting = false;
  try {
    const contactSnap = await db
      .collection("contacts")
      .where("subAccountId", "==", subAccountId)
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    if (!contactSnap.empty) {
      contactId = contactSnap.docs[0].id;
      contactPreexisting = true;
    } else {
      const result = await createContactServerSide({
        subAccountId,
        agencyId,
        createdByUid: ownerUid,
        mode: "live",
        name: displayName?.trim() || "",
        email: normalizedEmail,
        phone: phone?.trim() || "",
        company: "",
        address: address?.trim() || "",
        source,
        tags: [],
        attribution: attribution ?? null,
      });
      contactId = result.id;
    }
  } catch (err) {
    // A reconciliation blip must not block the member from signing in — the
    // contact link is recoverable, the login is not.
    console.warn("[community/member-account] contact reconcile failed", err);
  }

  const docRef = await db
    .collection(`subAccounts/${subAccountId}/members`)
    .add({
      subAccountId,
      agencyId,
      email: normalizedEmail,
      displayName: displayName?.trim() || null,
      avatarUrl: null,
      bio: "",
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      contactId,
      passwordHash: null,
      passwordUpdatedAt: null,
      ...(emailProof === "unverified-signup"
        ? { emailVerified: false, contactLinkUnverified: contactPreexisting }
        : emailProof === "proven"
          ? { emailVerified: true }
          : {}),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });

  const snap = await docRef.get();
  const created = { id: docRef.id, ...(snap.data() as Omit<Member, "id">) };

  // MyMagnetix identity foundation (2026-08-14) — every new Member gets
  // linked to a person identity at creation time, same lazy/idempotent
  // helper as the existing-member branch above.
  const personId = await ensurePersonLinkForMember(subAccountId, created);
  return { ...created, personId };
}
