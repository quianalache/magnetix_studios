import { notFound } from "next/navigation";
import { requireOfferPageAccess } from "@/lib/course-offers/offer-access";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { hasPaidCourseOffer } from "@/lib/server/course-offer-purchase-service";
import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { OfferSalesPageView } from "@/components/course-offers/offer-sales-page-view";
import type { CrossSellTargetInfo } from "@/components/standalone-courses/theme-blocks";

export const dynamic = "force-dynamic";

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/**
 * Public Offer landing/checkout page — server-rendered via the Admin SDK,
 * using the same Course Theme system Standalone Courses use (see
 * `OfferSalesPageView`), so an Offer's checkout page gets the same
 * colors/fonts/header/hero/body/sidebar customization instead of a bare-
 * bones fixed layout. Existing single-course sales pages are untouched;
 * this is additive.
 */
export default async function OfferPage({
  params,
}: {
  params: Promise<{ saId: string; offerId: string }>;
}) {
  const { saId, offerId } = await params;

  const access = await requireOfferPageAccess(saId, offerId);
  if (access.kind === "notFound") notFound();
  const { offer, member } = access;
  const theme = offer.theme;

  const courses = await Promise.all(
    offer.courseIds.map((id) => getStandaloneCourse(saId, id)),
  );
  const validCourses = courses.filter((c): c is NonNullable<typeof c> => !!c);
  const includedCourses = validCourses.map((c) => ({
    id: c.id,
    title: c.title,
    coverUrl: c.coverUrl,
  }));

  // Batch-resolve every Cross Sell block's target offer, same pattern as
  // the Standalone Course sales page.
  const targetIds = new Set<string>();
  for (const block of [...theme.body, ...theme.sidebar]) {
    if (block.type === "crossSell" && block.targetOfferId) {
      targetIds.add(block.targetOfferId);
    }
  }
  const crossSellTargets = new Map<string, CrossSellTargetInfo>();
  await Promise.all(
    Array.from(targetIds).map(async (id) => {
      const target = await getCourseOffer(saId, id);
      if (target) {
        crossSellTargets.set(id, {
          id: target.id,
          title: target.title,
          priceCents: target.priceCents,
          currency: target.currency,
          type: target.type,
          visibility: target.visibility,
        });
      }
    }),
  );

  const priceLabel =
    offer.priceTextOverride ||
    (offer.type === "free"
      ? "Free"
      : offer.type === "recurring"
        ? `${formatPrice(offer.priceCents, offer.currency)} / ${offer.recurringInterval ?? "month"}`
        : formatPrice(offer.priceCents, offer.currency));

  const descriptionHtml = sanitizeLessonHtml(offer.descriptionHtml);
  const alreadyPurchased = member
    ? await hasPaidCourseOffer(saId, offerId, member.id)
    : false;

  return (
    <OfferSalesPageView
      saId={saId}
      offerId={offerId}
      offer={offer}
      theme={theme}
      priceLabel={priceLabel}
      descriptionHtml={descriptionHtml}
      includedCourses={includedCourses}
      member={member}
      alreadyPurchased={alreadyPurchased}
      firstCourseId={offer.courseIds[0] ?? null}
      crossSellTargets={crossSellTargets}
      interactive
    />
  );
}
