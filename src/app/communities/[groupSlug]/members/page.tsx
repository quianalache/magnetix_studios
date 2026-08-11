import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import MembersPage from "@/app/c/[saId]/[groupSlug]/members/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain members directory: yourdomain.com/communities/{slug}/members. */
export default async function CustomDomainMembersPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return MembersPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
