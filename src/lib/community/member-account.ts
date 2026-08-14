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
}

/**
 * Idempotently get-or-create a member identity for `email` in this sub-account,
 * reconciling it to a CRM contact along the way (joining the community doubles
 * as lead capture). Called at magic-link VERIFY time, or at instant-signup time
 * (Standalone Courses — no magic link) — either way a member doc only ever
 * exists for an email its owner actually submitted.
 *
 * Contact reconciliation: reuse an existing contact matched by email within the
 * sub-account, otherwise create one (`source: "community"`) via the same
 * server-side write path the rest of the app uses, so `contact.created` fires.
 *
 * If the member already exists and the caller supplies a `displayName`/`phone`
 * that differs from what's stored (the instant-signup path always does), the
 * member doc and its linked contact are patched to keep the info fresh — a
 * repeat buyer re-entering the popup on a new device shouldn't leave stale
 * data behind. Magic-link callers never pass these fields, so they can't
 * accidentally blank them out.
 *
 * Concurrent verify clicks for the same brand-new email could race into two
 * member docs; the 15-minute single-use magic link makes this vanishingly
 * unlikely, and a later slice can add a transactional guard if needed.
 */
export async function ensureMember({
  subAccountId,
  email,
  displayName,
  phone,
  address,
  source = "community",
  attribution,
}: EnsureMemberInput): Promise<Member> {
  const db = getAdminDb();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await findMemberByEmail(subAccountId, normalizedEmail);
  if (existing) {
    const patch: Record<string, unknown> = {};
    const trimmedName = displayName?.trim();
    if (trimmedName && trimmedName !== existing.displayName) {
      patch.displayName = trimmedName;
    }
    const trimmedPhone = phone?.trim();
    if (trimmedPhone && trimmedPhone !== existing.phone) {
      patch.phone = trimmedPhone;
    }
    const trimmedAddress = address?.trim();
    if (trimmedAddress && trimmedAddress !== existing.address) {
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

      if (existing.contactId) {
        await updateContactServerSide({
          contactId: existing.contactId,
          patch: {
            ...(patch.displayName ? { name: patch.displayName as string } : {}),
            ...(patch.phone ? { phone: patch.phone as string } : {}),
            ...(patch.address ? { address: patch.address as string } : {}),
          },
        }).catch((err) =>
          console.warn("[community/member-account] contact sync failed", err)
        );
      }

      result = { ...existing, ...patch } as Member;
    }

    // MyMagnetix identity foundation (2026-08-14) — lazy, idempotent; a
    // no-op once this Member already carries a personId.
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
  try {
    const contactSnap = await db
      .collection("contacts")
      .where("subAccountId", "==", subAccountId)
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    if (!contactSnap.empty) {
      contactId = contactSnap.docs[0].id;
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
