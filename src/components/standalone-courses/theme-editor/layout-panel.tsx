"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Palette, Type, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ColorInput } from "@/components/ui/color-input";
import { ImageUpload } from "@/components/community/image-upload";
import { cn } from "@/lib/utils";
import { FontPicker } from "./font-picker";
import type {
  CourseThemeColors,
  CourseThemeFonts,
  CourseThemeBackground,
  CourseTheme,
  LessonTheme,
  CourseThemeTemplate,
} from "@/types/course-theme";

type SectionKey = "color" | "text" | "background";

function AccordionSection({
  icon: Icon,
  label,
  sectionKey,
  open,
  onToggle,
  children,
}: {
  icon: typeof Palette;
  label: string;
  sectionKey: SectionKey;
  open: boolean;
  onToggle: (key: SectionKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b">
      <button
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center gap-2.5 py-3 text-left text-sm font-medium"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">{label}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="space-y-3 pb-4">{children}</div>}
    </div>
  );
}

/** Layout tab — global Color Theme + Text Theme (collapsible, matching the
 *  reference), plus Apply Template. "Save as Template" itself lives in the
 *  editor's top bar since it acts on the whole in-progress theme, not just
 *  this panel. */
export function LayoutPanel({
  colors,
  fonts,
  background,
  onColorsChange,
  onFontsChange,
  onBackgroundChange,
  onUploadImage,
  saId,
  applyTarget,
  onApplied,
}: {
  colors: CourseThemeColors;
  fonts: CourseThemeFonts;
  background: CourseThemeBackground;
  onColorsChange: (next: CourseThemeColors) => void;
  onFontsChange: (next: CourseThemeFonts) => void;
  onBackgroundChange: (next: CourseThemeBackground) => void;
  /** Storage path (course theme vs offer theme) is the caller's concern —
   *  same reasoning as `BlockForm`'s `onUploadImage`. */
  onUploadImage: (file: File) => Promise<string>;
  saId: string;
  /** Templates are shared across Courses and Offers — this is just the
   *  request body the apply route needs to know which one to write onto. */
  applyTarget: { courseId: string } | { offerId: string };
  /** `lessonTheme` is only ever set when a template that has one gets
   *  applied to a Course (offers have no Lesson page to apply). */
  onApplied: (theme: CourseTheme, lessonTheme?: LessonTheme) => void;
}) {
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [templates, setTemplates] = useState<CourseThemeTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sub-accounts/${saId}/course-theme-templates`)
      .then((r) => r.json())
      .then((d: { templates?: CourseThemeTemplate[] }) => setTemplates(d.templates ?? []))
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, [saId]);

  function toggle(key: SectionKey) {
    setOpen((prev) => (prev === key ? null : key));
  }

  async function applyTemplate(templateId: string) {
    setApplyingId(templateId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${saId}/course-theme-templates/${templateId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(applyTarget),
        },
      );
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Couldn't apply template");
      const applied = templates.find((t) => t.id === templateId);
      if (applied) onApplied(applied.theme, applied.lessonTheme);
      toast.success("Template applied — remember to Save.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't apply template");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Layout Design</h2>
      </div>

      <AccordionSection
        icon={Palette}
        label="Color Theme"
        sectionKey="color"
        open={open === "color"}
        onToggle={toggle}
      >
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Base Colors</p>
          <div className="flex gap-3">
            <ColorInput
              value={colors.base[0]}
              onChange={(v) => onColorsChange({ ...colors, base: [v, colors.base[1]] })}
            />
            <ColorInput
              value={colors.base[1]}
              onChange={(v) => onColorsChange({ ...colors, base: [colors.base[0], v] })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Accent Colors</p>
          <div className="flex gap-3">
            {colors.accent.map((c, i) => (
              <ColorInput
                key={i}
                value={c}
                onChange={(v) => {
                  const next = [...colors.accent] as CourseThemeColors["accent"];
                  next[i] = v;
                  onColorsChange({ ...colors, accent: next });
                }}
              />
            ))}
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        icon={Type}
        label="Text Theme"
        sectionKey="text"
        open={open === "text"}
        onToggle={toggle}
      >
        <FontPicker
          label="Primary Font"
          value={fonts.primary}
          onChange={(v) => onFontsChange({ ...fonts, primary: v })}
        />
        <FontPicker
          label="Secondary Font"
          value={fonts.secondary}
          onChange={(v) => onFontsChange({ ...fonts, secondary: v })}
        />
      </AccordionSection>

      <AccordionSection
        icon={ImageIcon}
        label="Background Image"
        sectionKey="background"
        open={open === "background"}
        onToggle={toggle}
      >
        <p className="text-xs text-muted-foreground">
          A page-wide background, separate from the Hero banner&apos;s own
          background (set in the Hero tab).
        </p>
        <ImageUpload
          label="Background Image"
          hint="Recommended dimensions of 1920×1080."
          value={background.imageUrl}
          onChange={(url) => onBackgroundChange({ ...background, imageUrl: url })}
          onUpload={onUploadImage}
        />
        <div className="space-y-1.5">
          <Label>Transparency — {background.transparency}%</Label>
          <input
            type="range"
            min={0}
            max={100}
            value={background.transparency}
            onChange={(e) =>
              onBackgroundChange({ ...background, transparency: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>
      </AccordionSection>

      <div className={cn("space-y-2 pt-4")}>
        <Label>Apply Template</Label>
        {templatesLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved templates yet.</p>
        ) : (
          <div className="space-y-1.5">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm">{t.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applyTemplate(t.id)}
                  disabled={applyingId === t.id}
                >
                  {applyingId === t.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  Apply
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
