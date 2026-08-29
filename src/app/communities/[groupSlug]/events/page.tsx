import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityEventsPage from "@/app/c/[saId]/[groupSlug]/events/page";

export const dynamic = "force-dynamic";

export default async function CustomDomainEventsPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const sub = await getSubAccountByCustomDomain((await headers()).get("host"));
  if (!sub) notFound();
  return CommunityEventsPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
