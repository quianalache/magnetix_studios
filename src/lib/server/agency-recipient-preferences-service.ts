import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AgencyRecipientPreferenceDoc } from "@/types/agency-communications";

/**
 * Agency-scope recipient marketing preferences —
 * `agencies/{agencyId}/recipientPreferences/{lowercasedEmail}`. Deliberately
 * a SEPARATE model from a tenant Contact's `emailOptedOut`/
 * `deliverabilitySuppressed` fields: a Person unsubscribing from Magnetix
 * Studios' own Agency Communications must never touch any tenant
 * business's marketing preferences, and vice versa. Doc id is the
 * recipient's own lowercased email — the same dedup key
 * agency-communications-audience-service.ts already resolves recipients by.
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function prefDoc(agencyId: string, email: string) {
  return getAdminDb().doc(`agencies/${agencyId}/recipientPreferences/${normalizeEmail(email)}`);
}

export async function getAgencyRecipientPreference(agencyId: string, email: string): Promise<AgencyRecipientPreferenceDoc | null> {
  const snap = await prefDoc(agencyId, email).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<AgencyRecipientPreferenceDoc, "id">) };
}

/** Manual unsubscribe-link click — sets ONLY `emailOptedOut`, mirroring
 *  the tenant contact unsubscribe route's own distinction between a
 *  voluntary unsubscribe and a deliverability-driven suppression. */
export async function unsubscribeAgencyRecipientServerSide(agencyId: string, email: string): Promise<void> {
  await prefDoc(agencyId, email).set(
    {
      agencyId,
      emailOptedOut: true,
      unsubscribedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Hard bounce / spam complaint — sets BOTH flags, same reasoning as
 *  engagement-webhook.ts's tenant-Contact branch: an address that's
 *  provably broken or actively harmful damages the SHARED EMAIL_FROM
 *  sender's reputation, which tenant Broadcasts also depend on. */
export async function suppressAgencyRecipientServerSide(opts: {
  agencyId: string;
  email: string;
  reason: "hard_bounce" | "complaint";
}): Promise<void> {
  await prefDoc(opts.agencyId, opts.email).set(
    {
      agencyId: opts.agencyId,
      emailOptedOut: true,
      deliverabilitySuppressed: true,
      deliverabilitySuppressedReason: opts.reason,
      deliverabilitySuppressedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
