import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityFeedPage from "@/app/c/[saId]/[groupSlug]/community/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain feed: yourdomain.com/communities/{slug}/home. */
export default async function CustomDomainHomePage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunityFeedPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
