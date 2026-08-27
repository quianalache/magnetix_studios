import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { performContactMerge } from "@/lib/server/contact-merge";
import type { Contact } from "@/types/contacts";
import type { CustomFieldValue } from "@/types/custom-fields";

/**
 * General-purpose contact merge — the GoHighLevel-style "same person,
 * two records" tool. Unlike /api/contacts/[id]/link (Meta-stub only),
 * either contact can be the survivor and either can carry email/phone.
 *
 *   POST /api/contacts/merge
 *   body: { survivorId, loserId, primaryEmail?, primaryPhone? }
 *
 * Field rule (matches GoHighLevel's merge behavior): the survivor's
 * values win; the loser only fills in fields the survivor left blank.
 * `primaryEmail`/`primaryPhone` let the operator override which of the
 * two contacts' email/phone becomes the survivor's — each must equal
 * one of the two contacts' actual values. Tags union; compliance
 * opt-outs OR together (never silently resubscribe someone who opted
 * out under their other email/number). Not reversible.
 */

function mergeCustomFields(
  survivor?: Record<string, CustomFieldValue> | null,
  loser?: Record<string, CustomFieldValue> | null,
): Record<string, CustomFieldValue> | null {
  if (!survivor && !loser) return null;
  const out: Record<string, CustomFieldValue> = { ...(loser ?? {}) };
  for (const [k, v] of Object.entries(survivor ?? {})) {
    if (v !== "" && v != null) out[k] = v;
  }
  return out;
}

/**
 * Structured Email Consent V1 (2026-08-27) — merge two contacts'
 * `emailConsent` audit records. An `"unsubscribed"` status on EITHER side
 * always wins (matches the `emailOptedOut` boolean's own "sticks" rule
 * just above — a merge must never look like it erased a real unsubscribe
 * event). Otherwise prefers whichever record actually has consent history
 * over one with none. Returns `undefined` (never a fabricated record) when
 * neither contact has any — the caller omits the key entirely in that case.
 */
function mergeEmailConsent(
  survivor?: Contact["emailConsent"],
  loser?: Contact["emailConsent"],
): Contact["emailConsent"] | undefined {
  if (survivor?.status === "unsubscribed") return survivor;
  if (loser?.status === "unsubscribed") return loser;
  return survivor ?? loser ?? undefined;
}

export async function POST(request: Request) {
  let body: {
    survivorId?: string;
    loserId?: string;
    primaryEmail?: string;
    primaryPhone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const survivorId = body.survivorId?.trim();
  const loserId = body.loserId?.trim();
  if (!survivorId || !loserId) {
    return NextResponse.json(
      { error: "survivorId and loserId are required" },
      { status: 400 },
    );
  }
  if (survivorId === loserId) {
    return NextResponse.json(
      { error: "Can't merge a contact into itself." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const survivorRef = db.doc(`contacts/${survivorId}`);
  const loserRef = db.doc(`contacts/${loserId}`);
  const [survivorSnap, loserSnap] = await Promise.all([
    survivorRef.get(),
    loserRef.get(),
  ]);
  if (!survivorSnap.exists || !loserSnap.exists) {
    return NextResponse.json(
      { error: "One of these contacts wasn't found." },
      { status: 404 },
    );
  }
  const survivor = survivorSnap.data() as Omit<Contact, "id">;
  const loser = loserSnap.data() as Omit<Contact, "id">;

  const access = await requireSubAccountAdmin(request, survivor.subAccountId);
  if (access instanceof NextResponse) return access;

  if (loser.subAccountId !== survivor.subAccountId) {
    return NextResponse.json(
      { error: "Both contacts must be in the same sub-account." },
      { status: 400 },
    );
  }
  if (
    survivor.metaUserId &&
    loser.metaUserId &&
    survivor.metaUserId !== loser.metaUserId
  ) {
    return NextResponse.json(
      {
        error:
          "These contacts are linked to two different Facebook/Instagram identities — merge would lose one.",
      },
      { status: 409 },
    );
  }

  const primaryEmail = body.primaryEmail?.trim();
  if (
    primaryEmail &&
    primaryEmail !== survivor.email &&
    primaryEmail !== loser.email
  ) {
    return NextResponse.json(
      { error: "primaryEmail must match one of the two contacts' emails." },
      { status: 400 },
    );
  }
  const primaryPhone = body.primaryPhone?.trim();
  if (
    primaryPhone &&
    primaryPhone !== survivor.phone &&
    primaryPhone !== loser.phone
  ) {
    return NextResponse.json(
      { error: "primaryPhone must match one of the two contacts' phones." },
      { status: 400 },
    );
  }

  const mergedName = survivor.name || loser.name;
  const mergedPhone = primaryPhone ?? (survivor.phone || loser.phone);
  // Structured Email Consent V1 (2026-08-27): built separately since it may
  // legitimately be absent (Firestore's admin SDK rejects `undefined`
  // values in a write payload — omit the key entirely rather than set it
  // to undefined when neither record has any consent history).
  const mergedEmailConsent = mergeEmailConsent(survivor.emailConsent, loser.emailConsent);
  const survivorPatch: Record<string, unknown> = {
    name: mergedName,
    email: primaryEmail ?? (survivor.email || loser.email),
    phone: mergedPhone,
    company: survivor.company || loser.company,
    address: survivor.address || loser.address,
    tags: Array.from(new Set([...(survivor.tags ?? []), ...(loser.tags ?? [])])),
    customFields: mergeCustomFields(survivor.customFields, loser.customFields),
    attribution: survivor.attribution ?? loser.attribution ?? null,
    metaUserId: survivor.metaUserId ?? loser.metaUserId ?? null,
    // Never silently resubscribe someone who opted out under their other
    // email/number — an opt-out on EITHER record sticks on the survivor.
    emailOptedOut: survivor.emailOptedOut || loser.emailOptedOut,
    smsOptedOut: survivor.smsOptedOut || loser.smsOptedOut,
    // Marketing-vs-transactional audit (2026-08-27): same "sticks on either
    // record" rule — a hard-bounced/complained address stays suppressed for
    // transactional mail after a merge too, same reasoning as opt-out above.
    deliverabilitySuppressed: !!(survivor.deliverabilitySuppressed || loser.deliverabilitySuppressed),
    // Structured Email Consent V1 (2026-08-27): same "sticks" rule as the
    // boolean above — an unsubscribed status on EITHER record wins, so a
    // merge can never silently erase a real unsubscribe event from the
    // audit trail.
    ...(mergedEmailConsent ? { emailConsent: mergedEmailConsent } : {}),
  };

  await performContactMerge({
    db,
    subAccountId: survivor.subAccountId,
    loserId,
    survivorId,
    survivorPatch,
    conversationContact: { name: mergedName, phone: mergedPhone },
    loserData: loser,
  });

  return NextResponse.json({ ok: true, survivorId });
}
