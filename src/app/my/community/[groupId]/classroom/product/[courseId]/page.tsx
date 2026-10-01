import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAgencyGroupById, getAgencyMembershipForPerson } from "@/lib/server/community-agency-service";
import { EmbeddedAgencyProductCourse } from "@/components/community/classroom/embedded-agency-product-course";
import { isStartLearningRequest } from "@/lib/standalone-courses/course-navigation";

export const dynamic = "force-dynamic";

export default async function MyAgencyEmbeddedProductCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; courseId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupId, courseId } = await params;
  const catalog = `/my/community/${groupId}/classroom`;
  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`${catalog}/product/${courseId}`)}`);
  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) notFound();
  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") notFound();
  return EmbeddedAgencyProductCourse({
    agencyId,
    groupId,
    courseId,
    group,
    personId: person.id,
    membership,
    linkBase: { saId: "", pretty: false, agencyGroupId: groupId, agencyMemberView: true },
    groupSlug: group.slug,
    catalogHref: catalog,
    isStartLearning: isStartLearningRequest(await searchParams),
  });
}
