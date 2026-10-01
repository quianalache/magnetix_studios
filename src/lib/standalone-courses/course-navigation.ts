/**
 * Course navigation rules shared by every Standalone Course surface
 * (direct tenant + Agency courses, and courses opened inside a Community
 * Classroom). Pure and client-safe: the server pages use it to resolve the
 * Start-learning redirect, and `StandaloneLessonPlayer` uses it to find the
 * next lesson after completion.
 *
 * Three course settings stay deliberately separate:
 *  - `autoplayLessonVideos` — does a lesson's VIDEO start on load
 *    (`lesson-video.ts`, not here);
 *  - `autoplayFirstLesson` — does an explicit "Start / Continue learning"
 *    action open the first available lesson instead of the course homepage;
 *  - `autoplayNextLesson` — does COMPLETING a lesson move the student on.
 *
 * Every function here only ever chooses among the lessons it is given. The
 * callers pass the student's already-filtered lessons (published, entitled,
 * chart-gate checked), so nothing here can open a lesson the student can't
 * access — and each lesson page re-checks access on load anyway.
 */
import type { StandaloneCourseLearningExperience } from "@/types/standalone-courses";

/**
 * Query flag carried ONLY by explicit "Start / Continue learning" buttons.
 * Entering a course — Classroom catalog cards, other course catalogs,
 * enrollment/purchase success, notifications, the Portal — always links to
 * the plain course homepage URL, which always renders the customized
 * homepage whatever the course's first-lesson setting is (owner decision,
 * 2026-10-01: the homepage is always the entry point).
 */
export const START_LEARNING_PARAM = "start";

/** The homepage URL for an explicit Start / Continue learning action. */
export function startLearningHref(homeHref: string): string {
  return `${homeHref}${homeHref.includes("?") ? "&" : "?"}${START_LEARNING_PARAM}=1`;
}

/** True when the request came from an explicit Start / Continue learning action. */
export function isStartLearningRequest(
  searchParams: Record<string, string | string[] | undefined> | null | undefined,
): boolean {
  const value = searchParams?.[START_LEARNING_PARAM];
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
 * Where a Start / Continue learning action should go: the first available
 * lesson when the course has "Automatically play first lesson" on,
 * otherwise null (render the homepage). Also null for any other request —
 * plain course entry always shows the homepage — or when the student has
 * no available lesson, so a locked lesson is never opened.
 */
export function resolveStartLearningLessonId(opts: {
  isStartLearning: boolean;
  learningExperience: LearningPrefs;
  sections: ReadonlyArray<{ id: string; order?: number }>;
  availableLessons: ReadonlyArray<{ id: string; sectionId: string | null; order?: number }>;
}): string | null {
  if (!opts.isStartLearning || opts.learningExperience?.autoplayFirstLesson !== true) return null;
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
