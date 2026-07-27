"use client";

import { useMemo } from "react";
import { OfferSalesPageView } from "@/components/course-offers/offer-sales-page-view";
import type { CrossSellTargetInfo } from "@/components/standalone-courses/theme-blocks";
import type { CourseOffer } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { CourseTheme } from "@/types/course-theme";
import { formatCurrency } from "@/lib/format";

/**
 * Live preview pane for the Offer theme editor — same idea as
 * `ThemeLivePreview` for courses, renders the SAME `OfferSalesPageView` the
 * real public page uses, fed by in-progress local state. No curriculum
 * subscription needed (an Offer has no lessons of its own).
 */
export function OfferThemeLivePreview({
  saId,
  offerId,
  offer,
  theme,
  allCourses,
  otherOffers,
}: {
  saId: string;
  offerId: string;
  offer: CourseOffer;
  theme: CourseTheme;
  /** Used only to resolve `offer.courseIds` into the "What's included" list
   *  — unrelated to Cross Sell, which now targets Offers (see `otherOffers`). */
  allCourses: StandaloneCourse[];
  otherOffers: CourseOffer[];
}) {
  const includedCourses = useMemo(
    () =>
      offer.courseIds
        .map((id) => allCourses.find((c) => c.id === id))
        .filter((c): c is StandaloneCourse => !!c)
        .map((c) => ({ id: c.id, title: c.title, coverUrl: c.coverUrl })),
    [offer.courseIds, allCourses],
  );

  const crossSellTargets = useMemo(() => {
    const map = new Map<string, CrossSellTargetInfo>();
    for (const o of otherOffers) {
      map.set(o.id, {
        id: o.id,
        title: o.title,
        priceCents: o.priceCents,
        currency: o.currency,
        type: o.type,
        visibility: o.visibility,
      });
    }
    return map;
  }, [otherOffers]);

  const priceLabel =
    offer.priceTextOverride ||
    (offer.type === "free"
      ? "Free"
      : offer.type === "recurring"
        ? `${formatCurrency((offer.priceCents ?? 0) / 100, offer.currency ?? "USD")} / ${offer.recurringInterval ?? "month"}`
        : formatCurrency((offer.priceCents ?? 0) / 100, offer.currency ?? "USD"));

  // Staff's own already-authored content, viewed only by themselves in their
  // own dashboard session — same reasoning as the course live preview for
  // skipping the server-only HTML sanitizer here.
  const descriptionHtml = offer.descriptionHtml;

  return (
    <OfferSalesPageView
      saId={saId}
      offerId={offerId}
      offer={offer}
      theme={theme}
      priceLabel={priceLabel}
      descriptionHtml={descriptionHtml}
      includedCourses={includedCourses}
      member={null}
      alreadyPurchased={false}
      firstCourseId={null}
      crossSellTargets={crossSellTargets}
      interactive={false}
    />
  );
}
