import { notFound } from "next/navigation";
import { requireOfferPageAccess } from "@/lib/course-offers/offer-access";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { EnrollOfferModal } from "./enroll-modal";

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

const BRAND = "#202124";

/**
 * Public Offer landing/checkout page — simpler than the Standalone Course
 * sales page (no theme editor for Offers in this pass), server-rendered via
 * the Admin SDK. Shows the bundle of attached courses plus the enroll CTA.
 * Existing single-course sales pages are untouched; this is additive.
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

  const courses = await Promise.all(
    offer.courseIds.map((id) => getStandaloneCourse(saId, id)),
  );
  const validCourses = courses.filter((c): c is NonNullable<typeof c> => !!c);

  const priceLabel =
    offer.priceTextOverride ||
    (offer.type === "free"
      ? "Free"
      : offer.type === "recurring"
        ? `${formatPrice(offer.priceCents, offer.currency)} / ${offer.recurringInterval ?? "month"}`
        : formatPrice(offer.priceCents, offer.currency));

  const descriptionHtml = sanitizeLessonHtml(offer.descriptionHtml);

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-[#F8F7F5] px-4 py-10">
      {offer.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={offer.thumbnailUrl}
          alt=""
          className="mb-6 aspect-video w-full rounded-xl object-cover"
        />
      )}
      <h1 className="text-2xl font-semibold text-[#202124]">{offer.title}</h1>
      <p className="mt-1 text-lg font-medium text-[#202124]">{priceLabel}</p>

      {descriptionHtml && (
        <div
          className="prose prose-sm mt-4 max-w-none text-[#202124]"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      <div className="mt-6 space-y-2">
        <p className="text-sm font-medium text-[#909090] uppercase tracking-wide">
          What&apos;s included
        </p>
        {validCourses.map((course) => (
          <div
            key={course.id}
            className="flex items-center gap-3 rounded-lg border border-[#E4E4E4] bg-white p-3"
          >
            {course.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.coverUrl}
                alt=""
                className="h-12 w-20 shrink-0 rounded-md object-cover"
              />
            )}
            <span className="text-sm font-medium text-[#202124]">
              {course.title}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <EnrollOfferModal
          saId={saId}
          offerId={offerId}
          type={offer.type}
          priceLabel={priceLabel}
          brand={BRAND}
          member={member}
        />
      </div>
    </div>
  );
}
