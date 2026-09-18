import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAgencyCourseOffer } from "@/lib/server/agency-course-offer-service";
import { AgencyOfferPurchaseCompleteStatus } from "./purchase-complete-status";

export const dynamic = "force-dynamic";

/** Stripe embedded Checkout's `return_url` lands here after a successful
 *  charge. Mirrors /offer/[saId]/[offerId]/purchase-complete/page.tsx. */
export default async function AgencyOfferPurchaseCompletePage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = await params;

  // Defensive fallback — shouldn't happen, since /signup sets the session
  // cookie before ever redirecting into Stripe.
  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`/offer/agency/${offerId}/purchase-complete`)}`);

  const agencyId = await resolveFirstAgencyId();
  const offer = agencyId ? await getAgencyCourseOffer(agencyId, offerId) : null;
  const firstCourseId = offer?.courseIds[0] ?? null;

  return <AgencyOfferPurchaseCompleteStatus offerId={offerId} firstCourseId={firstCourseId} />;
}
