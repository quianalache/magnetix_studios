import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * Staff guard for Course Offers admin routes. Offers is a sub-feature of
 * Standalone Courses, not separately gated — same
 * `standaloneCoursesEnabledByAgency` flag as
 * `requireStandaloneCoursesStaff` (`src/lib/standalone-courses/staff-guard.ts`).
 */
export async function requireCourseOffersStaff(
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
