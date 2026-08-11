import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import ProfilePage from "@/app/c/[saId]/[groupSlug]/profile/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain profile editor: yourdomain.com/communities/{slug}/profile. */
export default async function CustomDomainProfilePage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return ProfilePage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
