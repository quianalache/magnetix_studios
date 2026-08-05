import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import { getCourseOfferBySlug } from "@/lib/server/course-offer-service";
import { getStandaloneCourseBySlug } from "@/lib/server/standalone-course-service";
import OfferPage from "@/app/offer/[saId]/[offerId]/page";
import CourseSalesPage from "@/app/course/[saId]/[courseId]/page";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain course/offer URL: yourdomain.com/courses/{slug}.
 * "Courses" in the URL covers BOTH sellable units this app has — Course
 * Offers (bundles, `/offer/{saId}/{offerId}`) and standalone single
 * courses (`/course/{saId}/{courseId}`) — since from a visitor's
 * perspective they're both just "a course page." Offers are tried first
 * since that's the more common thing actually linked/promoted (a course's
 * own auto-created companion offer, see `createStandaloneCourseServerSide`).
 *
 * Delegates to the existing opaque pages' components rather than
 * duplicating their render logic — see `src/app/booking/[slug]/page.tsx`
 * for the fuller rationale.
 */
export default async function CustomDomainCoursesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();

  const offer = await getCourseOfferBySlug(sub.id, slug);
  if (offer) {
    return OfferPage({
      params: Promise.resolve({ saId: sub.id, offerId: offer.id }),
    });
  }

  const course = await getStandaloneCourseBySlug(sub.id, slug);
  if (course) {
    return CourseSalesPage({
      params: Promise.resolve({ saId: sub.id, courseId: course.id }),
    });
  }

  notFound();
}
