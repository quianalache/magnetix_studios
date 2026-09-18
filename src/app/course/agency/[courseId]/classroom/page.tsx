import { notFound, redirect } from "next/navigation";
import { requireAgencyCourseClassroomAccess } from "@/lib/standalone-courses/agency-course-access";
import {
  getAgencyStandaloneCourseTree,
  getAgencyStandaloneEnrollment,
  filterAgencyLessonsForEnrollment,
} from "@/lib/server/agency-standalone-course-service";
import { CourseHomeView } from "@/components/standalone-courses/course-home-view";

export const dynamic = "force-dynamic";

/** Agency Standalone Course home ("product page") — mirrors
 *  /course/[saId]/[courseId]/classroom/page.tsx. No Course Offers
 *  cross-sell blocks (not ported for agency this pass). */
export default async function AgencyStandaloneCourseHomePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const access = await requireAgencyCourseClassroomAccess(courseId);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { agencyId, course, person } = access;
  const theme = course.theme;
  const salesPage = `/course/agency/${courseId}`;

  const tree = await getAgencyStandaloneCourseTree({ agencyId, courseId, includeUnpublished: false });
  if (!tree || !tree.course.published) redirect(salesPage);

  const enrollment = await getAgencyStandaloneEnrollment(agencyId, courseId, person.id);
  const visibleLessons = filterAgencyLessonsForEnrollment(tree.lessons, enrollment);

  return (
    <CourseHomeView
      saId="agency"
      courseId={courseId}
      course={course}
      theme={theme}
      sections={tree.sections}
      lessons={visibleLessons}
      member={{ email: person.primaryEmail, displayName: null }}
      completedLessonIds={enrollment?.completedLessonIds ?? []}
      crossSellTargets={new Map()}
    />
  );
}
