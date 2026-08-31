import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

/**
 * Read-only, tenant-facing feature-gate status (2026-08-30 "Community is
 * locked" false-lock fix). Every client-rendered gated page (Community,
 * Courses, and their siblings) previously decided its "locked" state
 * PURELY from `SubAccountProvider`'s live client Firestore `onSnapshot`
 * listener — which itself depends on the CLIENT Firebase Auth SDK's own
 * local session, a separate, less durable thing than the server-verified
 * `__session` cookie every Server Component/API route already trusts. Any
 * gap between those two (client Auth not yet rehydrated, a stalled/errored
 * Firestore listener, browser storage partitioning, etc.) left the gated
 * page stuck showing "locked" for a sub-account that is actually fully
 * entitled — reproduced live: `communityEnabledByAgency` and
 * `standaloneCoursesEnabledByAgency` were both `true` in Firestore the
 * whole time, but the client-only listener never delivered that value.
 *
 * This route gives those pages a second, independent, server-verified
 * source of truth (same Admin-SDK read `getCommunityGate`/
 * `standalone-courses/gate.ts` already use for the REAL access
 * enforcement) to fall back to — not a new gate, not a looser one, the
 * exact same `subAccounts/{id}` document read through the exact same
 * field names. Auth: any real member of the sub-account (not
 * agency-owner-only — this is a read of your OWN sub-account's status,
 * unlike the agency-only PATCH at /api/agency/sub-accounts/[id]/
 * feature-gates that actually changes the gates).
 *
 * `broadcastsEnabled`/`aiSuiteEnabled` added 2026-08-31 (SaaS QA pass) so
 * the Broadcasts and Workspace Assistant pages could adopt this same
 * resilient-gate pattern — those two pages previously had no page-level
 * gate check at all (only their underlying send/chat routes enforced the
 * gate), so a direct URL visit rendered the full feature regardless of
 * entitlement.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const data = snap.data() ?? {};

  return NextResponse.json({
    ok: true,
    communityEnabled: data.communityEnabledByAgency === true,
    standaloneCoursesEnabled: data.standaloneCoursesEnabledByAgency === true,
    labsEnabled: data.labsEnabledByAgency === true,
    getLeadsEnabled: data.getLeadsEnabledByAgency === true,
    socialPlannerEnabled: data.socialPlannerEnabledByAgency === true,
    broadcastsEnabled: data.broadcastsEnabledByAgency === true,
    aiSuiteEnabled: data.aiSuiteEnabledByAgency === true,
  });
}
