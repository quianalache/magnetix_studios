import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import CourseIndexPage from "@/app/c/[saId]/[groupSlug]/classroom/[courseId]/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain course index: yourdomain.com/communities/{slug}/learning/{courseId}. */
export default async function CustomDomainCourseIndexPage({
  params,
}: {
  params: Promise<{ groupSlug: string; courseId: string }>;
}) {
  const { groupSlug, courseId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return CourseIndexPage({
    params: Promise.resolve({ saId: sub.id, groupSlug, courseId }),
  });
}
