import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityPlansPage from "@/app/c/[saId]/[groupSlug]/plans/page";

export const dynamic = "force-dynamic";

export default async function CustomDomainPlansPage({ params }: { params: Promise<{ groupSlug: string }> }) {
  const { groupSlug } = await params;
  const sub = await getSubAccountByCustomDomain((await headers()).get("host"));
  if (!sub) notFound();
  return CommunityPlansPage({ params: Promise.resolve({ saId: sub.id, groupSlug }) });
}
