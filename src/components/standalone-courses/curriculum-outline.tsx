import type { CSSProperties } from "react";
import { BookOpen } from "lucide-react";
import type { CategoryBlockTheme } from "@/types/course-theme";
import type { StandaloneCourseCurriculumSection } from "@/types/standalone-courses";

/**
 * Summary-only curriculum outline for the public sales page — section names
 * + lesson counts, collapsible, no individual lesson titles/links
 * pre-purchase (matches the GoKollab reference). Styled by
 * `theme.categoryBlock` ("Category Block" in the GHL reference) — a fixed,
 * non-deletable page element, not one of the 6 optional block types.
 */
export function CurriculumOutline({
  sections,
  theme,
}: {
  sections: StandaloneCourseCurriculumSection[];
  theme: CategoryBlockTheme;
}) {
  if (sections.length === 0) return null;
  const cardStyle: CSSProperties = {
    backgroundColor: theme.background,
    borderColor: theme.borderColor,
    ["--category-hover" as string]: theme.hoverColor,
  } as CSSProperties;
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-[#202124]">Course content</h2>
      {sections.map((s, i) => (
        <details
          key={s.id}
          className="category-block-card group rounded-lg border transition-colors"
          style={cardStyle}
          open={i === 0}
        >
          <summary
            className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium"
            style={{ color: theme.categoryTitleColor }}
          >
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
