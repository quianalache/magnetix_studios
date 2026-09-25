import { notFound, redirect } from "next/navigation";
import {
  checkAgencyCourseEntitlementForPerson,
  requireAgencyCoursePageAccess,
} from "@/lib/standalone-courses/agency-course-access";
import {
  getAgencyCurriculumOutline,
  getAgencyStandaloneEnrollment,
  agencyCourseHasChartGatedLessons,
} from "@/lib/server/agency-standalone-course-service";
import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { CourseSalesPageView } from "@/components/standalone-courses/course-sales-page-view";

export const dynamic = "force-dynamic";

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/**
 * Public Agency Standalone Course sales page — mirrors
 * /course/[saId]/[courseId]/page.tsx. Reuses the exact same
 * CourseSalesPageView; `saId="agency"` (a literal, never a real
 * sub-account id) makes every internal href this shared component builds
 * land on this route tree automatically, and `agencyScope` branches the
 * enroll-flow API base + "Log in" destination to the global Person/
 * MyMagnetix identity. No Course Offers cross-sell blocks — not ported
 * for agency this pass (see agency-standalone-course-service.ts).
 */
export default async function AgencyCourseSalesPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const access = await requireAgencyCoursePageAccess(courseId);
  if (access.kind === "notFound") notFound();
  const { agencyId, course, person } = access;
  const theme = course.theme;

  const enrollment = person ? await getAgencyStandaloneEnrollment(agencyId, courseId, person.id) : null;
  // Only redirect an enrollment that actually grants access: the classroom
  // guard sends a not-entitled person (unpaid paid course, expired access
  // window, revoked complimentary grant) back HERE, so an unconditional
  // redirect looped the two pages forever. Same fix as the tenant page.
  if (enrollment && person && (await checkAgencyCourseEntitlementForPerson(agencyId, course, person.id))) {
    redirect(`/course/agency/${courseId}/classroom`);
  }

  const outline = await getAgencyCurriculumOutline(agencyId, courseId);
  const priceLabel =
    course.access === "purchase"
      ? course.billingType === "recurring"
        ? `${formatPrice(course.priceCents, course.currency)} / ${course.recurringInterval ?? "month"}`
        : formatPrice(course.priceCents, course.currency)
      : "Free";
  const aboutHtml = sanitizeLessonHtml(course.aboutHtml);
  const totalLessons = outline.reduce((sum, s) => sum + s.lessonCount, 0);
  const needsBirthDetails = await agencyCourseHasChartGatedLessons(agencyId, courseId);

  return (
    <CourseSalesPageView
      saId="agency"
      courseId={courseId}
      agencyScope
      course={{
        title: course.title,
        coverUrl: course.coverUrl,
        category: course.category,
        showMemberCount: course.showMemberCount,
        enrollmentCount: course.enrollmentCount,
        access: course.access,
        instructor: course.instructor,
      }}
      theme={theme}
      outline={outline}
      priceLabel={priceLabel}
      aboutHtml={aboutHtml}
      member={person ? { email: person.primaryEmail, displayName: null, phone: null } : null}
      enrollment={null}
      totalLessons={totalLessons}
      completedCount={0}
      crossSellTargets={new Map()}
      interactive
      needsBirthDetails={needsBirthDetails}
    />
  );
}
