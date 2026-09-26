import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { territoryGate } from "@/lib/auth/territory-filter";
import type { Deal } from "@/types/deals";

type Access = Exclude<
  Awaited<ReturnType<typeof requireSubAccountMember>>,
  NextResponse
>;

export interface DealRouteContext {
  access: Access;
  deal: Deal;
  isAdmin: boolean;
}

/**
 * Shared guard for the per-deal routes (Deal Details notes + activity,
 * Multiple Pipelines 2026-09-25). Mirrors `requireContactRoute`: loads the
 * deal, requires an active member (or admin) of the deal's sub-account,
 * then applies the territory gate the Firestore rules apply to the deal
 * doc. 404 for a missing deal before any auth detail leaks.
 */
export async function requireDealRoute(
  request: Request,
  dealId: string,
  opts: { admin?: boolean } = {},
): Promise<DealRouteContext | NextResponse> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(dealId)) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  const snap = await getAdminDb().doc(`deals/${dealId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  const deal = { id: snap.id, ...(snap.data() as Omit<Deal, "id">) } as Deal;
  if (!deal.subAccountId) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  const access = opts.admin
    ? await requireSubAccountAdmin(request, deal.subAccountId)
    : await requireSubAccountMember(request, deal.subAccountId);
  if (access instanceof NextResponse) return access;

  const gate = await territoryGate(access, deal.territoryId ?? null);
  if (gate) return gate;

  return {
    access,
    deal,
    isAdmin:
      access.subAccountRole === "admin" ||
      access.subAccountRole === "agencyOwner",
  };
}
