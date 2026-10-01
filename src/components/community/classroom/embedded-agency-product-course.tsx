import { notFound, redirect } from "next/navigation";
import { communityLearningProductHref, type CommunityLinkBase } from "@/lib/community/routes";
import { CommunityShell } from "@/components/community/community-shell";
import { CourseHomeView } from "@/components/standalone-courses/course-home-view";
import {
  getAgencyStandaloneCourse,
  getAgencyStandaloneCourseTree,
  getAgencyStandaloneEnrollment,
  filterAgencyLessonsForEnrollment,
} from "@/lib/server/agency-standalone-course-service";
import { checkAgencyCourseEntitlementForPerson } from "@/lib/standalone-courses/agency-course-access";
import { getAgencyCourseOffer } from "@/lib/server/agency-course-offer-service";
import type { AuthorView, CommunityGroup } from "@/types/community";
import type { AgencyGroupMemberRoster } from "@/lib/server/community-agency-service";

export async function EmbeddedAgencyProductCourse(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  group: CommunityGroup;
  personId: string;
  membership: AgencyGroupMemberRoster;
  linkBase: CommunityLinkBase;
  groupSlug: string;
  catalogHref: string;
  shellExtra?: { embedded: false };
}) {
  const { agencyId, groupId, courseId, group, personId, membership, linkBase, groupSlug, catalogHref, shellExtra } = opts;
  const course = await getAgencyStandaloneCourse(agencyId, courseId);
  if (!course || !course.published || !course.linkedCommunityGroupIds.includes(groupId)) notFound();
  if (!(await checkAgencyCourseEntitlementForPerson(agencyId, course, personId))) redirect(catalogHref);

  const tree = await getAgencyStandaloneCourseTree({ agencyId, courseId, includeUnpublished: false });
  if (!tree) redirect(catalogHref);
  const enrollment = await getAgencyStandaloneEnrollment(agencyId, courseId, personId);
  const lessons = filterAgencyLessonsForEnrollment(tree.lessons, enrollment);
  if (lessons.length === 0) redirect(catalogHref);
  const productHref = communityLearningProductHref(linkBase, groupSlug, courseId);

  const targetIds = new Set(
    [...course.theme.body, ...course.theme.sidebar].flatMap((block) =>
      block.type === "crossSell" && block.targetOfferId ? [block.targetOfferId] : [],
    ),
  );
  const crossSellTargets = new Map();
  await Promise.all([...targetIds].map(async (id) => {
    const target = await getAgencyCourseOffer(agencyId, id);
    if (target) crossSellTargets.set(id, {
      id: target.id,
      title: target.title,
      priceCents: target.priceCents,
      currency: target.currency,
      type: target.type,
      visibility: target.visibility,
    });
  }));

  const viewer: AuthorView = {
    memberId: personId,
    displayName: "Member",
    avatarUrl: null,
    level: membership.level ?? 1,
  };
  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="classroom"
      viewer={viewer}
      viewerIsModerator={false}
      {...shellExtra}
    >
      <CourseHomeView
        saId="agency"
        courseId={courseId}
        course={course}
        theme={course.theme}
        sections={tree.sections}
        lessons={lessons}
        member={{ email: "", displayName: viewer.displayName }}
        completedLessonIds={enrollment?.completedLessonIds ?? []}
        crossSellTargets={crossSellTargets}
        homeHref={productHref}
      />
    </CommunityShell>
  );
}
