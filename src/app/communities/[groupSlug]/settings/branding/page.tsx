import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityBrandingSettingsPage from "@/app/c/[saId]/[groupSlug]/settings/branding/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain Branding settings page: yourdomain.com/communities/{slug}/settings/branding. */
export default async function CustomDomainBrandingSettingsPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunityBrandingSettingsPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
