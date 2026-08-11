import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityHomePage from "@/app/c/[saId]/page";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain community entry: yourdomain.com/communities.
 * Delegates to the opaque `/c/{saId}` page's component — see
 * `src/app/booking/[slug]/page.tsx` for the fuller rationale on this pattern.
 */
export default async function CustomDomainCommunityEntry() {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunityHomePage({ params: Promise.resolve({ saId: sub.id }) });
}
