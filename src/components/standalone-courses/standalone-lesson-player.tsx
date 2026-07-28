"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ExternalLink,
  Home,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CourseBlockView,
  InstructorBlockView,
  themeBtnStyle,
  type CrossSellTargetInfo,
} from "@/components/standalone-courses/theme-blocks";
import { DEFAULT_LESSON_THEME } from "@/types/course-theme";
import type {
  LessonTheme,
  LessonButtonState,
  LessonCourseContentBlock,
  InstructorSidebarBlock,
} from "@/types/course-theme";
import type { StandaloneCourseInstructor } from "@/types/standalone-courses";

/**
 * Standalone Course lesson player — forked from Community's `LessonPlayer`
 * (`src/components/community/classroom/lesson-player.tsx`) rather than
 * sharing it, since this version is driven by its own `LessonTheme` system
 * (independent from the Product/Course-Home `CourseTheme` — see
 * `src/types/course-theme.ts`'s doc comment on `LessonTheme`). Owns the
 * full page shell (background layer, colors/fonts) rather than being a
 * fragment its route wraps, matching the other 3 page-view components
 * (`course-sales-page-view.tsx` etc.) — so the theme editor's live preview,
 * which renders this component directly, shows the same background too.
 */

export interface PlayerLesson {
  id: string;
  title: string;
  sectionId: string | null;
  embedUrl: string | null;
  /** Sanitized lesson body HTML (already run through renderLessonBodyHtml). */
  body: string;
  resourceLinks: { label: string; url: string }[];
}
export interface PlayerSection {
  id: string;
  title: string;
}

function buttonStateStyle(state: LessonButtonState): CSSProperties {
  return state.buttonType === "solid"
    ? themeBtnStyle({
        fill: state.color,
        fillHover: state.colorHover,
        border: state.borderColor,
        borderHover: state.borderColorHover,
        text: state.textColor,
        textHover: state.textColorHover,
      })
    : themeBtnStyle({
        fill: "transparent",
        fillHover: "transparent",
        border: "transparent",
        borderHover: "transparent",
        text: state.color,
        textHover: state.colorHover,
      });
}

const DEFAULT_COURSE_CONTENT_BLOCK = DEFAULT_LESSON_THEME.sidebar.find(
  (b) => b.type === "courseContent",
) as LessonCourseContentBlock;

