import { notFound, redirect } from "next/navigation";
import { communityLearningProductHref, type CommunityLinkBase } from "@/lib/community/routes";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import { checkStandaloneCourseEntitlementForMember } from "@/lib/standalone-courses/course-access";
import {
  filterLessonsForEnrollment,
  getStandaloneCourse,
  getStandaloneCourseTree,
  getStandaloneEnrollment,
} from "@/lib/server/standalone-course-service";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { CourseHomeView } from "@/components/standalone-courses/course-home-view";
import { CommunityShell } from "@/components/community/community-shell";
import type { AuthorView, CommunityGroup, GroupMembership, Member } from "@/types/community";

export async function EmbeddedProductCourse(opts: {
  saId: string;
  courseId: string;
  group: CommunityGroup;
  member: Member;
  membership: GroupMembership;
  linkBase: CommunityLinkBase;
  groupSlug: string;
  catalogHref: string;
  shellExtra?: { staffGroupId: string; embedded: false };
}) {
  const { saId, courseId, group, member, membership, linkBase, groupSlug, catalogHref, shellExtra } = opts;
  const gate = await getStandaloneCoursesGate(saId);
  const course = gate?.enabled ? await getStandaloneCourse(saId, courseId) : null;
  if (!course || !course.published || !course.linkedCommunityGroupIds.includes(group.id)) notFound();
  if (!(await checkStandaloneCourseEntitlementForMember(course, member.id))) redirect(catalogHref);

  const tree = await getStandaloneCourseTree({ subAccountId: saId, courseId, includeUnpublished: false });
  if (!tree) redirect(catalogHref);
  const enrollment = await getStandaloneEnrollment(saId, courseId, member.id);
  const lessons = filterLessonsForEnrollment(tree.lessons, enrollment);
  const productHref = communityLearningProductHref(linkBase, groupSlug, courseId);
  if (lessons.length === 0) redirect(catalogHref);

  const targetIds = new Set(
    [...course.theme.body, ...course.theme.sidebar].flatMap((block) =>
      block.type === "crossSell" && block.targetOfferId ? [block.targetOfferId] : [],
    ),
  );
  const crossSellTargets = new Map();
  await Promise.all([...targetIds].map(async (id) => {
    const target = await getCourseOffer(saId, id);
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
    memberId: member.id,
    displayName: member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  return (
    <CommunityShell
      saId={saId}
      pretty={linkBase.pretty}
      group={group}
      active="classroom"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      {...shellExtra}
    >
      <CourseHomeView
        saId={saId}
        courseId={courseId}
        course={course}
        theme={course.theme}
        sections={tree.sections}
        lessons={lessons}
        member={member}
        completedLessonIds={enrollment?.completedLessonIds ?? []}
        crossSellTargets={crossSellTargets}
        homeHref={productHref}
      />
    </CommunityShell>
  );
}
