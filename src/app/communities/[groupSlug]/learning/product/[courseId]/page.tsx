import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityEmbeddedProductCoursePage from "@/app/c/[saId]/[groupSlug]/classroom/product/[courseId]/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain mirror for a linked canonical Course homepage. */
export default async function CustomDomainEmbeddedProductCoursePage({
  params,
}: {
  params: Promise<{ groupSlug: string; courseId: string }>;
}) {
  const { groupSlug, courseId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunityEmbeddedProductCoursePage({
    params: Promise.resolve({ saId: sub.id, groupSlug, courseId }),
  });
}
