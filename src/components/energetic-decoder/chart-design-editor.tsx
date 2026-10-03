"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, ArrowLeft, Check, CircleDot, Copy, Loader2, Moon, Star, Triangle } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import type { ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import {
  applyEditorPreset,
  buildEditorSavePayload,
  dirtySystems,
  editorNameError,
  initChartDesignEditorState,
  isEditorDirty,
  previewDesign,
  setEditorField,
  setEditorHouseSystem,
  setEditorName,
  type HouseSystem,
} from "@/lib/energetics/chart-design-editor-state";
import {
  CHART_DESIGN_SECTIONS,
  CHART_SYSTEM_LABEL,
  ChartDesignFieldControl,
  ChartDesignPresetChips,
  ChartDesignPreview,
} from "@/components/energetic-decoder/chart-design-controls";

/**
 * The unified Chart Design editor (2026-10) — its own screen, opened from
 * the Chart Designs library. One design, one Save: switching between the
 * chart-system tabs keeps every unsaved edit, and Save Changes sends only
 * what changed, for every system at once. Each system's values stay its
 * own — nothing here copies one system's colors into another.
 */

type EditorTab = ChartDesignSystem | "frequency";

const TABS: { key: EditorTab; label: string; icon: typeof Triangle }[] = [
  { key: "humanDesign", label: "Human Design", icon: Triangle },
  { key: "mandala", label: "Mandala", icon: CircleDot },
  { key: "astrology", label: "Astrology", icon: Moon },
  { key: "frequency", label: "Frequency", icon: Activity },
];

const SYSTEMS: ChartDesignSystem[] = ["humanDesign", "mandala", "astrology"];

export function ChartDesignEditor({ initial }: { initial: ChartDesignSetWithMembers }) {
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const router = useRouter();
  const [set, setSet] = useState(initial);
  const [state, setState] = useState(() => initChartDesignEditorState(initial));
  const [tab, setTab] = useState<EditorTab>("humanDesign");
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sampleHd, setSampleHd] = useState<HumanDesignProfile | null>(null);
  const [sampleAstro, setSampleAstro] = useState<AstrologyChart | null>(null);

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
      router.push(saPath(`/energetic-decoder/chart-designs/${body.set.id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't duplicate.");
    } finally {
      setDuplicating(false);
    }
  }

  const system = tab === "frequency" ? null : tab;

  return (
    <div className="momentum-scope mx-auto w-full max-w-[1400px] space-y-5 rounded-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Link href={libraryHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Chart Designs
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={state.name}
              onChange={(e) => setState((s) => setEditorName(s, e.target.value))}
              disabled={readOnly}
              maxLength={80}
              aria-label="Chart design name"
              className="min-w-0 max-w-full flex-1 rounded-md border border-transparent bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-border focus:bg-background disabled:hover:border-transparent sm:text-3xl"
            />
            {set.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Star className="h-2.5 w-2.5 fill-current" />
                Default
              </span>
            )}
          </div>
          <p className="px-1 text-sm text-muted-foreground">
            One design for every chart — each chart system keeps its own colors.
          </p>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-2 pt-6">
            <Button variant="outline" onClick={() => void duplicate()} disabled={duplicating || saving}>
              {duplicating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
              Duplicate
            </Button>
            <Button onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {readOnly && (
        <div className="rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
          View only — only sub-account admins can change chart designs.
        </div>
      )}
      {dirty && !readOnly && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
          Unsaved changes{changed.length > 0 ? ` in ${changed.map((s) => CHART_SYSTEM_LABEL[s]).join(", ")}` : ""} — Save Changes keeps them.
        </div>
      )}

      {/* System tabs */}
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isFrequency = t.key === "frequency";
          const hasChanges = !isFrequency && changed.includes(t.key as ChartDesignSystem);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Large live preview */}
          <div className="rounded-2xl border bg-card p-5 lg:col-span-7">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{CHART_SYSTEM_LABEL[system]} preview</h2>
              <span className="text-xs text-muted-foreground">Sample chart · updates as you edit</span>
            </div>
            <div className="flex min-h-[560px] items-center justify-center rounded-xl border bg-white p-4">
              <ChartDesignPreview
                system={system}
                design={previews[system]}
                hdDesign={previews.humanDesign}
                sampleHd={sampleHd}
                sampleAstro={sampleAstro}
                size="large"
                className="mx-auto w-full max-w-[760px]"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-2 text-sm font-semibold">Color presets</h3>
              <ChartDesignPresetChips
                system={system}
                disabled={readOnly}
                onApply={(name) => setState((s) => applyEditorPreset(s, system, name))}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Fills this chart&apos;s colors as a starting point — adjust anything, then Save Changes.
              </p>
            </div>
            {CHART_DESIGN_SECTIONS[system].map((section) => (
              <div key={section.title} className="rounded-2xl border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold">{section.title}</h3>
                <div className="space-y-2.5">
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
                </div>
              </div>
            ))}
            {system === "astrology" && (
              <div className="rounded-2xl border border-dashed bg-card p-5">
                <h3 className="mb-1 text-sm font-semibold">House system</h3>
                {state.isDefault && state.houseSystem ? (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">
                      A calculation setting, not a color: new readings are calculated with the default design&apos;s house
                      system. Existing readings never change.
                    </p>
                    <select
                      value={state.houseSystem}
                      onChange={(e) => setState((s) => setEditorHouseSystem(s, e.target.value as HouseSystem))}
                      disabled={readOnly}
                      aria-label="House system"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="placidus">Placidus houses</option>
                      <option value="whole">Whole Sign houses</option>
                      <option value="equal">Equal houses</option>
                    </select>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A calculation setting, not a color — new readings use the house system set on your Default design.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <h2 className="text-base font-semibold">Frequency styling is coming soon</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Frequency charts keep their current built-in colors for now. When Frequency styling is ready it will live here,
            inside this same design.
          </p>
        </div>
      )}

      {/* The other charts in this design */}
      <div className="rounded-2xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Also in this design</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SYSTEMS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-3 text-sm transition hover:border-primary/40",
                tab === s && "border-primary/60 bg-primary/5",
              )}
            >
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-white p-1">
                <ChartDesignPreview system={s} design={previews[s]} sampleHd={sampleHd} sampleAstro={sampleAstro} size="thumb" className="h-full w-full" />
              </div>
              <span className="font-medium">{CHART_SYSTEM_LABEL[s]}</span>
            </button>
          ))}
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
            <Activity className="h-6 w-6" />
            <span className="font-medium">Frequency</span>
            <span className="text-[11px]">Coming soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}
