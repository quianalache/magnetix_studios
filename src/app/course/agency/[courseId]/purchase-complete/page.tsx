import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { AgencyPurchaseCompleteStatus } from "./purchase-complete-status";

export const dynamic = "force-dynamic";

/** Stripe embedded Checkout's `return_url` lands here after a successful
 *  charge. Mirrors /course/[saId]/[courseId]/purchase-complete/page.tsx. */
export default async function AgencyPurchaseCompletePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  // Defensive fallback — shouldn't happen, since /signup sets the session
  // cookie before ever redirecting into Stripe.
  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`/course/agency/${courseId}/purchase-complete`)}`);

  return <AgencyPurchaseCompleteStatus courseId={courseId} />;
}
