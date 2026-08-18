import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunitySettingsPage from "@/app/c/[saId]/[groupSlug]/settings/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain settings page: yourdomain.com/communities/{slug}/settings. */
export default async function CustomDomainSettingsPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunitySettingsPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
