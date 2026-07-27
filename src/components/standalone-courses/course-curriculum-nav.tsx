import { BookOpen, CheckCircle2, Circle } from "lucide-react";

/**
 * Clickable version of `CurriculumOutline` (the pre-purchase, summary-only
 * accordion) — for the enrolled member's Course Home page, where each
 * section expands to real, linkable lesson rows instead of just a count.
 * Every row reuses the course's own cover image (no per-lesson thumbnail
 * field exists, and the GHL reference repeats the same course thumbnail on
 * every lesson row, so there's nothing to build there).
 */

export interface CurriculumNavSection {
  id: string;
  title: string;
}

export interface CurriculumNavLesson {
  id: string;
  title: string;
  sectionId: string | null;
}

export function CourseCurriculumNav({
  sections,
  lessons,
  completedIds,
  courseCoverUrl,
  lessonHrefBase,
  brand,
}: {
  sections: CurriculumNavSection[];
  lessons: CurriculumNavLesson[];
  completedIds: string[];
  courseCoverUrl: string | null;
  /** Base path a lesson id gets appended to. */
  lessonHrefBase: string;
  brand: string;
}) {
  if (lessons.length === 0) return null;

  const completed = new Set(completedIds);
  const sectionIds = new Set(sections.map((s) => s.id));
  const inSection = (sid: string | null) =>
    lessons.filter((l) =>
      sid === null
        ? !l.sectionId || !sectionIds.has(l.sectionId)
        : l.sectionId === sid,
    );
  const other = inSection(null);

  const Row = ({ l }: { l: CurriculumNavLesson }) => (
    <a
      href={`${lessonHrefBase}/${l.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.03]"
    >
      {completed.has(l.id) ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: brand }} />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-[#c4c4c4]" />
      )}
      {courseCoverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={courseCoverUrl}
          alt=""
          className="h-10 w-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-black/[0.05] text-xs font-semibold text-[#909090]">
          {l.title.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-medium text-[#202124]">{l.title}</span>
    </a>
  );

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-[#202124]">Course content</h2>
      {sections.map((s, i) => {
        const ls = inSection(s.id);
        if (ls.length === 0) return null;
        return (
          <details
            key={s.id}
            className="group rounded-lg border border-[#E4E4E4] bg-white"
            open={i === 0}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[#202124]">
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 shrink-0 text-[#909090]" />
                {i + 1}. {s.title}
              </span>
              <span className="text-xs text-[#909090]">
                {ls.length} {ls.length === 1 ? "Lesson" : "Lessons"}
              </span>
            </summary>
            <div className="divide-y divide-[#E4E4E4] border-t border-[#E4E4E4]">
              {ls.map((l) => (
                <Row key={l.id} l={l} />
              ))}
            </div>
          </details>
        );
      })}
      {other.length > 0 && (
        <div className="divide-y divide-[#E4E4E4] rounded-lg border border-[#E4E4E4] bg-white">
          {other.map((l) => (
            <Row key={l.id} l={l} />
          ))}
        </div>
      )}
    </div>
  );
}
