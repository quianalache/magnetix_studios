import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getRecentAgencyActivity } from "@/lib/server/agency-activity-service";

export const dynamic = "force-dynamic";

/**
 * Agency Home → Recent Activity. Owner-only read of the most recent real
 * billing lifecycle events (see agency-activity-service.ts) — sub-account
 * creation is merged in client-side from the subAccounts snapshot Agency
 * Home already holds, so this endpoint only covers what isn't otherwise
 * available to the client (billingEvents is a server-only collection).
 */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const items = await getRecentAgencyActivity(caller.agencyId!);
  return NextResponse.json({ items });
}
