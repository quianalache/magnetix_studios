import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listAgencyStandaloneCoursePurchases } from "@/lib/server/agency-standalone-course-purchase-service";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Owner-only: list purchases for one Agency Standalone Course, with the
 *  buyer's email/name resolved from their Person record (the agency has
 *  no tenant Member to look up instead — see person-session.ts). */
export async function GET(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;

  const purchases = await listAgencyStandaloneCoursePurchases(caller.agencyId!, courseId);
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
