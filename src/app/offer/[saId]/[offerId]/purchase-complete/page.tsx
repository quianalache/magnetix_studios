import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/community/member-session";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { resolveSpaceIdentifier } from "@/lib/server/space-slug-service";
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
  const firstCourseId = offer?.courseIds[0] ?? null;
  // Branded Space URLs (2026-09-16): resolve the canonical slug here so
  // the post-checkout bridge lands the buyer on the pretty Space URL —
  // `saId` here is always the real subAccountId already (this route is
  // only ever reached via Stripe's own return_url, never customer-typed),
  // so this is a plain lookup, not a slug-or-id resolution.
  const resolved = await resolveSpaceIdentifier(saId);

  return (
    <PurchaseCompleteStatus
      saId={saId}
      spaceSlug={resolved?.canonicalSlug ?? saId}
      offerId={offerId}
      firstCourseId={firstCourseId}
    />
  );
}
