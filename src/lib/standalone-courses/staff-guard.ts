import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * Staff guard for Standalone Courses admin routes: requires a sub-account
 * admin AND that the agency has Standalone Courses enabled. Mirrors
 * `src/lib/community/staff-guard.ts`'s `requireCommunityStaff`.
 */
export async function requireStandaloneCoursesStaff(
  request: Request,
  subAccountId: string,
) {
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const sub = subSnap.data();
  if (sub?.standaloneCoursesEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Standalone Courses is disabled for this sub-account." },
      { status: 403 },
    );
  }
  return {
    ...access,
    resolvedAgencyId: (sub.agencyId as string) ?? access.agencyId ?? "",
  };
}
