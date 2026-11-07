import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import {
  buildClientProjectTemplateBundlesServerSide,
  archiveCourseOfferServerSide,
  getCourseOffer,
  restoreCourseOfferServerSide,
  updateCourseOfferServerSide,
  type CourseOfferPatch,
} from "@/lib/server/course-offer-service";
import { validateOfferCommunityAccessServerSide } from "@/lib/server/offer-community-access-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> }
) {
  const { id: subAccountId, offerId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: CourseOfferPatch & { projectTemplateIds?: string[]; action?: unknown; communityAccess?: unknown };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Archive / restore (pre-Funnel safety): explicit actions, never a plain edit.
  if (patch.action === "archive") {
    const r = await archiveCourseOfferServerSide({ subAccountId, offerId, uid: access.uid });
    return r === "not_found" ? NextResponse.json({ error: "Offer not found" }, { status: 404 }) : NextResponse.json({ ok: true, visibility: "archived" });
  }
  if (patch.action === "restore") {
    const r = await restoreCourseOfferServerSide({ subAccountId, offerId });
    if (r === "not_found") return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (r === "not_archived") return NextResponse.json({ error: "This offer isn't archived." }, { status: 409 });
    return NextResponse.json({ ok: true, visibility: "draft" });
  }
  if (patch.action !== undefined) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (patch.visibility !== undefined && patch.visibility !== "draft" && patch.visibility !== "published") {
    return NextResponse.json({ error: "Use Archive to archive an offer." }, { status: 400 });
  }
  if (patch.visibility !== undefined) {
    const current = await getCourseOffer(subAccountId, offerId);
    if (current?.visibility === "archived") {
      return NextResponse.json({ error: "This offer is archived. Restore it before publishing." }, { status: 409 });
    }
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
  if (patch.communityAccess !== undefined) {
    const existing = await getCourseOffer(subAccountId, offerId);
    if (!existing) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (existing.systemManaged) {
      return NextResponse.json({ error: "System-managed Community pricing Offers cannot be edited as manual bundles." }, { status: 409 });
    }
    try {
      patch.communityAccess = await validateOfferCommunityAccessServerSide({
        subAccountId,
        entries: patch.communityAccess,
        existing: existing.communityAccess ?? [],
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid Community Access" }, { status: 400 });
    }
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
    const communityAccess = patch.communityAccess !== undefined ? patch.communityAccess : (existing.communityAccess ?? []);
    if (courseIds.length === 0 && projectTemplates.length === 0 && !booking && communityAccess.length === 0) {
      return NextResponse.json(
        { error: "Attach at least one entitlement before publishing" },
        { status: 400 }
      );
    }
  } else if (
    patch.courseIds?.length === 0 &&
    patch.projectTemplates?.length === 0 &&
    patch.booking === null &&
    (!Array.isArray(patch.communityAccess) || patch.communityAccess.length === 0)
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
  // DELETE archives (pre-Funnel safety). Offers are never hard-deleted: their
  // purchases, subscriptions and upsells must outlive them.
  const r = await archiveCourseOfferServerSide({ subAccountId, offerId, uid: access.uid });
  if (r === "not_found") return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: true });
}
