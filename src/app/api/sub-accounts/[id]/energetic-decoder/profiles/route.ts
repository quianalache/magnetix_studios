import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listEnergeticProfilesForContact } from "@/lib/server/energetic-profile-service";

/**
 * Phase 3 Task 4 (2026-08-13) — the New Reading workflow's "which Profile
 * belongs to this Contact" step. Thin read wrapper around Task 1's
 * `listEnergeticProfilesForContact`; no new service logic, just the first
 * route that exposes it to the browser (Contact UI / Readings tab still
 * don't call this yet — out of scope for this task).
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
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const profiles = await listEnergeticProfilesForContact(subAccountId, contactId);
  return NextResponse.json({ ok: true, profiles });
}
