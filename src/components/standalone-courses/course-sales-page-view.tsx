import type { CSSProperties } from "react";
import { Users } from "lucide-react";
import { CurriculumOutline } from "@/components/standalone-courses/curriculum-outline";
import {
  CourseBlockView,
  ProgressBlockView,
  InstructorBlockView,
  themeBtnStyle,
  type CrossSellTargetInfo,
} from "@/components/standalone-courses/theme-blocks";
import { isCoreSidebarBlock } from "@/types/course-theme";
import { EnrollModal } from "@/app/course/[saId]/[courseId]/enroll-modal";
import type { CourseTheme } from "@/types/course-theme";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { StandaloneCourseCurriculumSection } from "@/types/standalone-courses";
import type { Member } from "@/types/community";

type CheckoutMember = Pick<Member, "email" | "displayName" | "phone">;
type CourseSalesCourse = Pick<
  StandaloneCourse,
  | "title"
  | "coverUrl"
  | "category"
  | "showMemberCount"
  | "enrollmentCount"
  | "access"
  | "instructor"
>;

/**
 * The entire visual body of a Standalone Course sales page — extracted so
 * the REAL public page (`src/app/course/[saId]/[courseId]/page.tsx`) and the
 * dashboard theme editor's live preview pane render the exact same markup.
 * "Looks identical" is structural here, not something to keep in sync by
 * hand: the editor feeds this component its in-progress local theme state
 * instead of saved Firestore data, so edits reflect instantly with zero
 * approximation.
 *
 * `interactive=false` (editor preview) swaps the two elements that would
 * otherwise trigger a real side effect — the magic-link "Log in" link and
 * the Enroll flow (which mints a real member session / starts a real Stripe
 * checkout) — for inert lookalikes. Body/Sidebar block links are left as
 * real anchors even in preview; clicking one just navigates away like any
 * link on a page being previewed, a minor accepted rough edge rather than
 * something worth threading a flag through every block type for.
 */
