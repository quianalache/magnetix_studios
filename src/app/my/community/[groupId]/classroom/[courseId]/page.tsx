import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAgencyMembershipForPerson } from "@/lib/server/community-agency-service";
import { getAgencyCourseTree } from "@/lib/server/agency-community-classroom-service";

export const dynamic = "force-dynamic";

/** Course index — redirect to the first published lesson, or back to the
 *  catalog when the course is empty. Mirrors the tenant course index page. */
export default async function MyAgencyCourseIndexPage({
  params,
}: {
  params: Promise<{ groupId: string; courseId: string }>;
}) {
  const { groupId, courseId } = await params;
  const catalog = `/my/community/${groupId}/classroom`;

  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`${catalog}/${courseId}`)}`);

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) redirect(catalog);
  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") redirect(catalog);

  const tree = await getAgencyCourseTree({ agencyId, groupId, courseId, includeUnpublished: false });
  const first = tree?.lessons[0];
  if (!tree || !tree.course.published || !first) redirect(catalog);
  redirect(`${catalog}/${courseId}/${first.id}`);
}
