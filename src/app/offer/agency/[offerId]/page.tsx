import { notFound } from "next/navigation";
import { requireAgencyOfferPageAccess } from "@/lib/course-offers/agency-offer-access";
import { getAgencyStandaloneCourse } from "@/lib/server/agency-standalone-course-service";
import { hasPaidAgencyCourseOffer } from "@/lib/server/agency-course-offer-purchase-service";
import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { OfferSalesPageView } from "@/components/course-offers/offer-sales-page-view";

export const dynamic = "force-dynamic";

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/**
 * Public Agency Course Offer landing/checkout page — mirrors
 * /offer/[saId]/[offerId]/page.tsx. `saId="agency"` makes every internal
 * href OfferSalesPageView builds land on this route tree automatically;
 * `agencyScope` branches the enroll flow to the global Person identity.
 * No Booking/Project-Template bundling and no cross-sell blocks — genuine
 * missing-product dependencies at agency scope (see
 * agency-course-offer-service.ts).
 */
export default async function AgencyOfferPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = await params;
  const access = await requireAgencyOfferPageAccess(offerId);
  if (access.kind === "notFound") notFound();
  const { agencyId, offer, person } = access;
  const theme = offer.theme;

  const courses = await Promise.all(offer.courseIds.map((id) => getAgencyStandaloneCourse(agencyId, id)));
  const validCourses = courses.filter((c): c is NonNullable<typeof c> => !!c);
  const includedCourses = validCourses.map((c) => ({ id: c.id, title: c.title, coverUrl: c.coverUrl }));

  const priceLabel =
    offer.priceTextOverride ||
    (offer.type === "free"
      ? "Free"
      : offer.type === "recurring"
        ? `${formatPrice(offer.priceCents, offer.currency)} / ${offer.recurringInterval ?? "month"}`
        : formatPrice(offer.priceCents, offer.currency));

  const descriptionHtml = sanitizeLessonHtml(offer.descriptionHtml);
  const alreadyPurchased = person ? await hasPaidAgencyCourseOffer(agencyId, offerId, person.id) : false;

  return (
    <OfferSalesPageView
      saId="agency"
      offerId={offerId}
      agencyScope
      offer={{
        title: offer.title,
        type: offer.type,
        showRecentPurchasePopup: offer.showRecentPurchasePopup,
        thumbnailUrl: offer.thumbnailUrl,
        booking: offer.booking,
        projectTemplates: offer.projectTemplates,
        checkoutSettings: offer.checkoutSettings,
      }}
      theme={theme}
      priceLabel={priceLabel}
      descriptionHtml={descriptionHtml}
      includedCourses={includedCourses}
      member={person ? { email: person.primaryEmail, displayName: null, phone: null } : null}
      alreadyPurchased={alreadyPurchased}
      firstCourseId={offer.courseIds[0] ?? null}
      crossSellTargets={new Map()}
      interactive
    />
  );
}
