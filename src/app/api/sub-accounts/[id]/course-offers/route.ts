import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import {
  buildClientProjectTemplateBundlesServerSide,
  createCourseOfferServerSide,
} from "@/lib/server/course-offer-service";
import type {
  CourseOfferBookingBundle,
  OfferType,
} from "@/types/course-offers";

export const dynamic = "force-dynamic";

/** Staff: create a Course Offer (quick-create — draft, expanded on the detail page). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    title?: string;
    courseIds?: string[];
    type?: OfferType;
    priceCents?: number | null;
    currency?: string | null;
    priceTextOverride?: string | null;
    booking?: CourseOfferBookingBundle | null;
    projectTemplateIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json(
      { error: "An offer title is required" },
      { status: 400 }
    );
  }
  const courseIds = Array.isArray(body.courseIds) ? body.courseIds : [];
  const projectTemplateIds = Array.isArray(body.projectTemplateIds)
    ? body.projectTemplateIds.filter(
        (id): id is string => typeof id === "string" && !!id
      )
    : [];
  let projectTemplates;
  try {
    projectTemplates = await buildClientProjectTemplateBundlesServerSide(
      subAccountId,
      projectTemplateIds
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
  const hasBooking = !!body.booking;
  if (courseIds.length === 0 && projectTemplates.length === 0 && !hasBooking) {
    return NextResponse.json(
      { error: "Attach at least one entitlement to the offer" },
      { status: 400 }
    );
  }

  const offer = await createCourseOfferServerSide({
    subAccountId,
    agencyId: access.resolvedAgencyId,
    title: body.title,
    courseIds,
    type: body.type,
    priceCents: body.priceCents ?? null,
    currency: body.currency ?? null,
    priceTextOverride: body.priceTextOverride ?? null,
    booking: body.booking ?? null,
    projectTemplates,
  });
  return NextResponse.json({ ok: true, offer });
}
