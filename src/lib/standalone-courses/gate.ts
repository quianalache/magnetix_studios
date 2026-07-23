import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Agency-level gate for Standalone Courses, mirroring the Community gate
 * pattern (`src/lib/community/gate.ts`). Read `standaloneCoursesEnabledByAgency`
 * with strict `=== true` so legacy/undefined docs stay locked.
 *
 * Deliberately NOT coupled to `communityEnabledByAgency` — an agency can
 * enable one without the other, since standalone courses are independent of
 * Community by design.
 *
 * This guard MUST wrap every standalone-course API route AND every public
 * `/course/*` page — not just the dashboard sidebar.
 */
export interface StandaloneCoursesGate {
  subAccountId: string;
  agencyId: string;
  ownerUid: string;
  enabled: boolean;
}

export async function getStandaloneCoursesGate(
  subAccountId: string,
): Promise<StandaloneCoursesGate | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    subAccountId,
    agencyId: (data.agencyId as string) ?? "",
    ownerUid: (data.createdByUid as string) ?? "",
    enabled: data.standaloneCoursesEnabledByAgency === true,
  };
}
