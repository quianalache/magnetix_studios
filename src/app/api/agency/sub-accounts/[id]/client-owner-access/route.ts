import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  ensureSubAccountClientOwnerAccess,
  getClientOwnerAccessStatus,
} from "@/lib/server/sub-accounts-service";

/**
 * CRM/Business Center access status + deliberate grant/resend action for
 * THIS sub-account's account contact — the fix for the provisioning gap
 * where a client workspace could exist with a real accountContact email
 * attached but no usable CRM login (account contact was metadata-only
 * unless an invite happened to fire at creation time).
 *
 * GET  — read-only status for the Settings → Admin UI: "Active" / "Invite
 *        pending" / "Not provisioned".
 * POST — the deliberate action button only (never automatic, never on
 *        every account-contact save) — provisions/re-provisions access for
 *        whatever email is CURRENTLY saved as this sub-account's account
 *        contact, read fresh from Firestore server-side rather than
 *        trusted from the request body.
 *
 * Both read the account contact off the sub-account doc itself so there's
 * exactly one source of truth for "who is this workspace's account
 * contact" — never a second email a caller could pass in.
 */

async function readAccountContactEmail(
  subAccountId: string
): Promise<{ email: string | null } | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) return null;
  const email =
    (snap.data()?.accountContact?.email as string | null | undefined) ?? null;
  return { email };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const sub = await readAccountContactEmail(subAccountId);
  if (!sub) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 }
    );
  }
  const status = await getClientOwnerAccessStatus(subAccountId, sub.email);
  return NextResponse.json({ email: sub.email, status });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const sub = await readAccountContactEmail(subAccountId);
  if (!sub) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 }
    );
  }
  if (!sub.email) {
    return NextResponse.json(
      { error: "Set an account contact email first." },
      { status: 400 }
    );
  }

  const result = await ensureSubAccountClientOwnerAccess({
    subAccountId,
    invitedByUid: access.uid,
    email: sub.email,
  });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const status = await getClientOwnerAccessStatus(subAccountId, sub.email);
  return NextResponse.json({
    ok: true,
    email: sub.email,
    status,
    mailed: result.mailed,
    added: result.added,
    reused: result.reused,
    alreadyMember: result.alreadyMember,
  });
}
