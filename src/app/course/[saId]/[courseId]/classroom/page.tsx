import { notFound, redirect } from "next/navigation";
import { requireCourseClassroomAccess } from "@/lib/standalone-courses/course-access";
import {
  getStandaloneCourseTree,
  getStandaloneEnrollment,
} from "@/lib/server/standalone-course-service";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { CourseHomeView } from "@/components/standalone-courses/course-home-view";
import type { CrossSellTargetInfo } from "@/components/standalone-courses/theme-blocks";

export const dynamic = "force-dynamic";

/**
 * Course home ("product page") — the enrolled member's landing hub: hero,
 * a fully clickable curriculum, and the course's theme sidebar blocks.
 * Distinct from the pre-purchase sales page at `/course/[saId]/[courseId]`.
 * Previously this route just redirected straight into the first lesson;
 * see the plan for why that's now a real page instead.
 */
export default async function StandaloneCourseHomePage({
  params,
}: {
  params: Promise<{ saId: string; courseId: string }>;
}) {
  const { saId, courseId } = await params;
  const access = await requireCourseClassroomAccess(saId, courseId);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { course, member } = access;
  const theme = course.theme;
  const salesPage = `/course/${saId}/${courseId}`;

  const tree = await getStandaloneCourseTree({
    subAccountId: saId,
    courseId,
    includeUnpublished: false,
  });
  if (!tree || !tree.course.published || tree.lessons.length === 0) {
    redirect(salesPage);
  }

  const enrollment = await getStandaloneEnrollment(saId, courseId, member.id);

  // Batch-resolve every Cross Sell block's target offer, same pattern as
  // the sales page.
  const targetIds = new Set<string>();
  for (const block of [...theme.body, ...theme.sidebar]) {
    if (block.type === "crossSell" && block.targetOfferId) {
      targetIds.add(block.targetOfferId);
    }
  }
  const crossSellTargets = new Map<string, CrossSellTargetInfo>();
  await Promise.all(
    Array.from(targetIds).map(async (id) => {
      const target = await getCourseOffer(saId, id);
      if (target) {
        crossSellTargets.set(id, {
          id: target.id,
          title: target.title,
          priceCents: target.priceCents,
          currency: target.currency,
          type: target.type,
          visibility: target.visibility,
        });
      }
    }),
  );

  return (
    <CourseHomeView
      saId={saId}
      courseId={courseId}
      course={course}
      theme={theme}
      sections={tree.sections}
      lessons={tree.lessons}
      member={member}
      completedLessonIds={enrollment?.completedLessonIds ?? []}
      crossSellTargets={crossSellTargets}
    />
  );
}
