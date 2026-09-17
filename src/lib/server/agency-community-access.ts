import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
  type AgencyGroupMemberRoster,
} from "@/lib/server/community-agency-service";

/**
 * Real Agency Community member access (2026-09-17) — the security gate
 * every `/api/agency/community/[groupId]/**` route that a real member
 * (not just the agency owner) is allowed to reach now calls, instead of
 * (or in addition to) `requireAgencyOwnerAny`.
 *
 * Mirrors `/api/my/enter`'s load-bearing pattern exactly: verify the
 * caller's identity, then INDEPENDENTLY re-derive a real, persisted
 * relationship doc scoped by that identity's own id — never trust a
 * client-supplied claim of membership. Here that means: verify `mm_session`
 * -> look up `agencies/{agencyId}/communityGroups/{groupId}/members` for a
 * doc whose `personId` matches -> only proceed if it exists and isn't
 * `"removed"`. A `"pending"` membership is activated on this exact call
 * (the first time the check succeeds IS the first real entry), never
 * before.
 *
 * The agency owner keeps trying `requireAgencyOwnerAny` FIRST and always
 * wins that check when it succeeds — this never weakens or bypasses the
 * owner's existing, unrelated admin access.
 *
 * Isolation: this can only ever grant access to the ONE `(agencyId,
 * groupId)` pair passed in. It never grants access to a Quiana LaChé (or
 * any other sub-account) Community, tenant CRM data, or a different
 * Agency community this exact personId isn't independently a member of.
 */
export type AgencyCommunityCaller =
  | { kind: "owner"; uid: string; agencyId: string }
  | {
      kind: "member";
      personId: string;
      email: string;
      agencyId: string;
      membership: AgencyGroupMemberRoster;
    };

export async function resolveAgencyCommunityCaller(
  request: Request,
  groupId: string,
): Promise<AgencyCommunityCaller | NextResponse> {
  const ownerCaller = await requireAgencyOwnerAny(request);
  if (!(ownerCaller instanceof NextResponse)) {
    return { kind: "owner", uid: ownerCaller.uid, agencyId: ownerCaller.agencyId! };
  }

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return NextResponse.json(
      { error: "You don't have access to this community" },
      { status: 403 },
    );
  }

  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
    membership.status = "active";
  }

  return {
    kind: "member",
    personId: person.id,
    email: person.primaryEmail,
    agencyId,
    membership,
  };
}

/** Member-friendly display name — the roster's own captured name (set at
 *  invite time), falling back to the email's local-part. Never a Firebase
 *  Auth lookup (a Person has no such account) and never anything read from
 *  a sub-account. */
export function agencyMemberDisplayName(membership: AgencyGroupMemberRoster): string {
  return membership.displayName?.trim() || membership.email.split("@")[0] || "Member";
}

/**
 * Agency-WIDE Person auth for DMs (2026-09-17) — DM eligibility is never
 * one specific community's concern (mirrors tenant's own `requireMemberApi
 * (saId)`, which is sub-account-wide, not group-scoped): this only proves
 * "a real, signed-in Person" — the actual "can this Person message that
 * Person" security boundary is enforced per-operation by
 * `canDm`/`shareAnAgencyGroup` in agency-community-dm-service.ts (which
 * independently re-derives a real active roster membership for both
 * sides), never by this gate alone. The agency owner does not participate
 * in Agency Community DMs in this pass — they authenticate via Firebase,
 * not a Person, and no fake Member/Person identity is invented for them.
 */
export async function requireAgencyPerson(): Promise<
  { person: { id: string; primaryEmail: string }; agencyId: string } | NextResponse
> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return { person, agencyId };
}
