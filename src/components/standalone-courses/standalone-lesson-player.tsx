"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ProgressBlockView,
  InstructorBlockView,
  type CrossSellTargetInfo,
} from "@/components/standalone-courses/theme-blocks";
import { isCoreSidebarBlock } from "@/types/course-theme";
import type { CourseTheme } from "@/types/course-theme";
import type { StandaloneCourseInstructor } from "@/types/standalone-courses";

/**
 * Standalone Course lesson player — forked from Community's `LessonPlayer`
 * (`src/components/community/classroom/lesson-player.tsx`) rather than
 * sharing it, since this version is driven by the full `CourseTheme` system
 * (sidebar blocks, Progress/Instructor core blocks, colors/fonts) which
 * Community courses have no equivalent of. Community's version stays a
 * simple `brand`-color-only player wrapped in its own `CommunityShell`.
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

export function StandaloneLessonPlayer({
  completeEndpoint,
  lessonHrefBase,
  homeHref,
  saId,
  theme,
  courseTitle,
  courseCoverUrl,
  instructor,
  crossSellTargets,
  sections,
  lessons,
  currentLessonId,
  completedIds: initialCompleted,
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
  theme: CourseTheme;
  courseTitle: string;
  courseCoverUrl: string | null;
  instructor: StandaloneCourseInstructor;
  crossSellTargets: ReadonlyMap<string, CrossSellTargetInfo>;
  sections: PlayerSection[];
  lessons: PlayerLesson[];
  currentLessonId: string;
  completedIds: string[];
}) {
  const lessonHref = (lessonId: string) => `${lessonHrefBase}/${lessonId}`;
  const router = useRouter();
  const [completed, setCompleted] = useState<Set<string>>(
    new Set(initialCompleted),
  );
  const [saving, setSaving] = useState(false);
  const brand = theme.hero.buttonColor;

  const current = lessons.find((l) => l.id === currentLessonId) ?? lessons[0];
  const idx = lessons.findIndex((l) => l.id === current.id);
  const next = lessons[idx + 1] ?? null;

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

  async function completeAndContinue() {
    setSaving(true);
    try {
      const res = await fetch(completeEndpoint, { method: "POST" });
      if (!res.ok) throw new Error();
      setCompleted((prev) => new Set(prev).add(current.id));
      if (next) {
        router.push(lessonHref(next.id));
      } else {
        toast.success("Course complete! 🎉");
        router.refresh();
      }
    } catch {
      toast.error("Couldn't save progress");
    } finally {
      setSaving(false);
    }
  }

  const NavLesson = ({ l }: { l: PlayerLesson }) => {
    const isCurrent = l.id === current.id;
    return (
      <Link
        href={lessonHref(l.id)}
        style={
          isCurrent
            ? {
                backgroundColor: `color-mix(in srgb, ${brand} 14%, white)`,
                color: brand,
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isCurrent
            ? "font-medium"
            : "text-[#3a3a44] hover:bg-black/[0.04]",
        )}
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
            className="h-8 w-12 shrink-0 rounded object-cover"
          />
        ) : null}
        <span className="truncate">{l.title}</span>
      </Link>
    );
  };

  const sidebarBlocks = [...theme.sidebar].sort((a, b) => a.order - b.order);
  const totalLessons = lessons.length;
  const completedCount = completed.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-[#909090]">
        <a href={homeHref} title="Course home" className="hover:text-[#202124]">
          <Home className="h-4 w-4" />
        </a>
        <span>/</span>
        <a href={homeHref} className="hover:text-[#202124]">
          {courseTitle}
        </a>
        <span>/</span>
        <span className="font-medium text-[#202124]">{current.title}</span>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-[#E4E4E4] bg-white p-5 shadow-sm sm:p-6">
          {current.embedUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-[#E4E4E4] bg-black">
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

          {current.body && (
            <div
              className="prose prose-sm max-w-none leading-relaxed prose-headings:text-[#202124] prose-p:text-[#3a3a44] prose-li:text-[#3a3a44] prose-strong:text-[#202124] prose-a:text-[color:var(--brand)]"
              style={{ ["--brand" as string]: brand }}
              dangerouslySetInnerHTML={{ __html: current.body }}
            />
          )}

          {current.resourceLinks.length > 0 && (
            <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#909090]">
                Resources
              </p>
              <ul className="space-y-1">
                {current.resourceLinks.map((r, i) => (
                  <li key={i}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-sm hover:underline"
                      style={{ color: brand }}
                    >
                      {r.label} <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={completeAndContinue}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {completed.has(current.id)
              ? next
                ? "Next lesson"
                : "Completed"
              : next
                ? "Complete & continue"
                : "Complete"}
          </button>
        </div>

        <aside className="space-y-3">
          {/* Static — always present, never a theme block. */}
          <div className="rounded-lg border border-[#E4E4E4] bg-white p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-[#202124]">Course Contents</p>
              <p className="text-xs text-[#909090]">
                {totalLessons} {totalLessons === 1 ? "Lesson" : "Lessons"}
              </p>
            </div>
            <div className="space-y-3">
              {sections.map((s) => {
                const ls = inSection(s.id);
                if (ls.length === 0) return null;
                return (
                  <div key={s.id}>
                    <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-[#909090]">
                      {s.title}
                    </p>
                    <div className="space-y-0.5">
                      {ls.map((l) => (
                        <NavLesson key={l.id} l={l} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {other.length > 0 && (
                <div className="space-y-0.5">
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
                    className="flex items-center justify-center gap-1 rounded-md border border-[#E4E4E4] px-2 py-1.5 text-xs font-medium text-[#3a3a44] hover:bg-black/[0.03]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Previous
                  </Link>
                ) : (
                  <span />
                )}
                {nextCategory && (
                  <Link
                    href={lessonHref(nextCategory.id)}
                    className="flex items-center justify-center gap-1 rounded-md border border-[#E4E4E4] px-2 py-1.5 text-xs font-medium text-[#3a3a44] hover:bg-black/[0.03]"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Customizable — same block list as the sales page + course home. */}
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
                <InstructorBlockView key={block.id} block={block} instructor={instructor} />
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
  );
}
