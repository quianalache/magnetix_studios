import { BookOpen } from "lucide-react";
import type { StandaloneCourseCurriculumSection } from "@/types/standalone-courses";

/**
 * Summary-only curriculum outline for the public sales page — section names
 * + lesson counts, collapsible, no individual lesson titles/links
 * pre-purchase (matches the GoKollab reference).
 */
export function CurriculumOutline({
  sections,
}: {
  sections: StandaloneCourseCurriculumSection[];
}) {
  if (sections.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-[#202124]">Course content</h2>
      {sections.map((s, i) => (
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
              {s.lessonCount} {s.lessonCount === 1 ? "Lesson" : "Lessons"}
            </span>
          </summary>
        </details>
      ))}
    </div>
  );
}
