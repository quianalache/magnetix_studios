import type { CSSProperties } from "react";
import { Home } from "lucide-react";
import { CourseCurriculumNav } from "@/components/standalone-courses/course-curriculum-nav";
import {
  CourseBlockView,
  ProgressBlockView,
  InstructorBlockView,
  themeBtnStyle,
  type CrossSellTargetInfo,
} from "@/components/standalone-courses/theme-blocks";
import { isCoreSidebarBlock } from "@/types/course-theme";
import type { CourseTheme } from "@/types/course-theme";
import type {
  StandaloneCourse,
  StandaloneCourseSection,
  StandaloneLesson,
} from "@/types/standalone-courses";
import type { Member } from "@/types/community";

/**
 * The enrolled member's course home ("product page" in Quiana's terms) —
 * the landing hub at `/course/[saId]/[courseId]/classroom` (no lesson id).
 * Distinct from `CourseSalesPageView` (pre-purchase pitch: price, "About
 * this course", non-clickable curriculum summary, Enroll CTA) — this page
 * assumes the viewer already has access: no price, no marketing copy, a
 * fully clickable curriculum, and a "Start/Continue" CTA into the lessons
 * themselves. Shares the exact same `theme.sidebar` block list (including
 * the Progress/Instructor core blocks) as the sales page and the lesson
 * page — one block list, edited once in the Theme editor, rendered
 * everywhere relevant.
 */
export function CourseHomeView({
  saId,
  courseId,
  course,
  theme,
  sections,
  lessons,
  member,
  completedLessonIds,
  crossSellTargets,
  interactive = true,
}: {
  saId: string;
  courseId: string;
  course: StandaloneCourse;
  theme: CourseTheme;
  sections: StandaloneCourseSection[];
  lessons: StandaloneLesson[];
  member: Member;
  completedLessonIds: string[];
  crossSellTargets: ReadonlyMap<string, CrossSellTargetInfo>;
  /** false in the theme editor's live preview — the curriculum and the
   *  Hero's "into first lesson" CTA become non-navigating so clicking them
   *  doesn't take over the whole editor. */
  interactive?: boolean;
}) {
  const bodyBlocks = [...theme.body].sort((a, b) => a.order - b.order);
  const sidebarBlocks = [...theme.sidebar].sort((a, b) => a.order - b.order);

  const pageStyle = {
    fontFamily: `"${theme.fonts.primary.family}", sans-serif`,
    "--font-secondary": `"${theme.fonts.secondary.family}", sans-serif`,
  } as CSSProperties;

  const completed = new Set(completedLessonIds);
  const firstIncomplete = lessons.find((l) => !completed.has(l.id)) ?? lessons[0];
  const totalLessons = lessons.length;
  const completedCount = completedLessonIds.length;
  const homeHref = `/course/${saId}/${courseId}/classroom`;

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
          <a
            href={homeHref}
            title="Course home"
            style={{ color: theme.header.iconColor }}
          >
            <Home className="h-5 w-5" />
          </a>
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-secondary)", color: theme.header.iconColor }}
          >
            {course.title}
          </span>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: theme.hero.buttonColor }}
            title={member.email}
          >
            {(member.displayName?.charAt(0) || member.email.charAt(0)).toUpperCase()}
          </div>
        </div>
      </header>

      {theme.hero.visible && (
        <div
          className="relative flex items-center justify-center overflow-hidden px-4 py-16 text-center"
          style={{
            backgroundColor:
              theme.hero.backgroundType === "color" ? theme.hero.backgroundColor : undefined,
            backgroundImage:
              theme.hero.backgroundType === "image" && theme.hero.backgroundImageUrl
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
              className="text-3xl font-semibold"
              style={{ fontFamily: "var(--font-secondary)", color: theme.hero.titleColor ?? "#ffffff" }}
            >
              {course.title}
            </h1>
            {theme.hero.tagline && (
              <p className="text-lg font-medium text-white">{theme.hero.tagline}</p>
            )}
            {firstIncomplete && (
              interactive ? (
                <a
                  href={`${homeHref}/${firstIncomplete.id}`}
                  className="theme-btn inline-flex items-center gap-2 rounded-md border px-6 py-3 text-sm font-semibold"
                  style={themeBtnStyle({
                    fill: theme.hero.buttonColor,
                    fillHover: theme.hero.buttonColorHover ?? theme.hero.buttonColor,
                    border: theme.hero.buttonBorderColor ?? theme.hero.buttonColor,
                    borderHover: theme.hero.buttonBorderColorHover ?? theme.hero.buttonColor,
                    text: theme.hero.buttonTextColor,
                    textHover: theme.hero.buttonTextColorHover ?? theme.hero.buttonTextColor,
                  })}
                >
                  {theme.hero.buttonText}
                </a>
              ) : (
                <span
                  className="theme-btn inline-flex items-center gap-2 rounded-md border px-6 py-3 text-sm font-semibold"
                  style={themeBtnStyle({
                    fill: theme.hero.buttonColor,
                    fillHover: theme.hero.buttonColor,
                    border: theme.hero.buttonBorderColor ?? theme.hero.buttonColor,
                    borderHover: theme.hero.buttonBorderColor ?? theme.hero.buttonColor,
                    text: theme.hero.buttonTextColor,
                    textHover: theme.hero.buttonTextColor,
                  })}
                >
                  {theme.hero.buttonText}
                </span>
              )
            )}
          </div>
        </div>
      )}

      <div className="px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_340px]">
          {/* Left — curriculum. One ordered pass so the Category Block can be
              freely reordered against the other body blocks (e.g. an intro
              Video block placed above it), instead of always being first. */}
          <div className="space-y-5">
            {bodyBlocks.map((block) =>
              block.type === "category" ? (
                <CourseCurriculumNav
                  key={block.id}
                  sections={sections}
                  lessons={lessons}
                  completedIds={completedLessonIds}
                  courseCoverUrl={course.coverUrl}
                  lessonHrefBase={homeHref}
                  brand={theme.hero.buttonColor}
                  theme={block}
                  interactive={interactive}
                />
              ) : (
                <CourseBlockView
                  key={block.id}
                  block={block}
                  saId={saId}
                  crossSellTargets={crossSellTargets}
                />
              ),
            )}
          </div>

          {/* Right — course card + sidebar blocks */}
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
            <h2 className="text-lg font-semibold text-[#202124]">{course.title}</h2>
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0}%`,
                    backgroundColor: theme.hero.buttonColor,
                  }}
                />
              </div>
              <p className="text-xs text-[#909090]">
                {completedCount} of {totalLessons} lessons complete
              </p>
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
          </aside>
        </div>
      </div>
      </div>
    </div>
  );
}
