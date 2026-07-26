import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/community/member-session";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { PurchaseCompleteStatus } from "./purchase-complete-status";

export const dynamic = "force-dynamic";

/**
 * Stripe embedded Checkout's `return_url` lands here after a successful
 * charge. Mirrors `src/app/course/[saId]/[courseId]/purchase-complete/page.tsx`.
 */
export default async function OfferPurchaseCompletePage({
  params,
}: {
  params: Promise<{ saId: string; offerId: string }>;
}) {
  const { saId, offerId } = await params;

  const member = await getCurrentMember(saId);
  if (!member) redirect(`/course/${saId}/login`);

  const offer = await getCourseOffer(saId, offerId);
  const firstCourseId = offer?.courseIds[0] ?? "";

  return (
    <PurchaseCompleteStatus
      saId={saId}
      offerId={offerId}
      firstCourseId={firstCourseId}
    />
  );
}
