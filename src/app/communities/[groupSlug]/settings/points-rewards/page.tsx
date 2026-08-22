import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityPointsRewardsSettingsPage from "@/app/c/[saId]/[groupSlug]/settings/points-rewards/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain Points & Rewards settings page:
 *  yourdomain.com/communities/{slug}/settings/points-rewards. */
export default async function CustomDomainPointsRewardsSettingsPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunityPointsRewardsSettingsPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
