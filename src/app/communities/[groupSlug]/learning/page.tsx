import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import ClassroomCatalogPage from "@/app/c/[saId]/[groupSlug]/classroom/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain classroom catalog: yourdomain.com/communities/{slug}/learning. */
export default async function CustomDomainLearningPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return ClassroomCatalogPage({
    params: Promise.resolve({ saId: sub.id, groupSlug }),
  });
}
