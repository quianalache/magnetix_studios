import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import GroupAboutPage from "@/app/c/[saId]/[groupSlug]/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain group landing page: yourdomain.com/communities/{slug}/about. */
export default async function CustomDomainAboutPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return GroupAboutPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
