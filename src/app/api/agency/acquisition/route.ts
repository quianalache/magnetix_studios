import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getAcquisitionSummary } from "@/lib/server/acquisition-service";
import type { AgencyDoc } from "@/types/tenancy";

export const dynamic = "force-dynamic";

/**
 * Agency → Acquisition (Agency Acquisition Foundation, 2026-08-31). Owner-
 * only read of the computed summary — see `getAcquisitionSummary`'s doc
 * comment for exactly what's aggregated and which numbers are
 * browser-beacon estimates vs. authoritative.
 */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const agencySnap = await getAdminDb().doc(`agencies/${caller.agencyId}`).get();
  const agency = agencySnap.data() as Partial<AgencyDoc> | undefined;

  const summary = await getAcquisitionSummary(caller.agencyId!, {
    salesPageConfigured: !!agency?.primarySalesPageUrl,
  });

  return NextResponse.json(summary);
}
