import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import {
  getAgencyStandaloneCourse,
  getAgencyStandaloneCourseTree,
  getAgencyStandaloneEnrollment,
  filterAgencyLessonsForEnrollment,
} from "@/lib/server/agency-standalone-course-service";
import { checkAgencyCourseEntitlementForPerson } from "@/lib/standalone-courses/agency-course-access";
import { CommunityShell } from "@/components/community/community-shell";
import { StandaloneLessonPlayer, type PlayerLesson, type PlayerSection } from "@/components/standalone-courses/standalone-lesson-player";
import { presentStandaloneLesson } from "@/lib/server/course-lesson-presentation";

export const dynamic = "force-dynamic";

/**
 * Real Agency Community member access — a linked Agency Standalone
 * Course's lesson, rendered inside this Community's shell. Mirrors
 * /my/community/[groupId]/classroom/[courseId]/[lessonId]/page.tsx (the
 * native-course version) and tenant's
 * /c/[saId]/[groupSlug]/classroom/product/[courseId]/[lessonId]/page.tsx
 * (the embedded-Product bridge). Content/entitlement/progress all stay on
 * the Standalone Course itself — this only renders it inside the
 * Community shell.
 */
export default async function MyAgencyEmbeddedProductLessonPage({
  params,
}: {
  params: Promise<{ groupId: string; courseId: string; lessonId: string }>;
}) {
  const { groupId, courseId, lessonId } = await params;
  const catalog = `/my/community/${groupId}/classroom`;
  const productHref = `${catalog}/product/${courseId}`;

  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`${productHref}/${lessonId}`)}`);

  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) notFound();

  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this community.
      </div>
    );
  }
  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
  }

  const course = await getAgencyStandaloneCourse(agencyId, courseId);
  if (!course || !course.published || !course.linkedCommunityGroupIds.includes(groupId)) {
    notFound();
  }

  const entitled = await checkAgencyCourseEntitlementForPerson(agencyId, course, person.id);
  if (!entitled) redirect(catalog);

  const tree = await getAgencyStandaloneCourseTree({ agencyId, courseId, includeUnpublished: false });
  if (!tree) redirect(catalog);

  const enrollment = await getAgencyStandaloneEnrollment(agencyId, courseId, person.id);
  const visibleLessons = filterAgencyLessonsForEnrollment(tree.lessons, enrollment);

  if (!visibleLessons.some((l) => l.id === lessonId)) {
    const first = visibleLessons[0];
    if (!first) redirect(catalog);
    redirect(`${productHref}/${first.id}`);
  }

  const viewer = { memberId: membership.id, displayName: agencyMemberDisplayName(membership), avatarUrl: null, level: membership.level ?? 1 };

  const sections: PlayerSection[] = tree.sections.map((s) => ({ id: s.id, title: s.title }));
  const lessons: PlayerLesson[] = await Promise.all(
    visibleLessons.map((l) => presentStandaloneLesson(l, { kind: "agency", agencyId })),
  );

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="classroom"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      <Link href={catalog} className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]">
        <ArrowLeft className="h-4 w-4" /> {course.title}
      </Link>
      <StandaloneLessonPlayer
        completeEndpoint={`/api/agency/community/${groupId}/courses/product/${courseId}/lessons/${lessonId}/complete`}
        lessonHrefBase={productHref}
        homeHref={productHref}
        saId="agency"
        lessonTheme={course.lessonTheme}
        courseTitle={course.title}
        courseCoverUrl={course.coverUrl}
        instructor={course.instructor}
        crossSellTargets={new Map()}
        sections={sections}
        lessons={lessons}
        currentLessonId={lessonId}
        completedIds={enrollment?.completedLessonIds ?? []}
      />
    </CommunityShell>
  );
}
