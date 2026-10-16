"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  ChevronRight,
  Check,
  Circle,
  CircleDot,
  Copy,
  Hexagon,
  Loader2,
  Moon,
  MoveHorizontal,
  Orbit,
  PaintBucket,
  Palette,
  Rows3,
  Share2,
  Sparkles,
  Star,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import type { ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import {
  buildEditorSavePayload,
  dirtyFields,
  dirtySystems,
  editorNameError,
  initChartDesignEditorState,
  isEditorDirty,
  previewDesign,
  setEditorField,
  setEditorName,
  CHART_DESIGN_EDITOR_TAB_PARAM,
  editorTabFromParam,
  editorTabSearch,
  type ChartDesignEditorTab,
} from "@/lib/energetics/chart-design-editor-state";
import {
  CHART_DESIGN_SECTIONS,
  CHART_SYSTEM_LABEL,
  ChartDesignFieldControl,
  ChartDesignPreview,
} from "@/components/energetic-decoder/chart-design-controls";
import {
  ChartDesignControlSection,
  ChartDesignEditorWorkspace,
  ChartPreviewFit,
  HumanDesignPreviewFit,
} from "@/components/energetic-decoder/chart-design-editor-workspace";
import { CHART_PREVIEW_MAX_SCALE, CHART_PREVIEW_NATURAL_WIDTH } from "@/lib/energetics/chart-design-preview-fit";

/**
 * The unified Chart Design editor (2026-10) — its own screen, opened from
 * the Chart Designs library. One design, one Save: switching between the
 * chart-system tabs keeps every unsaved edit, and Save Changes sends only
 * what changed, for every system at once. Each system's values stay its
 * own — nothing here copies one system's colors into another.
 *
 * Every system uses the same workspace (chart-design-editor-workspace.tsx):
 * one continuous page — header, tabs and the system's own controls scroll
 * with the page — and its live preview on the right, sticky beside the
 * controls and scaled to fit.
 *
 * Ready-made looks (Magnetix Violet, Monochrome, Warm Sunset, Midnight) are
 * whole designs in the library, not editor presets: choose one there, then
 * customize it here or duplicate it for a variation.
 */

type EditorTab = ChartDesignEditorTab;

const TABS: { key: EditorTab; label: string; icon: typeof Triangle }[] = [
  { key: "humanDesign", label: "Human Design", icon: Triangle },
  { key: "mandala", label: "Mandala", icon: CircleDot },
  { key: "astrology", label: "Astrology", icon: Moon },
  { key: "frequency", label: "Frequency", icon: Activity },
];

const SECTION_ICONS: Record<string, LucideIcon> = {
  Centers: Hexagon,
  "Channels and gates": Share2,
  Activations: Sparkles,
  Variables: MoveHorizontal,
  "Planet boxes": Rows3,
  Background: PaintBucket,
  Gates: CircleDot,
  "Rings and quadrants": Circle,
  Wheel: Orbit,
};

/** The first two sections of each system start expanded. */
function defaultOpenSections(system: ChartDesignSystem): string[] {
  return CHART_DESIGN_SECTIONS[system].slice(0, 2).map((s) => s.title);
}

export function ChartDesignEditor({ initial }: { initial: ChartDesignSetWithMembers }) {
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const router = useRouter();
  const [set, setSet] = useState(initial);
  const [state, setState] = useState(() => initChartDesignEditorState(initial));
  // The active tab comes from the URL (`?tab=`), so a refresh or a shared link keeps it; unknown values → Human Design.
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<EditorTab>(() => editorTabFromParam(searchParams.get(CHART_DESIGN_EDITOR_TAB_PARAM)));
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sampleHd, setSampleHd] = useState<HumanDesignProfile | null>(null);
  const [sampleAstro, setSampleAstro] = useState<AstrologyChart | null>(null);
  // Which control sections are expanded, per system — kept while switching tabs.
  const [openSections, setOpenSections] = useState<Partial<Record<ChartDesignSystem, string[]>>>({});

  const libraryHref = saPath("/energetic-decoder?tab=chartDesigns");
  const dirty = isEditorDirty(state);
  const changed = dirtySystems(state);
  const readOnly = !isAdmin;
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs/preview?sample=full`)
      .then((r) => r.json())
      .then((d) => {
        setSampleHd(d.humanDesign ?? null);
        setSampleAstro(d.astrology ?? null);
      })
      .catch(() => undefined);
  }, [subAccountId]);

  const previews = useMemo(
    () => ({
      humanDesign: previewDesign(set.designs.humanDesign, state.values.humanDesign),
      mandala: previewDesign(set.designs.mandala, state.values.mandala),
      astrology: previewDesign(set.designs.astrology, state.values.astrology),
    }),
    [set, state.values],
  );

  async function save() {
    const nameError = editorNameError(state);
    if (nameError) {
      toast.error(nameError);
      return;
    }
    const payload = buildEditorSavePayload(state);
    if (!payload) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-design-sets/${set.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { set?: ChartDesignSetWithMembers; error?: string };
      if (!res.ok || !body.set) throw new Error(body.error ?? "Couldn't save changes.");
      setSet(body.set);
      setState(initChartDesignEditorState(body.set));
      toast.success("Chart design saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (dirty && !window.confirm("Duplicate the last saved version? Your unsaved changes here won't be included.")) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-design-sets/${set.id}/duplicate`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { set?: { id: string }; error?: string };
      if (!res.ok || !body.set) throw new Error(body.error ?? "Couldn't duplicate.");
      toast.success("Duplicated.");
      // Unsaved edits were already confirmed away above.
      setState(initChartDesignEditorState(set));
      router.push(saPath(`/energetic-decoder/chart-designs/${body.set.id}${editorTabSearch("", tab)}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't duplicate.");
    } finally {
      setDuplicating(false);
    }
  }

  /** Switch tabs and record it in the URL (replacing the current history entry, so Back still leaves the editor). */
  function selectTab(next: EditorTab) {
    setTab(next);
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${editorTabSearch(search, next)}${hash}`);
  }

  const system = tab === "frequency" ? null : tab;
  const changedFields = system ? dirtyFields(state, system) : [];

  function toggleSection(sys: ChartDesignSystem, title: string) {
    setOpenSections((prev) => {
      const current = prev[sys] ?? defaultOpenSections(sys);
      return { ...prev, [sys]: current.includes(title) ? current.filter((t) => t !== title) : [...current, title] };
    });
  }

  return (
    // A purpose-built editing workspace, so it may run wider than the usual dashboard page (1500px vs 1400px):
    // the extra width goes to the preview, letting Human Design reach its natural size on wide screens.
    // v2 (2026-10-16): no `.momentum-scope` frame — white system panels on the canvas, and a record header
    // (breadcrumb, icon chip, editable name, Duplicate / Save Changes) like every Magnetix record page.
    <div className="mx-auto w-full max-w-[1500px] space-y-4">
      {/* Header */}
      <header className="flex flex-col gap-3" data-chart-design-header>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
          <Link href={saPath("/energetic-decoder")} className="hover:text-foreground hover:underline">
            Energetic Decoder
          </Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <Link href={libraryHref} className="hover:text-foreground hover:underline">
            Chart Designs
          </Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span aria-current="page" className="min-w-0 truncate font-medium text-foreground">
            {state.name || set.name}
          </span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg">
              <Palette className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={state.name}
                  onChange={(e) => setState((s) => setEditorName(s, e.target.value))}
                  disabled={readOnly}
                  maxLength={80}
                  aria-label="Chart design name"
                  className="-ml-1 min-w-0 max-w-full flex-1 rounded-md border border-transparent bg-transparent px-1 text-title-lg font-semibold tracking-tight text-foreground outline-none hover:border-border focus:border-border focus:bg-card disabled:hover:border-transparent"
                />
                {set.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-tag-gold-bg px-2 py-0.5 text-caption font-medium text-tag-gold-fg">
                    <Star className="size-3 fill-current" aria-hidden="true" />
                    Default
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">One design for every chart — each chart system keeps its own colors.</p>
            </div>
          </div>
          {!readOnly && (
            <div className="flex max-w-full flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void duplicate()} disabled={duplicating || saving}>
                {duplicating ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                Duplicate
              </Button>
              <Button onClick={() => void save()} disabled={!dirty || saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save Changes
              </Button>
            </div>
          )}
        </div>
      </header>

      {readOnly && (
        <div className="rounded-card border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          View only — only sub-account admins can change chart designs.
        </div>
      )}
      {dirty && !readOnly && (
        <Alert tone="warning">
          Unsaved changes{changed.length > 0 ? ` in ${changed.map((s) => CHART_SYSTEM_LABEL[s]).join(", ")}` : ""} — Save Changes keeps them.
        </Alert>
      )}

      {/* System tabs — in normal page flow: they scroll away with the header. */}
      <div data-editor-tabs className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isFrequency = t.key === "frequency";
          const hasChanges = !isFrequency && changed.includes(t.key as ChartDesignSystem);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={cn(
                "relative -mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {isFrequency && (
                <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Coming soon
                </span>
              )}
              {hasChanges && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="unsaved changes" />}
            </button>
          );
        })}
      </div>

      {system ? (
        <ChartDesignEditorWorkspace
          key={system}
          previewTitle={`${CHART_SYSTEM_LABEL[system]} preview`}
          previewNote="Sample chart · updates as you edit"
          preview={({ maxHeight }) => {
            const chart = (hdFill?: { height: number }) => (
              <ChartDesignPreview
                system={system}
                design={previews[system]}
                hdDesign={previews.humanDesign}
                sampleHd={sampleHd}
                sampleAstro={sampleAstro}
                size="large"
                className="w-full"
                hdFill={hdFill}
              />
            );
            // Human Design fills the preview unscaled (fixed-size rails, the BodyGraph sized on its own from the rest); the square charts scale to fit.
            return system === "humanDesign" ? (
              <HumanDesignPreviewFit maxScale={CHART_PREVIEW_MAX_SCALE.humanDesign} maxHeight={maxHeight}>
                {(fill) => chart(fill)}
              </HumanDesignPreviewFit>
            ) : (
              <ChartPreviewFit naturalWidth={CHART_PREVIEW_NATURAL_WIDTH[system]} maxScale={CHART_PREVIEW_MAX_SCALE[system]} maxHeight={maxHeight}>
                {chart()}
              </ChartPreviewFit>
            );
          }}
          controls={
            <>
              {CHART_DESIGN_SECTIONS[system].map((section) => {
                const open = (openSections[system] ?? defaultOpenSections(system)).includes(section.title);
                return (
                  <ChartDesignControlSection
                    key={section.title}
                    title={section.title}
                    description={section.description}
                    icon={SECTION_ICONS[section.title]}
                    open={open}
                    onToggle={() => toggleSection(system, section.title)}
                    hasChanges={section.fields.some((f) => changedFields.includes(f))}
                  >
                    {section.fields.map((field) => (
                      <ChartDesignFieldControl
                        key={field}
                        system={system}
                        field={field}
                        values={state.values[system]}
                        disabled={readOnly}
                        onChange={(f, v) => setState((s) => setEditorField(s, system, f, v))}
                      />
                    ))}
                  </ChartDesignControlSection>
                );
              })}
              {system === "astrology" && (
                <p className="px-1 text-xs text-muted-foreground">
                  The house system is a calculation setting, not part of a design — it lives in{" "}
                  <Link href={saPath("/energetic-decoder?tab=readings")} className="font-medium text-primary underline">
                    Readings → Reading configuration
                  </Link>
                  .
                </p>
              )}
            </>
          }
        />
      ) : (
        <div className="rounded-card border border-dashed border-border bg-card p-10 text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <h2 className="text-base font-semibold">Frequency styling is coming soon</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Frequency charts keep their current built-in colors for now. When Frequency styling is ready it will live here,
            inside this same design.
          </p>
        </div>
      )}
    </div>
  );
}
