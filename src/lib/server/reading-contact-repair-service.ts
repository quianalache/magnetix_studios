import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Legacy reading → contact repair (Wave 2 follow-up, 2026-10-15).
 *
 * A few early readings point at a Contact that no longer exists — the Contact
 * was deleted before contact deletion learned to refuse while Energetic
 * Profiles exist (see the dependency guard in api/contacts/[id]). "View
 * contact" on such a reading 404s.
 *
 * This re-points ONLY the relationship:
 *   - `energeticDecoderReadings/{id}.contactId`
 *   - its Profile's `contactId`, when that Profile still points at the SAME
 *     broken contact (otherwise the person stays orphaned under a dead id)
 *
 * Deliberately narrow — NOT a general reassignment tool:
 *   - refuses unless the reading's current contact is missing or belongs to
 *     another sub-account (a healthy link can't be changed here)
 *   - the new contact must exist in the same sub-account
 *   - never touches birth data, chart results, snapshots, generated reports
 *     or any other field
 */
export type RelinkResult =
  | { ok: true; readingId: string; contactId: string; profileUpdated: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function relinkLegacyReadingContact(
  subAccountId: string,
  readingId: string,
  newContactId: string,
): Promise<RelinkResult> {
  if (!newContactId || typeof newContactId !== "string") {
    return { ok: false, status: 400, error: "Choose a contact to link." };
  }
  const db = getAdminDb();
  const readingRef = db.doc(`energeticDecoderReadings/${readingId}`);

  return db.runTransaction(async (tx) => {
    const readingSnap = await tx.get(readingRef);
    if (!readingSnap.exists || readingSnap.get("subAccountId") !== subAccountId) {
      return { ok: false, status: 404, error: "Reading not found." } as const;
    }
    const oldContactId = (readingSnap.get("contactId") as string | undefined) ?? "";
    if (oldContactId) {
      const current = await tx.get(db.doc(`contacts/${oldContactId}`));
      if (current.exists && current.get("subAccountId") === subAccountId) {
        return {
          ok: false,
          status: 409,
          error: "This reading is already linked to an existing contact. Linking is only for readings whose contact no longer exists.",
        } as const;
      }
    }

    const nextContact = await tx.get(db.doc(`contacts/${newContactId}`));
    if (!nextContact.exists || nextContact.get("subAccountId") !== subAccountId) {
      return { ok: false, status: 404, error: "That contact wasn't found in this workspace." } as const;
    }

    const profileId = (readingSnap.get("profileId") as string | null | undefined) ?? null;
    let profileUpdate: FirebaseFirestore.DocumentReference | null = null;
    if (profileId) {
      const profileRef = db.doc(`energeticProfiles/${profileId}`);
      const profile = await tx.get(profileRef);
      if (
        profile.exists &&
        profile.get("subAccountId") === subAccountId &&
        profile.get("contactId") === oldContactId
      ) {
        profileUpdate = profileRef;
      }
    }

    tx.update(readingRef, { contactId: newContactId });
    if (profileUpdate) tx.update(profileUpdate, { contactId: newContactId });
    return { ok: true, readingId, contactId: newContactId, profileUpdated: !!profileUpdate } as const;
  });
}

/** Whether a reading's contact link is broken (missing, or another sub-account). */
export async function readingContactIsBroken(subAccountId: string, contactId: string | null | undefined): Promise<boolean> {
  if (!contactId) return true;
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  return !snap.exists || snap.get("subAccountId") !== subAccountId;
}
