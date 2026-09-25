import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ActivityMeta } from "@/types/activities";
import type { ActivityType } from "@/types/contacts";

/**
 * Contact activity writer for the access lifecycle (Contacts redesign,
 * 2026-09-25): purchases, course enrollments, community access granted /
 * revoked. Called from the EXISTING purchase / enrollment / membership
 * services at the moment their state actually transitions, so every entry
 * path (Stripe webhook, staff "Mark as paid", workflow step, member join,
 * Contacts grant) records the same row.
 *
 * Guarantees:
 *   - Never throws — an activity row is a side effect and must never fail
 *     the grant/purchase that triggered it.
 *   - Tenant-safe — the member → contact link is resolved from the member
 *     doc under `subAccounts/{subAccountId}`, and the contact must belong to
 *     that same sub-account, or nothing is written.
 *   - Retry-safe — pass `dedupeKey` (e.g. `purchase_offer_{purchaseId}`)
 *     and the row is written with that deterministic id via `create()`;
 *     a webhook redelivery that re-enters the path is a no-op.
 */

/** Firestore ALREADY_EXISTS (gRPC 6). */
function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === 6 || code === "already-exists";
}

export async function contactIdForMember(
  subAccountId: string,
  memberId: string,
): Promise<string | null> {
  try {
    const snap = await getAdminDb()
      .doc(`subAccounts/${subAccountId}/members/${memberId}`)
      .get();
    return (snap.data()?.contactId as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function recordContactActivity(opts: {
  subAccountId: string;
  /** Resolve the contact from this member when `contactId` isn't known. */
  memberId?: string | null;
  contactId?: string | null;
  type: ActivityType;
  content: string;
  meta?: ActivityMeta;
  /** Staff uid, or a system actor string ("stripe", "workflow", …). */
  createdBy: string;
  dedupeKey?: string;
}): Promise<void> {
  try {
    const db = getAdminDb();
    const contactId =
      opts.contactId ??
      (opts.memberId ? await contactIdForMember(opts.subAccountId, opts.memberId) : null);
    if (!contactId) return;
    const contactSnap = await db.doc(`contacts/${contactId}`).get();
    if (!contactSnap.exists || contactSnap.data()?.subAccountId !== opts.subAccountId) {
      return;
    }
    const col = db.collection(`contacts/${contactId}/activities`);
    const row = {
      type: opts.type,
      content: opts.content.slice(0, 500),
      createdBy: opts.createdBy,
      meta: opts.meta ?? null,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (opts.dedupeKey) {
      const id = opts.dedupeKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200);
      try {
        await col.doc(id).create(row);
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
      }
    } else {
      await col.add(row);
    }
  } catch (err) {
    console.warn("[contact-activity] write failed", opts.type, err);
  }
}

/** "$49.00 USD" — plain, locale-neutral money text for activity content. */
export function formatActivityAmount(amountCents: number, currency: string): string {
  const amount = (Number.isFinite(amountCents) ? amountCents : 0) / 100;
  return `${amount.toFixed(2)} ${(currency || "USD").toUpperCase()}`;
}
