"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  LayoutPanelLeft,
  PanelTop,
  GalleryHorizontal,
  Rows3,
  PanelRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToStandaloneCourse,
  subscribeToStandaloneCourses,
} from "@/lib/firestore/standalone-courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { uploadCourseThemeImage } from "@/lib/community/upload-image";
import { LayoutPanel } from "@/components/standalone-courses/theme-editor/layout-panel";
import { HeaderPanel } from "@/components/standalone-courses/theme-editor/header-panel";
import { HeroPanel } from "@/components/standalone-courses/theme-editor/hero-panel";
import { BodyPanel } from "@/components/standalone-courses/theme-editor/body-panel";
import { SidebarPanel } from "@/components/standalone-courses/theme-editor/sidebar-panel";
import { ThemeLivePreview } from "@/components/standalone-courses/theme-editor/live-preview";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { CourseTheme } from "@/types/course-theme";

const TABS = ["Layout", "Header", "Hero", "Body", "Sidebar"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, typeof LayoutPanelLeft> = {
  Layout: LayoutPanelLeft,
  Header: PanelTop,
  Hero: GalleryHorizontal,
  Body: Rows3,
  Sidebar: PanelRight,
};

/**
 * Standalone-course theme editor — colors, fonts, background, and the
 * Header/Hero/Body/Sidebar content blocks that skin the public sales page.
 * Mirrors GoHighLevel's own course-page editor: a narrow icon rail + a
 * collapsible settings panel on the left, and a large live preview of the
 * actual sales page on the right (`ThemeLivePreview`, sharing its rendering
 * with the real public page so "looks identical" is structural, not
 * something kept in sync by hand).
 */
export default function CourseThemeEditorPage({
  params,
}: {
  params: Promise<{ subAccountId: string; courseId: string }>;
}) {
  const { courseId } = use(params);
  const { subAccountId } = useSubAccount();
  const apiBase = `/api/sub-accounts/${subAccountId}`;

  const [course, setCourse] = useState<StandaloneCourse | null>(null);
  const [otherCourses, setOtherCourses] = useState<StandaloneCourse[]>([]);
  const [theme, setTheme] = useState<CourseTheme | null>(null);
  const [tab, setTab] = useState<Tab>("Layout");
  const [panelOpen, setPanelOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    const u1 = subscribeToStandaloneCourse(subAccountId, courseId, (c) => {
      setCourse(c);
      // Only seed local edit state on first load — once the editor has its
      // own in-progress edits, further snapshot events (e.g. our own Save
      // round-tripping) must not clobber them.
      setTheme((prev) => prev ?? c?.theme ?? null);
      setLoaded(true);
    });
    const u2 = subscribeToStandaloneCourses(subAccountId, setOtherCourses);
    return () => {
      u1();
      u2();
    };
  }, [subAccountId, courseId]);

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!course || !theme) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Course not found.{" "}
        <Link href={`/sa/${subAccountId}/courses`} className="underline">
          Back to Courses
        </Link>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/standalone-courses/${courseId}/theme`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      if (!res.ok) throw new Error();
      toast.success("Theme saved.");
    } catch {
      toast.error("Couldn't save theme");
    } finally {
      setSaving(false);
    }
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) {
      toast.error("Name the template first");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch(`${apiBase}/course-theme-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName, theme }),
      });
      if (!res.ok) throw new Error();
      toast.success("Template saved.");
      setTemplateName("");
    } catch {
      toast.error("Couldn't save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  const selectableOtherCourses = otherCourses.filter(
    (c) => c.id !== courseId && c.published,
  );

  return (
    <div className="flex h-[calc(100vh-1px)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <Link
          href={`/sa/${subAccountId}/courses/${courseId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="rounded-lg border px-4 py-1.5 text-sm font-medium text-foreground">
          {course.title}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-[#1a1a1a] text-white hover:bg-[#1a1a1a]/85"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
          <Popover>
            <PopoverTrigger
              className={cn(
                "rounded-full bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-950 hover:bg-rose-200",
              )}
            >
              Save as Template
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Template name</p>
              <div className="flex gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Bold & Modern"
                  className="flex-1"
                />
                <Button size="sm" onClick={saveAsTemplate} disabled={savingTemplate}>
                  {savingTemplate && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <a href={`/course/${subAccountId}/${courseId}`} target="_blank" rel="noreferrer">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full bg-violet-100 text-violet-900 hover:bg-violet-200"
            >
              <ExternalLink className="h-4 w-4" /> Preview
            </Button>
          </a>
        </div>
      </div>

      {/* Editor body: icon rail + collapsible settings panel + live preview */}
      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-20 shrink-0 flex-col items-center gap-2 border-r py-4">
          {TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            const selected = tab === t;
            return (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setPanelOpen(true);
                }}
                className="flex w-full flex-col items-center gap-1 py-1 text-xs text-muted-foreground"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                    selected
                      ? "border-indigo-300 bg-rose-50 text-rose-950"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {t}
              </button>
            );
          })}
        </nav>

        {panelOpen && (
          <div className="relative w-[360px] shrink-0 overflow-y-auto border-r">
            <div className="p-5">
              {tab === "Layout" && (
                <LayoutPanel
                  colors={theme.colors}
                  fonts={theme.fonts}
                  background={theme.background}
                  onColorsChange={(colors) => setTheme({ ...theme, colors })}
                  onFontsChange={(fonts) => setTheme({ ...theme, fonts })}
                  onBackgroundChange={(background) => setTheme({ ...theme, background })}
                  onUploadImage={(file) =>
                    uploadCourseThemeImage(file, subAccountId, courseId, "background")
                  }
                  saId={subAccountId}
                  applyTarget={{ courseId }}
                  onApplied={setTheme}
                />
              )}
              {tab === "Header" && (
                <HeaderPanel
                  value={theme.header}
                  onChange={(header) => setTheme({ ...theme, header })}
                />
              )}
              {tab === "Hero" && (
                <HeroPanel
                  value={theme.hero}
                  onChange={(hero) => setTheme({ ...theme, hero })}
                  onUploadImage={(file) =>
                    uploadCourseThemeImage(file, subAccountId, courseId, "hero")
                  }
                />
              )}
              {tab === "Body" && (
                <BodyPanel
                  blocks={theme.body}
                  onChange={(body) => setTheme({ ...theme, body })}
                  categoryBlockTheme={theme.categoryBlock}
                  onCategoryBlockThemeChange={(categoryBlock) =>
                    setTheme({ ...theme, categoryBlock })
                  }
                  saId={subAccountId}
                  courseId={courseId}
                  otherCourses={selectableOtherCourses}
                />
              )}
              {tab === "Sidebar" && (
                <SidebarPanel
                  blocks={theme.sidebar}
                  onChange={(sidebar) => setTheme({ ...theme, sidebar })}
                  saId={subAccountId}
                  courseId={courseId}
                  otherCourses={selectableOtherCourses}
                />
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => setPanelOpen((o) => !o)}
          title={panelOpen ? "Collapse panel" : "Expand panel"}
          className="flex w-5 shrink-0 items-center justify-center border-r bg-muted/30 text-muted-foreground hover:bg-muted"
        >
          {panelOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div className="flex-1 overflow-y-auto bg-[#F8F7F5]">
          <ThemeLivePreview
            saId={subAccountId}
            courseId={courseId}
            course={course}
            theme={theme}
            otherCourses={otherCourses}
          />
        </div>
      </div>
    </div>
  );
}
