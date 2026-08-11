import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import LeaderboardsPage from "@/app/c/[saId]/[groupSlug]/leaderboards/page";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain leaderboard: yourdomain.com/communities/{slug}/leaderboard.
 * Singular in the public URL by naming convention; delegates to the opaque
 * (plural-named) `/leaderboards` page's component.
 */
export default async function CustomDomainLeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupSlug: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return LeaderboardsPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
    searchParams,
  });
}
