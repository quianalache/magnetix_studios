import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import {
  deleteCourseOfferUpsellServerSide,
  updateCourseOfferUpsellServerSide,
} from "@/lib/server/course-offer-upsell-service";
import type { OfferVisibility } from "@/types/course-offers";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string; upsellId: string }> },
) {
  const { id: subAccountId, offerId, upsellId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: { visibility?: OfferVisibility; targetOfferId?: string };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateCourseOfferUpsellServerSide({ subAccountId, offerId, upsellId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string; upsellId: string }> },
) {
  const { id: subAccountId, offerId, upsellId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteCourseOfferUpsellServerSide({ subAccountId, offerId, upsellId });
  return NextResponse.json({ ok: true });
}
