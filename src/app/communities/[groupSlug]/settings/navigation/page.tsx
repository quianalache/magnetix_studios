import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityNavigationSettingsPage from "@/app/c/[saId]/[groupSlug]/settings/navigation/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain Navigation settings page: yourdomain.com/communities/{slug}/settings/navigation. */
export default async function CustomDomainNavigationSettingsPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunityNavigationSettingsPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
