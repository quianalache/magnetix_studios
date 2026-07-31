import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { performContactMerge } from "@/lib/server/contact-merge";
import type { Contact } from "@/types/contacts";

/**
 * Link (merge) a Facebook/Instagram "stub" contact into an existing contact.
 *
 *   POST /api/contacts/[id]/link   body: { targetContactId }
 *
 * The scoped half of contact-merge — built for the case where a Messenger/IG
 * DM created a new contact (PSID only, no email/phone) that turns out to be
 * someone already in the CRM. [id] is the Meta stub (the loser); the body's
 * `targetContactId` is the survivor. Delegates the actual merge mechanics to
 * `performContactMerge` (@/lib/server/contact-merge), shared with the
 * general-purpose merge tool at /api/contacts/merge.
 *
 * Guards: sub-account admin only; the stub MUST carry a `metaUserId` (so this
 * can't be misused as a general merge); the target must be in the same
 * sub-account; and the target must not already be linked to a DIFFERENT Meta
 * identity (409). Not reversible — the UI confirms first.
 */

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: stubId } = await ctx.params;

  let body: { targetContactId?: string };
  try {
    body = (await request.json()) as { targetContactId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const targetId = body.targetContactId?.trim();
  if (!targetId) {
    return NextResponse.json(
      { error: "targetContactId is required" },
      { status: 400 },
    );
  }
  if (targetId === stubId) {
    return NextResponse.json(
      { error: "Can't link a contact to itself." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const stubRef = db.doc(`contacts/${stubId}`);
  const targetRef = db.doc(`contacts/${targetId}`);
  const [stubSnap, targetSnap] = await Promise.all([
    stubRef.get(),
    targetRef.get(),
  ]);
  if (!stubSnap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const stub = stubSnap.data() as Omit<Contact, "id">;

  // Admin of the stub's sub-account (or agency owner).
  const access = await requireSubAccountAdmin(request, stub.subAccountId);
  if (access instanceof NextResponse) return access;

  // Scoped to Meta stubs — never a general merge tool.
  if (!stub.metaUserId) {
    return NextResponse.json(
      {
        error:
          "Only Facebook/Instagram contacts can be linked this way.",
      },
      { status: 400 },
    );
  }

  if (!targetSnap.exists) {
    return NextResponse.json(
      { error: "The contact to merge into wasn't found." },
      { status: 404 },
    );
  }
  const target = targetSnap.data() as Omit<Contact, "id">;
  if (target.subAccountId !== stub.subAccountId) {
    return NextResponse.json(
      { error: "Both contacts must be in the same sub-account." },
      { status: 400 },
    );
  }
  if (target.metaUserId && target.metaUserId !== stub.metaUserId) {
    return NextResponse.json(
      {
        error:
          "That contact is already linked to a different Facebook/Instagram identity.",
      },
      { status: 409 },
    );
  }

  await performContactMerge({
    db,
    subAccountId: stub.subAccountId,
    loserId: stubId,
    survivorId: targetId,
    survivorPatch: { metaUserId: stub.metaUserId },
    conversationContact: { name: target.name, phone: target.phone },
    loserData: stub,
  });

  return NextResponse.json({ ok: true, targetContactId: targetId });
}
