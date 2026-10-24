import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/community/member-session";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import { getSubAccountPublicName } from "@/lib/server/public-identity";
import { publicSurfaceProps } from "@/components/public/public-shell";
import { PurchaseCompleteStatus } from "./purchase-complete-status";

export const dynamic = "force-dynamic";

/**
 * Stripe embedded Checkout's `return_url` lands here after a successful
 * charge. Access itself is granted asynchronously by the webhook, not
 * synchronously with this redirect — the client component polls until it
 * lands, then drops the buyer straight into the classroom.
 */
export default async function PurchaseCompletePage({
  params,
}: {
  params: Promise<{ saId: string; courseId: string }>;
}) {
  const { saId, courseId } = await params;

  // Defensive fallback — shouldn't happen, since /signup sets the session
  // cookie before ever redirecting into Stripe.
  const member = await getCurrentMember(saId);
  if (!member) redirect(`/course/${saId}/login?course=${courseId}`);

  // Same brand source as the course's own sales page: its theme's button colour.
  const [course, businessName] = await Promise.all([
    getStandaloneCourse(saId, courseId).catch(() => null),
    getSubAccountPublicName(saId).catch(() => null),
  ]);
  const surface = publicSurfaceProps({ kind: "tenant", brand: { name: businessName ?? "", primary: course?.theme?.hero?.buttonColor ?? null } });
  return (
    <div {...surface}>
      <PurchaseCompleteStatus saId={saId} courseId={courseId} />
    </div>
  );
}
