import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import {
  buildClientProjectTemplateBundlesServerSide,
  deleteCourseOfferServerSide,
  getCourseOffer,
  updateCourseOfferServerSide,
  type CourseOfferPatch,
} from "@/lib/server/course-offer-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> }
) {
  const { id: subAccountId, offerId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: CourseOfferPatch & { projectTemplateIds?: string[] };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (Array.isArray(patch.projectTemplateIds)) {
    try {
      patch.projectTemplates =
        await buildClientProjectTemplateBundlesServerSide(
          subAccountId,
          patch.projectTemplateIds
        );
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Invalid client project template",
        },
        { status: 400 }
      );
    }
    delete patch.projectTemplateIds;
  }

  if (patch.visibility === "published") {
    const existing = await getCourseOffer(subAccountId, offerId);
    if (!existing) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }
    const courseIds = patch.courseIds ?? existing.courseIds;
    const projectTemplates =
      patch.projectTemplates ?? existing.projectTemplates;
    const booking =
      patch.booking !== undefined ? patch.booking : existing.booking;
    if (courseIds.length === 0 && projectTemplates.length === 0 && !booking) {
      return NextResponse.json(
        { error: "Attach at least one entitlement before publishing" },
        { status: 400 }
      );
    }
  } else if (
    patch.courseIds?.length === 0 &&
    patch.projectTemplates?.length === 0 &&
    patch.booking === null
  ) {
    return NextResponse.json(
      { error: "Attach at least one entitlement to the offer" },
      { status: 400 }
    );
  }
  await updateCourseOfferServerSide({ subAccountId, offerId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> }
) {
  const { id: subAccountId, offerId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteCourseOfferServerSide({ subAccountId, offerId });
  return NextResponse.json({ ok: true });
}
