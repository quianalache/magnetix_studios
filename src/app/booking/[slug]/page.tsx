import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import PublicBookingPage from "@/app/b/[subAccountId]/[slug]/page";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain booking URL: yourdomain.com/booking/{slug}.
 * Only reachable via a Host that resolves to a sub-account with a VERIFIED
 * custom domain (see `getSubAccountByCustomDomain`) — the shared platform
 * domain keeps using the opaque `/b/{saId}/{slug}` route, since a bare
 * `/booking/{slug}` would be ambiguous across many sub-accounts there.
 *
 * Delegates straight to the existing opaque route's page component instead
 * of duplicating its render logic — this file's only job is resolving
 * "which sub-account owns this domain" before handing off. Any behavior
 * change to the booking page itself only needs to happen in one file.
 */
export default async function CustomDomainBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();

  return PublicBookingPage({
    params: Promise.resolve({ subAccountId: sub.id, slug }),
  });
}
