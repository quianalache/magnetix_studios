import { notFound, redirect } from "next/navigation";
import { requireAgencyCourseClassroomAccess } from "@/lib/standalone-courses/agency-course-access";
import {
  getAgencyStandaloneCourseTree,
  getAgencyStandaloneEnrollment,
  filterAgencyLessonsForEnrollment,
} from "@/lib/server/agency-standalone-course-service";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import {
  StandaloneLessonPlayer,
  type PlayerLesson,
  type PlayerSection,
} from "@/components/standalone-courses/standalone-lesson-player";

export const dynamic = "force-dynamic";

/** Agency Standalone Course lesson player — mirrors
 *  /course/[saId]/[courseId]/classroom/[lessonId]/page.tsx. No Course
 *  Offers cross-sell/in-app-upsell blocks (not ported for agency). */
export default async function AgencyStandaloneLessonPlayerPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const access = await requireAgencyCourseClassroomAccess(courseId);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { agencyId, course, person } = access;
  const lessonTheme = course.lessonTheme;
  const salesPage = `/course/agency/${courseId}`;
  const homeHref = `${salesPage}/classroom`;

  const tree = await getAgencyStandaloneCourseTree({ agencyId, courseId, includeUnpublished: false });
  if (!tree || !tree.course.published) redirect(salesPage);

  const enrollment = await getAgencyStandaloneEnrollment(agencyId, courseId, person.id);
  const visibleLessons = filterAgencyLessonsForEnrollment(tree.lessons, enrollment);

  if (!visibleLessons.some((l) => l.id === lessonId)) {
    const first = visibleLessons[0];
    if (!first) redirect(salesPage);
    redirect(`${homeHref}/${first.id}`);
  }

  const sections: PlayerSection[] = tree.sections.map((s) => ({ id: s.id, title: s.title }));
  const lessons: PlayerLesson[] = visibleLessons.map((l) => ({
    id: l.id,
    title: l.title,
    sectionId: l.sectionId,
    embedUrl: embedUrlFor(l.videoProvider, l.videoId),
    body: renderLessonBodyHtml(l.bodyHtml),
    resourceLinks: l.resourceLinks ?? [],
  }));

  return (
    <StandaloneLessonPlayer
      completeEndpoint={`/api/course/agency/${courseId}/lessons/${lessonId}/complete`}
      lessonHrefBase={homeHref}
      homeHref={homeHref}
      saId="agency"
      lessonTheme={lessonTheme}
      courseTitle={course.title}
      courseCoverUrl={course.coverUrl}
      instructor={course.instructor}
      crossSellTargets={new Map()}
      sections={sections}
      lessons={lessons}
      currentLessonId={lessonId}
      completedIds={enrollment?.completedLessonIds ?? []}
    />
  );
}
