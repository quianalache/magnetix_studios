import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import LessonPlayerPage from "@/app/c/[saId]/[groupSlug]/classroom/[courseId]/[lessonId]/page";

export const dynamic = "force-dynamic";

/** Human-readable custom-domain lesson player: yourdomain.com/communities/{slug}/learning/{courseId}/{lessonId}. */
export default async function CustomDomainLessonPlayerPage({
  params,
}: {
  params: Promise<{ groupSlug: string; courseId: string; lessonId: string }>;
}) {
  const { groupSlug, courseId, lessonId } = await params;
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return LessonPlayerPage({
    params: Promise.resolve({ saId: sub.id, groupSlug, courseId, lessonId }),
  });
}
