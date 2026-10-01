/**
 * Course navigation rules shared by every Standalone Course surface
 * (direct tenant + Agency courses, and courses opened inside a Community
 * Classroom). Pure and client-safe: the server pages use it to resolve the
 * learning-entry redirect, and `StandaloneLessonPlayer` uses it to find the
 * next lesson after completion.
 *
 * Three course settings stay deliberately separate:
 *  - `autoplayLessonVideos` — does a lesson's VIDEO start on load
 *    (`lesson-video.ts`, not here);
 *  - `autoplayFirstLesson` — does the normal learning-ENTRY action open the
 *    first available lesson instead of the course homepage;
 *  - `autoplayNextLesson` — does COMPLETING a lesson move the student on.
 *
 * Every function here only ever chooses among the lessons it is given. The
 * callers pass the student's already-filtered lessons (published, entitled,
 * chart-gate checked), so nothing here can open a lesson the student can't
 * access — and each lesson page re-checks access on load anyway.
 */
import type { StandaloneCourseLearningExperience } from "@/types/standalone-courses";

/**
 * Query flag carried by learning-entry links (enrollment success, "go to
 * course", Classroom catalog cards…). The course homepage URL WITHOUT it
 * always renders the homepage, so it stays directly reachable whatever the
 * course's first-lesson setting is.
 */
export const COURSE_ENTRY_PARAM = "enter";

/** The homepage URL used as a learning-entry action. */
export function courseEntryHref(homeHref: string): string {
  return `${homeHref}${homeHref.includes("?") ? "&" : "?"}${COURSE_ENTRY_PARAM}=1`;
}

/** True when the request arrived through a learning-entry link. */
export function isCourseEntryRequest(
  searchParams: Record<string, string | string[] | undefined> | null | undefined,
): boolean {
  const value = searchParams?.[COURSE_ENTRY_PARAM];
  return (Array.isArray(value) ? value[0] : value) === "1";
}

type LearningPrefs = Partial<Pick<StandaloneCourseLearningExperience, "autoplayFirstLesson" | "autoplayNextLesson">> | null | undefined;

/**
 * Lessons in the curriculum order students see: sections in their own
 * order, lessons within a section by `order`, then lessons with no valid
 * section last — the same grouping the course homepage and the lesson
 * sidebar render. (A lesson's `order` is not renumbered when sections are
 * reordered, so raw `order` alone isn't the visible order.)
 */
export function orderLessonsByCurriculum<L extends { id: string; sectionId: string | null; order?: number }>(
  sections: ReadonlyArray<{ id: string; order?: number }>,
  lessons: ReadonlyArray<L>,
): L[] {
  const rank = new Map(
    [...sections]
      .map((s, i) => ({ id: s.id, key: s.order ?? i, i }))
      .sort((a, b) => a.key - b.key || a.i - b.i)
      .map((s, i) => [s.id, i] as const),
  );
  return lessons
    .map((lesson, i) => ({ lesson, i }))
    .sort((a, b) => {
      const sa = a.lesson.sectionId != null && rank.has(a.lesson.sectionId) ? rank.get(a.lesson.sectionId)! : Infinity;
      const sb = b.lesson.sectionId != null && rank.has(b.lesson.sectionId) ? rank.get(b.lesson.sectionId)! : Infinity;
      if (sa !== sb) return sa - sb;
      return (a.lesson.order ?? a.i) - (b.lesson.order ?? b.i) || a.i - b.i;
    })
    .map(({ lesson }) => lesson);
}

/**
 * Where a learning-entry request should go: the first available lesson when
 * the course has "Automatically play first lesson" on, otherwise null
 * (render the homepage). Also null when the request isn't an entry request
 * or the student has no available lesson — the homepage then shows its
 * normal (possibly empty) curriculum, never a locked lesson.
 */
export function resolveCourseEntryLessonId(opts: {
  isEntry: boolean;
  learningExperience: LearningPrefs;
  sections: ReadonlyArray<{ id: string; order?: number }>;
  availableLessons: ReadonlyArray<{ id: string; sectionId: string | null; order?: number }>;
}): string | null {
  if (!opts.isEntry || opts.learningExperience?.autoplayFirstLesson !== true) return null;
  return orderLessonsByCurriculum(opts.sections, opts.availableLessons)[0]?.id ?? null;
}

/** The next available lesson after `currentLessonId` in curriculum order, or null at the end. */
export function nextAvailableLessonId(
  orderedLessonIds: ReadonlyArray<string>,
  currentLessonId: string,
): string | null {
  const idx = orderedLessonIds.indexOf(currentLessonId);
  return idx >= 0 ? orderedLessonIds[idx + 1] ?? null : null;
}

/**
 * Decides whether a just-recorded lesson completion should move the student
 * on. Advances only when the setting is on, the completion was a NEW one
 * (repeat completion events never navigate twice), and a next available
 * lesson exists — at the end of the course the student stays put.
 */
export function lessonToAdvanceTo(opts: {
  autoAdvance: boolean;
  alreadyAdvanced: boolean;
  orderedLessonIds: ReadonlyArray<string>;
  completedLessonId: string;
}): string | null {
  if (!opts.autoAdvance || opts.alreadyAdvanced) return null;
  return nextAvailableLessonId(opts.orderedLessonIds, opts.completedLessonId);
}

/** `=== true` reads, so an absent setting never turns a behavior on by accident. */
export function autoAdvanceEnabled(learningExperience: LearningPrefs): boolean {
  return learningExperience?.autoplayNextLesson === true;
}
