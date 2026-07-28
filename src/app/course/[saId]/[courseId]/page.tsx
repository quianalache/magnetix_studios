import { notFound, redirect } from "next/navigation";
import { requireCoursePageAccess } from "@/lib/standalone-courses/course-access";
import {
  getCurriculumOutline,
  getStandaloneEnrollment,
} from "@/lib/server/standalone-course-service";
import { getCourseOffer } from "@/lib/server/course-offer-service";
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

  const enrollment = member ? await getStandaloneEnrollment(saId, courseId, member.id) : null;
  // A member who already has access never sees the pricing/Enroll page —
  // they land straight on the Product page (`CourseHomeView`, the
  // curriculum/course-home hub), matching GHL: pricing only exists to get
  // someone access in the first place, never shown again afterward.
  if (enrollment) redirect(`/course/${saId}/${courseId}/classroom`);

  const outline = await getCurriculumOutline(saId, courseId);

  // Batch-resolve every Cross Sell block's target offer up front, so
  // `CourseBlockView` itself stays a plain sync component reusable by the
  // editor's live preview (which resolves targets from its own already-
  // subscribed offer list instead of an Admin SDK call).
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

  const priceLabel =
    course.access === "purchase"
      ? course.billingType === "recurring"
        ? `${formatPrice(course.priceCents, course.currency)} / ${course.recurringInterval ?? "month"}`
        : formatPrice(course.priceCents, course.currency)
      : "Free";
  const aboutHtml = sanitizeLessonHtml(course.aboutHtml);
  const totalLessons = outline.reduce((sum, s) => sum + s.lessonCount, 0);

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
      // Always null here — an existing enrollment redirects above before
      // this point is ever reached.
      enrollment={null}
      totalLessons={totalLessons}
      completedCount={0}
      crossSellTargets={crossSellTargets}
      interactive
    />
  );
}
