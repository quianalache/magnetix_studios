import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CommunityEmbeddedProductLessonPage from "@/app/c/[saId]/[groupSlug]/classroom/product/[courseId]/[lessonId]/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain mirror: yourdomain.com/communities/{slug}/learning/product/{courseId}/{lessonId}. */
export default async function CustomDomainEmbeddedProductLessonPage({
  params,
}: {
  params: Promise<{
    groupSlug: string;
    courseId: string;
    lessonId: string;
  }>;
}) {
  const { groupSlug, courseId, lessonId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CommunityEmbeddedProductLessonPage({
    params: Promise.resolve({ saId: sub.id, groupSlug, courseId, lessonId }),
  });
}
