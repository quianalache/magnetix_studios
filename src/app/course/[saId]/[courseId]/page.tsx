import { notFound } from "next/navigation";
import { requireCoursePageAccess } from "@/lib/standalone-courses/course-access";
import {
  getCurriculumOutline,
  getStandaloneEnrollment,
  getStandaloneCourse,
} from "@/lib/server/standalone-course-service";
import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { CourseSalesPageView } from "@/components/standalone-courses/course-sales-page-view";
import type { CrossSellTargetInfo } from "@/components/standalone-courses/theme-blocks";

export const dynamic = "force-dynamic";

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/**
 * Public standalone-course sales page. All the actual markup lives in
 * `CourseSalesPageView` (shared with the dashboard theme editor's live
 * preview) — this file's job is just gating + fetching the real data.
 * Server-rendered via the Admin SDK (rules bypass), same pattern as the
 * booking page and the community group About page. Gated: a disabled
 * sub-account or an unpublished course both 404.
 */
export default async function CourseSalesPage({
  params,
}: {
  params: Promise<{ saId: string; courseId: string }>;
}) {
  const { saId, courseId } = await params;

  const access = await requireCoursePageAccess(saId, courseId);
  if (access.kind === "notFound") notFound();
  const { course, member } = access;
  const theme = course.theme;

  const [outline, enrollment] = await Promise.all([
    getCurriculumOutline(saId, courseId),
    member ? getStandaloneEnrollment(saId, courseId, member.id) : null,
  ]);

  // Batch-resolve every Cross Sell block's target course up front, so
  // `CourseBlockView` itself stays a plain sync component reusable by the
  // editor's live preview (which resolves targets from its own already-
  // subscribed course list instead of an Admin SDK call).
  const targetIds = new Set<string>();
  for (const block of [...theme.body, ...theme.sidebar]) {
    if (block.type === "crossSell" && block.targetCourseId) {
      targetIds.add(block.targetCourseId);
    }
  }
  const crossSellTargets = new Map<string, CrossSellTargetInfo>();
  await Promise.all(
    Array.from(targetIds).map(async (id) => {
      const target = await getStandaloneCourse(saId, id);
      if (target) {
        crossSellTargets.set(id, {
          id: target.id,
          title: target.title,
          priceCents: target.priceCents,
          currency: target.currency,
          access: target.access,
          published: target.published,
        });
      }
    }),
  );

  const priceLabel =
    course.access === "purchase"
      ? course.billingType === "recurring"
        ? `${formatPrice(course.priceCents, course.currency)} / ${course.recurringInterval ?? "month"}`
        : formatPrice(course.priceCents, course.currency)
      : "Free";
  const aboutHtml = sanitizeLessonHtml(course.aboutHtml);
  const totalLessons = outline.reduce((sum, s) => sum + s.lessonCount, 0);
  const completedCount = enrollment?.completedLessonIds.length ?? 0;

  return (
    <CourseSalesPageView
      saId={saId}
      courseId={courseId}
      course={course}
      theme={theme}
      outline={outline}
      priceLabel={priceLabel}
      aboutHtml={aboutHtml}
      member={member}
      enrollment={enrollment}
      totalLessons={totalLessons}
      completedCount={completedCount}
      crossSellTargets={crossSellTargets}
      interactive
    />
  );
}
