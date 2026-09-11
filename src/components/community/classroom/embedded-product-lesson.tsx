import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  communityLearningProductHref,
  type CommunityLinkBase,
} from "@/lib/community/routes";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import { checkStandaloneCourseEntitlementForMember } from "@/lib/standalone-courses/course-access";
import {
  getStandaloneCourse,
  getStandaloneCourseTree,
  getStandaloneEnrollment,
  filterLessonsForEnrollment,
} from "@/lib/server/standalone-course-service";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  LessonPlayer,
  type PlayerLesson,
  type PlayerSection,
} from "@/components/community/classroom/lesson-player";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type {
  AuthorView,
  CommunityGroup,
  GroupMembership,
  Member,
} from "@/types/community";

/**
 * Shared render body for a linked Standalone Product's lesson, rendered
 * inside a Community shell — the "Community-embedded linked Product"
 * feature. Both the member-facing (`/c/[saId]/[groupSlug]/classroom/
 * product/[courseId]/[lessonId]`) and staff (`(immersive)/.../classroom/
 * product/[courseId]/[lessonId]`) routes each do their OWN access
 * resolution (`requireGroupPageAccess` vs `requireStaffGroupPageAccess` —
 * genuinely different guards, not worth forcing through one function) and
 * then call this with the result, so the actual course/entitlement/
 * rendering logic exists exactly once.
 *
 * Content, entitlement, and progress all stay on the Standalone Course —
 * see that file's own doc comment for the full architecture rationale.
 *
 * Security (both callers get this for free): membership in `group` is
 * already guaranteed by whichever caller-side guard ran; this function
 * additionally requires `linkedCommunityGroupIds.includes(group.id)` and
 * `checkStandaloneCourseEntitlementForMember` before rendering anything.
 */
export async function EmbeddedProductLesson(opts: {
  saId: string;
  courseId: string;
  lessonId: string;
  group: CommunityGroup;
  member: Member;
  membership: GroupMembership;
  linkBase: CommunityLinkBase;
  groupSlug: string;
  catalogHref: string;
  /** Staff CRM-embedded chrome — omit for the member-facing shell. */
  shellExtra?: { staffGroupId: string; embedded: false };
}) {
  const {
    saId,
    courseId,
    lessonId,
    group,
    member,
    membership,
    linkBase,
    groupSlug,
    catalogHref,
    shellExtra,
  } = opts;

  const gate = await getStandaloneCoursesGate(saId);
  const course = gate?.enabled
    ? await getStandaloneCourse(saId, courseId)
    : null;
  if (
    !course ||
    !course.published ||
    !course.linkedCommunityGroupIds.includes(group.id)
  ) {
    notFound();
  }

  const entitled = await checkStandaloneCourseEntitlementForMember(
    course,
    member.id
  );
  if (!entitled) redirect(catalogHref);

  const tree = await getStandaloneCourseTree({
    subAccountId: saId,
    courseId,
    includeUnpublished: false,
  });
  if (!tree) redirect(catalogHref);

  const enrollment = await getStandaloneEnrollment(saId, courseId, member.id);
  const visibleLessons = filterLessonsForEnrollment(tree.lessons, enrollment);
  const productHref = communityLearningProductHref(
    linkBase,
    groupSlug,
    courseId
  );

  if (!visibleLessons.some((l) => l.id === lessonId)) {
    const first = visibleLessons[0];
    if (!first) redirect(catalogHref);
    redirect(`${productHref}/${first.id}`);
  }

  // Theme parity — same shared resolver every other Community page uses,
  // so a linked Product looks like part of THIS Community, not like the
  // Standalone product's own independent branding.
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const sections: PlayerSection[] = tree.sections.map((s) => ({
    id: s.id,
    title: s.title,
  }));
  const lessons: PlayerLesson[] = visibleLessons.map((l) => ({
    id: l.id,
    title: l.title,
    sectionId: l.sectionId,
    embedUrl: embedUrlFor(l.videoProvider, l.videoId),
    body: renderLessonBodyHtml(l.bodyHtml),
    resourceLinks: l.resourceLinks ?? [],
  }));

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
      <Link
        href={catalogHref}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
      >
        <ArrowLeft className="h-4 w-4" /> {course.title}
      </Link>
      <LessonPlayer
        completeEndpoint={`/api/course/${saId}/${courseId}/lessons/${lessonId}/complete`}
        lessonHrefBase={productHref}
        brand={brand}
        primaryAction={resolvedTheme.primaryAction}
        accent={resolvedTheme.accent}
        sections={sections}
        lessons={lessons}
        currentLessonId={lessonId}
        completedIds={enrollment?.completedLessonIds ?? []}
      />
    </CommunityShell>
  );
}
