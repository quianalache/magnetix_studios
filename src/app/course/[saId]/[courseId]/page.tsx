import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { requireCoursePageAccess } from "@/lib/standalone-courses/course-access";
import {
  getCurriculumOutline,
  getStandaloneEnrollment,
} from "@/lib/server/standalone-course-service";
import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { CurriculumOutline } from "@/components/standalone-courses/curriculum-outline";
import { EnrollButton } from "./enroll-button";

export const dynamic = "force-dynamic";

const DEFAULT_BRAND = "#202124";

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
 * Public standalone-course sales page — a simple single-column page (banner,
 * about, curriculum outline, price, enrollment count, Enroll Now), reachable
 * without a group/community. Server-rendered via the Admin SDK (rules
 * bypass), same pattern as the booking page and the community group About
 * page. Gated: a disabled sub-account or an unpublished course both 404.
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

  const [outline, enrollment] = await Promise.all([
    getCurriculumOutline(saId, courseId),
    member ? getStandaloneEnrollment(saId, courseId, member.id) : null,
  ]);

  const brand = DEFAULT_BRAND;
  const priceLabel =
    course.access === "purchase"
      ? formatPrice(course.priceCents, course.currency)
      : "Free";
  const aboutHtml = sanitizeLessonHtml(course.aboutHtml);

  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-sm font-semibold text-[#202124]">
            {course.title}
          </span>
          {member ? (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: brand }}
              title={member.email}
            >
              {(member.displayName?.charAt(0) || member.email.charAt(0)).toUpperCase()}
            </div>
          ) : (
            <a
              href={`/course/${saId}/login?course=${courseId}`}
              className="rounded-md border border-[#E4E4E4] px-4 py-1.5 text-sm font-medium text-[#202124] hover:bg-[#F8F7F5]"
            >
              Log in
            </a>
          )}
        </div>
      </header>

      <div className="px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_340px]">
          {/* Left — the sales column */}
          <div className="space-y-5">
            {course.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.coverUrl}
                alt={course.title}
                className="aspect-video w-full rounded-xl border border-[#E4E4E4] object-cover"
              />
            ) : (
              <div
                className="flex aspect-video w-full items-center justify-center rounded-xl text-2xl font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                {course.title}
              </div>
            )}

            <div className="space-y-1">
              {course.category && (
                <span className="inline-flex rounded-full bg-black/[0.05] px-2.5 py-0.5 text-xs font-medium text-[#3a3a44]">
                  {course.category}
                </span>
              )}
              <h1 className="text-3xl font-semibold tracking-tight text-[#202124]">
                {course.title}
              </h1>
              <div className="flex items-center gap-3 text-sm text-[#909090]">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {course.enrollmentCount}{" "}
                  {course.enrollmentCount === 1 ? "member" : "members"}
                </span>
                <span>·</span>
                <span>{priceLabel}</span>
              </div>
            </div>

            {aboutHtml && (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-[#202124]">
                  About this course
                </h2>
                <div
                  className="prose prose-sm max-w-none leading-relaxed prose-headings:text-[#202124] prose-p:text-[#3a3a44] prose-li:text-[#3a3a44] prose-strong:text-[#202124]"
                  dangerouslySetInnerHTML={{ __html: aboutHtml }}
                />
              </div>
            )}

            <CurriculumOutline sections={outline} />
          </div>

          {/* Right — the enroll card */}
          <aside className="h-fit rounded-xl border border-[#E4E4E4] bg-white p-5 shadow-sm md:sticky md:top-10">
            {course.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.coverUrl}
                alt=""
                className="mb-3 aspect-video w-full rounded-lg object-cover"
              />
            ) : (
              <div
                className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg text-lg font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                {course.title.charAt(0)}
              </div>
            )}
            <h2 className="text-lg font-semibold text-[#202124]">
              {course.title}
            </h2>

            <div className="my-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-[#F8F7F5] py-2">
                <div className="text-base font-semibold text-[#202124]">
                  {course.enrollmentCount}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-[#909090]">
                  Members
                </div>
              </div>
              <div className="rounded-lg bg-[#F8F7F5] py-2">
                <div className="text-base font-semibold text-[#202124]">
                  {priceLabel}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-[#909090]">
                  {course.access === "purchase" ? "One-time" : "Access"}
                </div>
              </div>
            </div>

            {enrollment ? (
              <a
                href={`/course/${saId}/${courseId}/classroom`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                Continue learning
              </a>
            ) : (
              <EnrollButton
                saId={saId}
                courseId={courseId}
                access={course.access}
                signedIn={!!member}
                priceLabel={priceLabel}
                brand={brand}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
