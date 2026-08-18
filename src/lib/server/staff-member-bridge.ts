import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ensureMember } from "@/lib/community/member-account";
import type { Member } from "@/types/community";

/**
 * Staff -> Member Seamless Entry — the shared, surface-agnostic core.
 * Community is the first caller (see the enter-as-staff route), but this
 * file deliberately knows nothing about Community/GroupMembership: Client
 * Portal and Courses share the exact same `Member`/`ls_member_session`
 * identity system (confirmed in the investigation report) and can call
 * this same resolver later without any changes here — only their own
 * destination-computation logic differs.
 *
 * SECURITY: every real access decision is re-derived here from the
 * caller's own already-verified Firebase session (`requireSubAccountMember`,
 * the same helper every other staff-scoped route in this codebase uses) —
 * never trusted from a client-supplied subAccountId/role. This function
 * grants nothing on its own; it only resolves "does this already-proven
 * staff identity have a legitimate Member identity in this sub-account,"
 * creating one via `ensureMember` (idempotent, existing infrastructure)
 * when it doesn't exist yet.
 */

export interface StaffBridgeResult {
  member: Member;
  callerEmail: string;
}

export type StaffBridgeOutcome =
  | { ok: true; result: StaffBridgeResult }
  | { ok: false; status: number; error: string };

/**
 * Resolve (or provision) the Member identity for an already-authenticated
 * staff caller entitled to `subAccountId`.
 *
 * Deliberately passes NO displayName/phone/address to `ensureMember` — an
 * EXISTING Member's own Community profile (display name, avatar, bio,
 * points, purchases, existing memberships, existing passwordHash) must
 * never be touched by this bridge; it is establishing authentication/
 * entitlement, not resetting the Member. `ensureMember`'s own patch logic
 * only overwrites a field when a non-empty value is explicitly passed AND
 * differs from what's stored — passing nothing means it can only ever
 * find-or-create, never patch. `ensureMember` also already calls
 * `ensurePersonLinkForMember` internally (idempotent, no-op once linked),
 * so the personId side of this is already covered without a second call
 * here.
 */
export async function resolveMemberForStaffBridge(
  request: Request,
  subAccountId: string,
): Promise<StaffBridgeOutcome> {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) {
    // requireSubAccountMember returns a NextResponse (already the right
    // shape: 401 not authenticated, 403 not entitled, 404 sub-account
    // missing) when access is denied — surface its status/message rather
    // than re-deriving one.
    const body = (await access.json().catch(() => ({}))) as { error?: string };
    return { ok: false, status: access.status, error: body.error ?? "Not authorized" };
  }
  if (!access.email) {
    return { ok: false, status: 400, error: "Staff account has no email on file" };
  }

  const member = await ensureMember({
    subAccountId,
    email: access.email,
    source: "staff-bridge",
  });

  return { ok: true, result: { member, callerEmail: access.email } };
}
