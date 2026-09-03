import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import InterceptedPostDetailModal from "@/app/c/[saId]/[groupSlug]/@modal/(.)community/[postId]/page";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain intercepted post modal —
 * yourdomain.com/communities/{slug}/home/{postId}, opened via client-side
 * navigation from the pretty feed. Same thin-delegation pattern the
 * existing full-page mirror (home/[postId]/page.tsx) and feed mirror
 * (home/page.tsx) already use: resolve `saId` from the custom domain,
 * then hand off to the SAME intercepted-modal component the opaque route
 * uses — not a second modal implementation. A hard load or refresh always
 * hits the real page one directory up instead (Next's intercepting-route
 * convention), which resolves independently via its own custom-domain
 * lookup.
 */
export default async function CustomDomainInterceptedPostDetailModal({
  params,
}: {
  params: Promise<{ groupSlug: string; postId: string }>;
}) {
  const { groupSlug, postId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return InterceptedPostDetailModal({
    params: Promise.resolve({ saId: sub.id, groupSlug, postId }),
  });
}
