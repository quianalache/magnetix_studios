import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import { listOfferCommunityOptionsServerSide } from "@/lib/server/offer-community-access-service";

export const dynamic = "force-dynamic";

/** Workspace-scoped Community + Membership Level picker options for Offers. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  return NextResponse.json({ ok: true, communities: await listOfferCommunityOptionsServerSide(subAccountId) });
}