export function CourseSalesPageView({
  saId,
  courseId,
  course,
  theme,
  outline,
  priceLabel,
  aboutHtml,
  member,
  enrollment,
  totalLessons,
  completedCount,
  crossSellTargets,
  interactive,
  needsBirthDetails,
}: {
  saId: string;
  courseId: string;
  course: CourseSalesCourse;
  theme: CourseTheme;
  outline: StandaloneCourseCurriculumSection[];
  priceLabel: string;
  aboutHtml: string;
  member: CheckoutMember | null;
  enrollment: { completedLessonIds: string[] } | null;
  totalLessons: number;
  completedCount: number;
  crossSellTargets: ReadonlyMap<string, CrossSellTargetInfo>;
  interactive: boolean;
  /** True when this course has at least one chart-gated lesson — the enroll popup asks for birth details when set. */
  needsBirthDetails: boolean;
}) {
  const bodyBlocks = [...theme.body].sort((a, b) => a.order - b.order);
  const sidebarBlocks = [...theme.sidebar].sort((a, b) => a.order - b.order);

  const pageStyle = {
    fontFamily: `"${theme.fonts.primary.family}", sans-serif`,
    "--font-secondary": `"${theme.fonts.secondary.family}", sans-serif`,
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-[#F8F7F5]" style={pageStyle}>
      {theme.background.imageUrl && (
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${theme.background.imageUrl})`,
            opacity: theme.background.transparency / 100,
          }}
        />
      )}
      <div className="relative z-10">
        <header
          className="border-b border-[#E4E4E4]"
          style={{ backgroundColor: theme.header.background }}
        >
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <span
              className="text-sm font-semibold"
              style={{
                fontFamily: "var(--font-secondary)",
                color: theme.header.iconColor,
              }}
            >
              {course.title}
            </span>
            {member ? (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: theme.hero.buttonColor }}
                title={member.email}
              >
                {(
                  member.displayName?.charAt(0) || member.email.charAt(0)
                ).toUpperCase()}
              </div>
            ) : interactive ? (
              <a
                href={`/course/${saId}/login?course=${courseId}`}
                className="rounded-md border px-4 py-1.5 text-sm font-medium hover:opacity-80"
                style={{
                  borderColor: theme.header.searchBorder,
                  color: theme.header.iconColor,
                }}
              >
                Log in
              </a>
            ) : (
              <span
                className="rounded-md border px-4 py-1.5 text-sm font-medium"
                style={{
                  borderColor: theme.header.searchBorder,
                  color: theme.header.iconColor,
                }}
              >
                Log in
              </span>
            )}
          </div>
        </header>

        {theme.hero.visible && (
          <div
            className="relative flex items-center justify-center overflow-hidden px-4 py-16 text-center"
            style={{
              backgroundColor:
                theme.hero.backgroundType === "color"
                  ? theme.hero.backgroundColor
                  : undefined,
              backgroundImage:
                theme.hero.backgroundType === "image" &&
                theme.hero.backgroundImageUrl
                  ? `url(${theme.hero.backgroundImageUrl})`
                  : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              paddingBlock:
                theme.hero.verticalSpacing === "small"
                  ? "2.5rem"
                  : theme.hero.verticalSpacing === "large"
                    ? "6rem"
                    : "4rem",
            }}
          >
            {theme.hero.overlayVisible && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: theme.hero.overlayColor,
                  opacity: theme.hero.overlayOpacity / 100,
                }}
              />
            )}
            <div className="relative space-y-4">
              <h1
                className="text-3xl font-semibold tracking-tight"
                style={{
                  fontFamily: "var(--font-secondary)",
                  color: theme.hero.titleColor ?? "#ffffff",
                }}
              >
                {course.title}
              </h1>
              {theme.hero.tagline && (
                <p className="text-lg font-medium text-white">
                  {theme.hero.tagline}
                </p>
              )}
              <a
                href="#enroll"
                className="theme-btn inline-flex items-center gap-2 rounded-md border px-6 py-3 text-sm font-semibold"
                style={themeBtnStyle({
                  fill: theme.hero.buttonColor,
                  fillHover:
                    theme.hero.buttonColorHover ?? theme.hero.buttonColor,
                  border:
                    theme.hero.buttonBorderColor ?? theme.hero.buttonColor,
                  borderHover:
                    theme.hero.buttonBorderColorHover ?? theme.hero.buttonColor,
                  text: theme.hero.buttonTextColor,
                  textHover:
                    theme.hero.buttonTextColorHover ??
                    theme.hero.buttonTextColor,
                })}
              >
                {theme.hero.buttonText}
              </a>
            </div>
          </div>
        )}

        <div className="px-4 py-10">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_340px]">
            {/* Left — the sales column */}
            <div className="space-y-5">
              <div className="space-y-1">
                {course.category && (
                  <span className="inline-flex rounded-full bg-black/[0.05] px-2.5 py-0.5 text-xs font-medium text-[#3a3a44]">
                    {course.category}
                  </span>
                )}
                {/* When Hero is visible it already shows the title (with its
                  own color) — avoid rendering it twice. */}
                {!theme.hero.visible && (
                  <h1
                    className="text-3xl font-semibold tracking-tight text-[#202124]"
                    style={{ fontFamily: "var(--font-secondary)" }}
                  >
                    {course.title}
                  </h1>
                )}
                <div className="flex items-center gap-3 text-sm text-[#909090]">
                  {course.showMemberCount && (
                    <>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {course.enrollmentCount}{" "}
                        {course.enrollmentCount === 1 ? "member" : "members"}
                      </span>
                      <span>·</span>
                    </>
                  )}
                  <span>{priceLabel}</span>
                </div>
              </div>

              {aboutHtml && (
                <div>
                  <h2 className="mb-2 text-lg font-semibold text-[#202124]">
                    About this course
                  </h2>
                  <div
                    className="prose prose-sm prose-headings:text-[#202124] prose-p:text-[#3a3a44] prose-li:text-[#3a3a44] prose-strong:text-[#202124] max-w-none leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: aboutHtml }}
                  />
                </div>
              )}

              {bodyBlocks.map((block) =>
                block.type === "category" ? (
                  <CurriculumOutline
                    key={block.id}
                    sections={outline}
                    theme={block}
                  />
                ) : (
                  <CourseBlockView
                    key={block.id}
                    block={block}
                    saId={saId}
                    crossSellTargets={crossSellTargets}
                  />
                )
              )}
            </div>

            {/* Right — the enroll card */}
            <aside className="h-fit space-y-4 rounded-xl border border-[#E4E4E4] bg-white p-5 shadow-sm md:sticky md:top-10">
              {course.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.coverUrl}
                  alt=""
                  className="aspect-video w-full rounded-lg object-cover"
                />
              ) : (
                <div
                  className="flex aspect-video w-full items-center justify-center rounded-lg text-lg font-semibold text-white"
                  style={{ backgroundColor: theme.hero.buttonColor }}
                >
                  {course.title.charAt(0)}
                </div>
              )}
              <h2 className="text-lg font-semibold text-[#202124]">
                {course.title}
              </h2>

              <div
                className={`grid gap-2 text-center ${course.showMemberCount ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {course.showMemberCount && (
                  <div className="rounded-lg bg-[#F8F7F5] py-2">
                    <div className="text-base font-semibold text-[#202124]">
                      {course.enrollmentCount}
                    </div>
                    <div className="text-[11px] tracking-wide text-[#909090] uppercase">
                      Members
                    </div>
                  </div>
                )}
                <div className="rounded-lg bg-[#F8F7F5] py-2">
                  <div className="text-base font-semibold text-[#202124]">
                    {priceLabel}
                  </div>
                  <div className="text-[11px] tracking-wide text-[#909090] uppercase">
                    {course.access === "purchase" ? "One-time" : "Access"}
                  </div>
                </div>
              </div>

              {sidebarBlocks.map((block) => {
                if (isCoreSidebarBlock(block)) {
                  return block.type === "progress" ? (
                    <ProgressBlockView
                      key={block.id}
                      block={block}
                      completedCount={completedCount}
                      totalCount={totalLessons}
                    />
                  ) : (
                    <InstructorBlockView
                      key={block.id}
                      block={block}
                      instructor={course.instructor}
                    />
                  );
                }
                return (
                  <CourseBlockView
                    key={block.id}
                    block={block}
                    saId={saId}
                    crossSellTargets={crossSellTargets}
                  />
                );
              })}

              <div id="enroll">
                {enrollment ? (
                  <a
                    href={`/course/${saId}/${courseId}/classroom`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white"
                    style={{ backgroundColor: theme.hero.buttonColor }}
                  >
                    Continue learning
                  </a>
                ) : interactive ? (
                  <EnrollModal
                    saId={saId}
                    courseId={courseId}
                    access={course.access}
                    priceLabel={priceLabel}
                    brand={theme.hero.buttonColor}
                    member={member}
                    needsBirthDetails={needsBirthDetails}
                  />
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white"
                    style={{ backgroundColor: theme.hero.buttonColor }}
                  >
                    {course.access === "purchase"
                      ? `Enroll Now — ${priceLabel}`
                      : "Enroll Now"}
                  </button>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
