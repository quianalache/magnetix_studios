"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeToStandaloneSections,
  subscribeToStandaloneLessons,
} from "@/lib/firestore/standalone-courses";
import { CourseSalesPageView } from "@/components/standalone-courses/course-sales-page-view";
import type { CrossSellTargetInfo } from "@/components/standalone-courses/theme-blocks";
import type {
  StandaloneCourse,
  StandaloneCourseSection,
  StandaloneLesson,
  StandaloneCourseCurriculumSection,
} from "@/types/standalone-courses";
import type { CourseTheme } from "@/types/course-theme";

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
  otherCourses,
}: {
  saId: string;
  courseId: string;
  course: StandaloneCourse;
  theme: CourseTheme;
  otherCourses: StandaloneCourse[];
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
    for (const c of otherCourses) {
      map.set(c.id, {
        id: c.id,
        title: c.title,
        priceCents: c.priceCents,
        currency: c.currency,
        access: c.access,
        published: c.published,
      });
    }
    return map;
  }, [otherCourses]);

  const priceLabel =
    course.access === "purchase" ? formatPrice(course.priceCents, course.currency) : "Free";
  // `sanitizeLessonHtml` pulls in a Node-only HTML parser (server-only) — not
  // usable from this client component. Not needed here anyway: this is the
  // staff's own already-authored content (edited elsewhere, in Course
  // Settings), viewed only by themselves in their own dashboard session.
  // The REAL public page still fully sanitizes before showing it to visitors.
  const aboutHtml = course.aboutHtml;

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
