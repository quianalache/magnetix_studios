import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listAgencyCourseOfferPurchases } from "@/lib/server/agency-course-offer-purchase-service";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Owner-only: list purchases for one Agency Course Offer, with the
 *  buyer's email/name resolved from their Person record. */
export async function GET(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;

  const purchases = await listAgencyCourseOfferPurchases(caller.agencyId!, offerId);
  const personIds = Array.from(new Set(purchases.map((p) => p.memberId)));
  const people = await Promise.all(personIds.map((id) => getAdminDb().doc(`people/${id}`).get()));
  const buyerById = new Map(
    people.map((snap) => [
      snap.id,
      { email: (snap.data()?.primaryEmail as string | undefined) ?? "", displayName: (snap.data()?.displayName as string | undefined) ?? null },
    ]),
  );

  const rows = purchases.map((p) => ({
    ...p,
    buyer: buyerById.get(p.memberId) ?? { email: "", displayName: null },
  }));

  return NextResponse.json({ ok: true, purchases: rows });
}
