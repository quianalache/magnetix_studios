import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import {
  deleteCourseOfferServerSide,
  updateCourseOfferServerSide,
  type CourseOfferPatch,
} from "@/lib/server/course-offer-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id: subAccountId, offerId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: CourseOfferPatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (patch.visibility === "published" && patch.courseIds?.length === 0) {
    return NextResponse.json(
      { error: "Attach at least one product before publishing" },
      { status: 400 },
    );
  }
  await updateCourseOfferServerSide({ subAccountId, offerId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id: subAccountId, offerId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteCourseOfferServerSide({ subAccountId, offerId });
  return NextResponse.json({ ok: true });
}
