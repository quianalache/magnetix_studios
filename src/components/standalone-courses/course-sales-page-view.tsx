import { GraduationCap, Users } from "lucide-react";
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
import { startLearningHref } from "@/lib/standalone-courses/course-navigation";
import { BuyCard, CheckoutFrame, CheckoutHeader, SalesChip, SalesMedia, SalesSection, StickyBuyBar } from "@/components/public/public-checkout-shell";

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
 *
 * Public-surfaces v2 (2026-10-16): rendered on PublicCheckoutShell — the
 * course's own theme stays the only brand source; real cover or a neutral
 * tile (never a letter); phones get a sticky price + enroll bar. No
 * "Powered by" on paid pages (owner decision).
 */
export function CourseSalesPageView({
  saId,
  courseId,
  agencyScope,
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
  businessName,
}: {
  saId: string;
  courseId: string;
  /** Agency Standalone Course — see EnrollModal's own doc comment. Also
   *  branches the header/enroll "Log in" destination to MyMagnetix. */
  agencyScope?: boolean;
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
  /** The selling business (sub-account or agency name). Falls back to the course title (theme-editor preview). */
  businessName?: string | null;
}) {
  const bodyBlocks = [...theme.body].sort((a, b) => a.order - b.order);
  const sidebarBlocks = [...theme.sidebar].sort((a, b) => a.order - b.order);
  const seller = businessName?.trim() || course.title;
  const priceNote = course.access === "purchase" ? "One-time" : "Access";

  const loginLinkStyle = { borderColor: theme.header.searchBorder, color: theme.header.iconColor };
  const headerRight = member ? (
    <div className="tenant-mark flex size-8 items-center justify-center rounded-full text-xs font-semibold" title={member.email}>
      {(member.displayName?.charAt(0) || member.email.charAt(0)).toUpperCase()}
    </div>
  ) : interactive ? (
    <a
      href={agencyScope ? `/my/login?next=${encodeURIComponent(`/course/agency/${courseId}`)}` : `/course/${saId}/login?course=${courseId}`}
      className="rounded-md border px-4 py-1.5 text-sm font-medium hover:opacity-80"
      style={loginLinkStyle}
    >
      Log in
    </a>
  ) : (
    <span className="rounded-md border px-4 py-1.5 text-sm font-medium" style={loginLinkStyle}>
      Log in
    </span>
  );

  /** The purchase action — rendered in the buy card and again in the phone sticky bar. */
  const purchaseAction = enrollment ? (
    <a
      href={startLearningHref(`/course/${saId}/${courseId}/classroom`)}
      className="tenant-button inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold"
    >
      Continue learning
    </a>
  ) : interactive ? (
    <EnrollModal
      saId={saId}
      courseId={courseId}
      agencyScope={agencyScope}
      access={course.access}
      priceLabel={priceLabel}
      brand={theme.hero.buttonColor}
      member={member}
      needsBirthDetails={needsBirthDetails}
    />
  ) : (
    <button type="button" disabled className="tenant-button inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold">
      {course.access === "purchase" ? `Enroll Now — ${priceLabel}` : "Enroll Now"}
    </button>
  );

  return (
    <CheckoutFrame theme={theme} businessName={seller}>
      <CheckoutHeader theme={theme} businessName={seller} right={headerRight} />

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

        <div className="px-4 py-8 sm:py-12">
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[minmax(0,1fr)_360px] md:gap-10">
            {/* Left — the sales column */}
            <div className="min-w-0 space-y-6">
              <div className="space-y-3">
                <SalesChip icon={GraduationCap}>{course.category || "Course"}</SalesChip>
                {/* When Hero is visible it already shows the title (with its
                  own color) — avoid rendering it twice. */}
                {!theme.hero.visible && (
                  <h1 className="public-ink text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl" style={{ fontFamily: "var(--font-secondary)" }}>
                    {course.title}
                  </h1>
                )}
                <p className="public-body flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {course.showMemberCount && (
                    <>
                      <span className="flex items-center gap-1">
                        <Users className="size-4" aria-hidden="true" />
                        {course.enrollmentCount} {course.enrollmentCount === 1 ? "member" : "members"}
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{priceLabel}</span>
                  {totalLessons > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {totalLessons} {totalLessons === 1 ? "lesson" : "lessons"}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Phones: the real cover right away (only when there is one); the full buy card follows the content. */}
              {course.coverUrl && (
                <div className="tenant-card overflow-hidden md:hidden">
                  <SalesMedia src={course.coverUrl} icon={GraduationCap} className="aspect-video" />
                </div>
              )}

              {aboutHtml && (
                <SalesSection title="About this course">
                  <div className="prose prose-sm max-w-none px-5 py-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: aboutHtml }} />
                </SalesSection>
              )}

              {bodyBlocks.map((block) =>
                block.type === "category" ? (
                  <CurriculumOutline key={block.id} sections={outline} theme={block} />
                ) : (
                  <CourseBlockView key={block.id} block={block} saId={saId} crossSellTargets={crossSellTargets} />
                )
              )}
            </div>

            {/* Right — the enroll card */}
            <BuyCard
              media={<SalesMedia src={course.coverUrl} icon={GraduationCap} className="aspect-video max-md:hidden" />}
              title={course.title}
              price={priceLabel}
              priceNote={priceNote}
              secure={course.access === "purchase" && !enrollment}
              stats={
                course.showMemberCount ? (
                  <div className="tenant-soft rounded-lg px-3 py-2 text-center text-sm">
                    <span className="font-semibold tabular-nums">{course.enrollmentCount}</span> {course.enrollmentCount === 1 ? "member" : "members"}
                  </div>
                ) : null
              }
            >
              {sidebarBlocks.map((block) => {
                if (isCoreSidebarBlock(block)) {
                  return block.type === "progress" ? (
                    <ProgressBlockView key={block.id} block={block} completedCount={completedCount} totalCount={totalLessons} />
                  ) : (
                    <InstructorBlockView key={block.id} block={block} instructor={course.instructor} hideWhenEmpty={interactive} />
                  );
                }
                return <CourseBlockView key={block.id} block={block} saId={saId} crossSellTargets={crossSellTargets} />;
              })}
              <div id="enroll">{purchaseAction}</div>
            </BuyCard>
          </div>
        </div>
      <StickyBuyBar price={priceLabel} priceNote={priceNote}>
        {purchaseAction}
      </StickyBuyBar>
    </CheckoutFrame>
  );
}
