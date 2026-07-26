import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/community/member-session";
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

  return <PurchaseCompleteStatus saId={saId} courseId={courseId} />;
}
