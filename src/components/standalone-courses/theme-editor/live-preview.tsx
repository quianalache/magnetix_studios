"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeToStandaloneSections,
  subscribeToStandaloneLessons,
} from "@/lib/firestore/standalone-courses";
import { CourseSalesPageView } from "@/components/standalone-courses/course-sales-page-view";
import {
  StandaloneLessonPlayer,
  type PlayerSection,
  type PlayerLesson,
} from "@/components/standalone-courses/standalone-lesson-player";
import type { CrossSellTargetInfo } from "@/components/standalone-courses/theme-blocks";
import { embedUrlFor } from "@/lib/community/video-embed";
import { lessonBodyToEditorHtml } from "@/lib/community/lesson-html-shared";
import type {
  StandaloneCourse,
  StandaloneCourseSection,
  StandaloneLesson,
  StandaloneCourseCurriculumSection,
} from "@/types/standalone-courses";
import type { CourseOffer } from "@/types/course-offers";
import type { CourseTheme, LessonTheme } from "@/types/course-theme";

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

/** Client-side mirror of `getCurriculumOutline` (Admin SDK, server-only) —
 *  same "lessons with no section are never attributed to a section" quirk,
 *  since this must match what the real public page actually shows. */
function computeOutline(
  sections: StandaloneCourseSection[],
  lessons: StandaloneLesson[],
): StandaloneCourseCurriculumSection[] {
  const counts = new Map<string, number>();
  for (const l of lessons) {
    if (!l.published || !l.sectionId) continue;
    counts.set(l.sectionId, (counts.get(l.sectionId) ?? 0) + 1);
  }
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ id: s.id, title: s.title, order: s.order, lessonCount: counts.get(s.id) ?? 0 }));
}

/**
 * Live preview pane for the theme editor — renders the SAME
 * `CourseSalesPageView` the real public page uses, fed by the in-progress
 * local `theme` state instead of saved data, so edits show up instantly
 * with no save/reload round trip. Always shows the signed-out, not-yet-
 * enrolled state (member=null) since that's what a new visitor sees.
 */
export function ThemeLivePreview({
  saId,
  courseId,
  course,
  theme,
  lessonTheme,
  page,
  otherOffers,
}: {
  saId: string;
  courseId: string;
  course: StandaloneCourse;
  theme: CourseTheme;
  lessonTheme: LessonTheme;
  /** Which page the "Pages: Product / Lesson" switcher currently has
   *  selected — Product renders `CourseSalesPageView`, Lesson renders
   *  `StandaloneLessonPlayer` against the course's first lesson (or an
   *  empty-state message if it has none yet). */
  page: "product" | "lesson";
  otherOffers: CourseOffer[];
}) {
  const [sections, setSections] = useState<StandaloneCourseSection[]>([]);
  const [lessons, setLessons] = useState<StandaloneLesson[]>([]);

  useEffect(() => {
    const u1 = subscribeToStandaloneSections(saId, courseId, setSections);
    const u2 = subscribeToStandaloneLessons(saId, courseId, setLessons);
    return () => {
      u1();
      u2();
    };
  }, [saId, courseId]);

  const outline = useMemo(() => computeOutline(sections, lessons), [sections, lessons]);
  const totalLessons = outline.reduce((sum, s) => sum + s.lessonCount, 0);

  const crossSellTargets = useMemo(() => {
    const map = new Map<string, CrossSellTargetInfo>();
    for (const o of otherOffers) {
      map.set(o.id, {
        id: o.id,
        title: o.title,
        priceCents: o.priceCents,
        currency: o.currency,
        type: o.type,
        visibility: o.visibility,
      });
    }
    return map;
  }, [otherOffers]);

  const priceLabel =
    course.access === "purchase" ? formatPrice(course.priceCents, course.currency) : "Free";
  // `sanitizeLessonHtml` pulls in a Node-only HTML parser (server-only) — not
  // usable from this client component. Not needed here anyway: this is the
  // staff's own already-authored content (edited elsewhere, in Course
  // Settings), viewed only by themselves in their own dashboard session.
  // The REAL public page still fully sanitizes before showing it to visitors.
  const aboutHtml = course.aboutHtml;

  if (page === "lesson") {
    const playerSections: PlayerSection[] = [...sections]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ id: s.id, title: s.title }));
    const sectionIds = new Set(playerSections.map((s) => s.id));
    const playerLessons: PlayerLesson[] = [...lessons]
      .filter((l) => l.published)
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        id: l.id,
        title: l.title,
        // Lessons whose sectionId doesn't resolve to a real section are
        // grouped as "other", same rule `StandaloneLessonPlayer` itself uses.
        sectionId: l.sectionId && sectionIds.has(l.sectionId) ? l.sectionId : null,
        embedUrl: embedUrlFor(l.videoProvider, l.videoId),
        body: lessonBodyToEditorHtml(l.bodyHtml),
        resourceLinks: l.resourceLinks ?? [],
      }));

    if (playerLessons.length === 0) {
      return (
        <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
          Add a lesson to this course to preview the Lesson page.
        </div>
      );
    }

    return (
      <StandaloneLessonPlayer
        completeEndpoint="#"
        lessonHrefBase="#"
        homeHref="#"
        saId={saId}
        lessonTheme={lessonTheme}
        courseTitle={course.title}
        courseCoverUrl={course.coverUrl}
        instructor={course.instructor}
        crossSellTargets={crossSellTargets}
        sections={playerSections}
        lessons={playerLessons}
        currentLessonId={playerLessons[0].id}
        completedIds={[]}
        interactive={false}
      />
    );
  }

  return (
    <CourseSalesPageView
      saId={saId}
      courseId={courseId}
      course={course}
      theme={theme}
      outline={outline}
      priceLabel={priceLabel}
      aboutHtml={aboutHtml}
      member={null}
      enrollment={null}
      totalLessons={totalLessons}
      completedCount={0}
      crossSellTargets={crossSellTargets}
      interactive={false}
    />
  );
}
