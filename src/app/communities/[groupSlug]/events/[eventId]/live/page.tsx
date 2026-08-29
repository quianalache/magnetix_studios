import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityEventLivePage from "@/app/c/[saId]/[groupSlug]/events/[eventId]/live/page";

export const dynamic = "force-dynamic";

export default async function CustomDomainEventLivePage({
  params,
}: {
  params: Promise<{ groupSlug: string; eventId: string }>;
}) {
  const { groupSlug, eventId } = await params;
  const sub = await getSubAccountByCustomDomain((await headers()).get("host"));
  if (!sub) notFound();
  return CommunityEventLivePage({
    params: Promise.resolve({ saId: sub.id, groupSlug, eventId }),
  });
}
