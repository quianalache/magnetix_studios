import CommunityEventDetailPage from "@/app/c/[saId]/[groupSlug]/events/[eventId]/page";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
export default async function PrettyCommunityEventDetailPage({
  params,
}: {
  params: Promise<{ groupSlug: string; eventId: string }>;
}) {
  const { groupSlug, eventId } = await params;
  const sub = await getSubAccountByCustomDomain((await headers()).get("host"));
  if (!sub) notFound();
  return CommunityEventDetailPage({
    params: Promise.resolve({ saId: sub.id, groupSlug, eventId }),
  });
}
