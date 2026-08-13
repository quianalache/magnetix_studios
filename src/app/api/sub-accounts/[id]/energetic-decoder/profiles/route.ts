import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  listEnergeticProfilesForContact,
  listEnergeticProfilesForSubAccount,
} from "@/lib/server/energetic-profile-service";

/**
 * Phase 3 Task 4 (2026-08-13) — the New Reading workflow's "which Profile
 * belongs to this Contact" step. Thin read wrapper around Task 1's
 * `listEnergeticProfilesForContact`.
 *
 * Phase 3 Task 8 (2026-08-13) — `?contactId=` is now optional: omitting it
 * lists every Profile in the sub-account, for the new Profile-centered
 * Readings tab (which needs to show Profiles with zero Readings too).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const profiles = contactId
    ? await listEnergeticProfilesForContact(subAccountId, contactId)
    : await listEnergeticProfilesForSubAccount(subAccountId);
  return NextResponse.json({ ok: true, profiles });
}