export function StandaloneLessonPlayer({
  completeEndpoint,
  lessonHrefBase,
  homeHref,
  saId,
  lessonTheme,
  courseTitle,
  courseCoverUrl,
  instructor,
  crossSellTargets,
  sections,
  lessons,
  currentLessonId,
  completedIds: initialCompleted,
  interactive = true,
}: {
  /** Full POST URL to mark the current lesson complete. */
  completeEndpoint: string;
  /**
   * Base path a lesson id gets appended to (`${lessonHrefBase}/${lessonId}`)
   * to build each nav href. A plain string, not a function — this component
   * is rendered from Server Component pages, and function props can't cross
   * the RSC server→client serialization boundary.
   */
  lessonHrefBase: string;
  /** Course home ("product page") URL — the header's home icon target. */
  homeHref: string;
  saId: string;
  lessonTheme: LessonTheme;
  courseTitle: string;
  courseCoverUrl: string | null;
  instructor: StandaloneCourseInstructor;
  crossSellTargets: ReadonlyMap<string, CrossSellTargetInfo>;
  sections: PlayerSection[];
  lessons: PlayerLesson[];
  currentLessonId: string;
  completedIds: string[];
  /** false in the theme editor's live preview — Mark Complete becomes an
   *  inert lookalike instead of a real POST, same pattern as the other 3
   *  page-view components' `interactive` flag. */
  interactive?: boolean;
}) {
  const lessonHref = (lessonId: string) => `${lessonHrefBase}/${lessonId}`;
  const [completed, setCompleted] = useState<Set<string>>(new Set(initialCompleted));
  const [saving, setSaving] = useState(false);

  const current = lessons.find((l) => l.id === currentLessonId) ?? lessons[0];
  const idx = lessons.findIndex((l) => l.id === current.id);
  const next = lessons[idx + 1] ?? null;
  const isCompleted = completed.has(current.id);

  const sectionIds = new Set(sections.map((s) => s.id));
  const inSection = (sid: string | null) =>
    lessons.filter((l) =>
      sid === null
        ? !l.sectionId || !sectionIds.has(l.sectionId)
        : l.sectionId === sid,
    );
  const other = inSection(null);

  // Previous/Next Category — jumps to the previous/next section's first
  // lesson, cycling through `sections` in order. `other` (lessons with no
  // valid section) isn't part of this cycle.
  const currentSectionIdx = sections.findIndex((s) => s.id === current.sectionId);
  const prevCategory =
    currentSectionIdx > 0 ? inSection(sections[currentSectionIdx - 1].id)[0] : null;
  const nextCategory =
    currentSectionIdx >= 0 && currentSectionIdx < sections.length - 1
      ? inSection(sections[currentSectionIdx + 1].id)[0]
      : null;

  async function markComplete() {
    if (!interactive || isCompleted) return;
    setSaving(true);
    try {
      const res = await fetch(completeEndpoint, { method: "POST" });
      if (!res.ok) throw new Error();
      setCompleted((prev) => new Set(prev).add(current.id));
    } catch {
      toast.error("Couldn't save progress");
    } finally {
      setSaving(false);
    }
  }

  const courseContent =
    lessonTheme.sidebar.find(
      (b): b is LessonCourseContentBlock => b.type === "courseContent",
    ) ?? DEFAULT_COURSE_CONTENT_BLOCK;

  const NavLesson = ({ l }: { l: PlayerLesson }) => {
    const isCurrent = l.id === current.id;
    return (
      <Link
        href={lessonHref(l.id)}
        style={{
          color: courseContent.itemTextColor,
          borderColor: courseContent.itemBorderColor,
          ...(isCurrent
            ? { backgroundColor: `color-mix(in srgb, ${courseContent.itemTextColor} 12%, white)` }
            : ({ ["--category-hover" as string]: courseContent.itemHoverColor } as CSSProperties)),
        }}
        className={cn(
          "category-block-card flex items-center gap-2 rounded-md border-b px-2 py-1.5 text-sm transition-colors last:border-b-0",
          isCurrent && "font-medium",
        )}
      >
        {completed.has(l.id) ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: courseContent.itemTextColor }} />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-[#c4c4c4]" />
        )}
        {courseCoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={courseCoverUrl}
            alt=""
            className="h-8 w-12 shrink-0 rounded object-cover"
          />
        ) : null}
        <span className="truncate">{l.title}</span>
      </Link>
    );
  };

  const totalLessons = lessons.length;

  const pageStyle = {
    fontFamily: `"${lessonTheme.fonts.primary.family}", sans-serif`,
    "--font-secondary": `"${lessonTheme.fonts.secondary.family}", sans-serif`,
  } as CSSProperties;

  const sortedSidebar = [...lessonTheme.sidebar].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-[#F8F7F5]" style={pageStyle}>
      {lessonTheme.background.imageUrl && (
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${lessonTheme.background.imageUrl})`,
            opacity: lessonTheme.background.transparency / 100,
          }}
        />
      )}
      <div className="relative z-10 px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          {lessonTheme.breadcrumb.visible && (
            <div className="flex items-center gap-2 text-sm" style={{ color: lessonTheme.breadcrumb.color }}>
              <a href={homeHref} title="Course home" className="hover:opacity-80">
                <Home className="h-4 w-4" />
              </a>
              <span>/</span>
              <a href={homeHref} className="hover:opacity-80">
                {courseTitle}
              </a>
              <span>/</span>
              <span className="font-medium" style={{ color: lessonTheme.breadcrumb.activeColor }}>
                {current.title}
              </span>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            <div
              className="min-w-0 space-y-4 rounded-2xl p-5 shadow-sm sm:p-6"
              style={{ backgroundColor: lessonTheme.player.backgroundColor }}
            >
              {current.embedUrl && (
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    src={current.embedUrl}
                    title={current.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              )}

              <h1 className="text-xl font-semibold text-[#202124]">{current.title}</h1>

              <div
                className="space-y-3 rounded-xl p-4"
                style={{ backgroundColor: lessonTheme.body.background }}
              >
                {lessonTheme.body.aboutHeadingText && (
                  <h2
                    className="text-sm font-semibold uppercase tracking-wide"
                    style={{ color: lessonTheme.body.aboutHeadingColor }}
                  >
                    {lessonTheme.body.aboutHeadingText}
                  </h2>
                )}
                {current.body && (
                  <div
                    className="prose prose-sm max-w-none leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: current.body }}
                  />
                )}
              </div>

              <button
                onClick={markComplete}
                disabled={saving || isCompleted}
                className="theme-btn inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold disabled:cursor-default"
                style={buttonStateStyle(isCompleted ? lessonTheme.body.ctaCompleted : lessonTheme.body.ctaIncomplete)}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCompleted ? lessonTheme.body.ctaCompleted.text : lessonTheme.body.ctaIncomplete.text}
              </button>

              {next && (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border p-4"
                  style={{
                    backgroundColor: lessonTheme.body.nextLessonCard.backgroundColor,
                    borderColor: lessonTheme.body.nextLessonCard.borderColor,
                  }}
                >
                  <div className="min-w-0 space-y-0.5">
                    <p
                      className="text-sm font-medium"
                      style={{ color: lessonTheme.body.nextLessonCard.messageColor }}
                    >
                      {lessonTheme.body.nextLessonCard.messageText}
                    </p>
                    <p
                      className="truncate text-xs"
                      style={{ color: lessonTheme.body.nextLessonCard.nextLessonTitleColor }}
                    >
                      {next.title}
                    </p>
                  </div>
                  <Link
                    href={lessonHref(next.id)}
                    className="shrink-0 text-sm font-semibold hover:underline"
                    style={{ color: lessonTheme.body.nextLessonCard.buttonTextColor }}
                  >
                    {lessonTheme.body.nextLessonCard.buttonText} <ChevronRight className="inline h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>

            <aside className="space-y-3">
              {sortedSidebar.map((block) => {
                if (block.type === "courseContent") {
                  return (
                    <div
                      key={block.id}
                      className="rounded-lg p-3"
                      style={{ backgroundColor: block.background }}
                    >
                      <div className="mb-2 flex items-center justify-between px-1">
                        <p className="text-sm font-semibold" style={{ color: block.headingColor }}>
                          {block.heading}
                        </p>
                        <p className="text-xs" style={{ color: block.lessonCountColor }}>
                          {totalLessons} {totalLessons === 1 ? "Lesson" : "Lessons"}
                        </p>
                      </div>
                      <div className="space-y-3">
                        {sections.map((s) => {
                          const ls = inSection(s.id);
                          if (ls.length === 0) return null;
                          return (
                            <div key={s.id}>
                              <p
                                className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide"
                                style={{ color: block.headingColor }}
                              >
                                {s.title}
                              </p>
                              <div>
                                {ls.map((l) => (
                                  <NavLesson key={l.id} l={l} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {other.length > 0 && (
                          <div>
                            {other.map((l) => (
                              <NavLesson key={l.id} l={l} />
                            ))}
                          </div>
                        )}
                      </div>
                      {(prevCategory || nextCategory) && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {prevCategory ? (
                            <Link
                              href={lessonHref(prevCategory.id)}
                              className="theme-btn flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium"
                              style={buttonStateStyle(block.previousButton)}
                            >
                              <ChevronLeft className="h-3.5 w-3.5" /> {block.previousButton.text}
                            </Link>
                          ) : (
                            <span />
                          )}
                          {nextCategory && (
                            <Link
                              href={lessonHref(nextCategory.id)}
                              className="theme-btn flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium"
                              style={buttonStateStyle(block.nextButton)}
                            >
                              {block.nextButton.text} <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                if (block.type === "instructor") {
                  return (
                    <InstructorBlockView
                      key={block.id}
                      block={block as InstructorSidebarBlock}
                      instructor={instructor}
                    />
                  );
                }
                if (block.type === "downloads") {
                  if (current.resourceLinks.length === 0) return null;
                  return (
                    <div
                      key={block.id}
                      className="space-y-2 rounded-lg p-3"
                      style={{ backgroundColor: block.background }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: block.headingColor }}
                      >
                        {block.heading}
                      </p>
                      <ul className="space-y-1">
                        {current.resourceLinks.map((r, i) => (
                          <li key={i}>
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-sm hover:underline"
                              style={{ color: block.linkColor }}
                            >
                              {r.label} <ExternalLink className="h-3 w-3" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
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
