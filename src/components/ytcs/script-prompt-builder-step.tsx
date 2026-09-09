"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleGroupTrigger } from "@/components/ui/collapsible";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { LegacyVoiceNotes } from "@/components/ytcs/legacy-voice-notes";
import type { BusinessBrain } from "@/types/business-brain";
import type { YtcsVideoProject } from "@/types/ytcs";
import type { ScriptGenerationRecord } from "@/lib/server/ytcs-script-generations-service";

/** Exported so YTCS Settings can reuse the same 4 real values for its
 *  Default Script Output Type control — one source of truth. */
export const SCRIPT_OUTPUT_TYPES = [
  "Full Script",
  "Structured Recording Draft",
  "Talking Point Outline",
  "Hybrid Script + Talking Points",
];

/**
 * Help-disclosure copy for the 4 Script Output Types, restored from the
 * original product's own screenshots (2026-09-03 UX correction pass —
 * see the migration spec's "Script Output Settings UX Restoration"
 * addendum). Kept as a separate export from `SCRIPT_OUTPUT_TYPES`
 * (which stays a plain string array) so YTCS Settings' own reuse of
 * that constant is completely unaffected by this addition.
 */
export const SCRIPT_OUTPUT_TYPE_DESCRIPTIONS = [
  {
    value: "Full Script",
    description:
      "Best if you want a complete draft written in full sentences. Use this when you want something you can read, lightly edit, or use as a strong starting script.",
  },
  {
    value: "Structured Recording Draft",
    description:
      "Best if you want strong structure, suggested lines, and detailed talking points without feeling like you have to memorize every word. This is the best default for most creators.",
  },
  {
    value: "Talking Point Outline",
    description:
      "Best if you like to speak naturally and only need the flow, main ideas, story cues, and CTA direction. This should feel like a recording map, not a word-for-word script.",
  },
  {
    value: "Hybrid Script + Talking Points",
    description:
      "Best if you want the hook, intro, momentum transitions, CTA, and watch-next bridge written out, while the teaching body stays in detailed talking points.",
  },
];

/**
 * CONFIRMED (2026-09-03) from direct visual evidence of the original
 * product's own screenshots — Depth Preference always had these three
 * active, selectable values. Earlier phases exposed only "Detailed"
 * because it was the only value real EXPORT DATA or the live audit
 * ever captured; that was real-data-honest at the time but was never a
 * claim that Balanced/Concise didn't exist in the product, only that
 * no evidence of them had been found yet. Superseded now that direct
 * visual evidence exists. Exported so YTCS Settings can reuse the same
 * 3 values + copy for its Default Depth Preference control.
 */
export const DEPTH_PREFERENCES = [
  {
    value: "Detailed",
    description:
      "Gives you more depth, examples, nuance, language, and transitions. Best when you want plenty of material to cut down later.",
  },
  {
    value: "Balanced",
    description:
      "Gives you enough detail to record confidently without making the draft too huge. Best when you want support without overwhelm.",
  },
  {
    value: "Concise",
    description:
      "Keeps the draft lean, focused, and easy to record. Best for quick videos or confident speakers who already know what they want to say.",
  },
];

/** Shared height cap for every long-form editor/box on this page
 *  (Generated Script, Final Script Draft, external Script Prompt, and
 *  each history item's expanded text) — 2026-09-09 Script + Titles AI
 *  UX pass. `field-sizing-content` on the base `Textarea` already lets
 *  it grow to fit short content; this only kicks in once content would
 *  otherwise make the page extremely tall, switching to internal
 *  scrolling instead. ~560px sits in the requested 500–600px range. */
const LONG_FORM_MAX_HEIGHT = "max-h-[560px] overflow-y-auto";

/**
 * Step 3: Script Prompt Builder. The deterministic prompt assembly
 * (regular YouTube Video / Product Showcase / Signature Offer Video,
 * Business Brain context, selected Stories + Proof / Frameworks,
 * Script Output Type, Depth Preference — migration spec §9) is
 * unchanged and still the orchestration layer. What changed (in-app
 * script generation enhancement): the primary action is now "Generate
 * Script" — the assembled prompt is sent to the model server-side and
 * the result lands in `generatedScript`, reviewable/editable, never
 * auto-written into `compiledScript` (Final Script Draft). The original
 * copy-paste prompt workflow (View Prompt / Copy Prompt / paste-your-
 * own-script) still works exactly as before — it's now a secondary,
 * power-user path, not removed.
 *
 * UX cleanup (2026-09-09 Script + Titles AI UX pass): Generated Script,
 * Final Script Draft, and the external prompt all render the same kind
 * of long text, which used to mean up to 3 full-height stacked
 * documents on one page. Now: Generated Script is a height-capped,
 * internally-scrolling editor; the last 3 generations are recoverable
 * from a collapsed "Previous Generations" list (full history/cost
 * stays in `ytcsScriptGenerations` forever — see
 * ytcs-script-generations-service.ts); Final Script Draft collapses to
 * a compact "Saved / Approved" status once it has content, expanding
 * to a height-capped editor only on "View / Edit"; the external prompt
 * stays collapsed by default with its own height cap. Visual order
 * now matches the target hierarchy: Ingredients → Output Settings →
 * Generate → Generated Script → Previous Generations → Final Draft →
 * external prompt → Continue.
 */
export function ScriptPromptBuilderStep({
  subAccountId,
  project,
  businessBrain,
  onSave,
  onContinue,
}: {
  subAccountId: string;
  project: YtcsVideoProject;
  businessBrain: BusinessBrain | null;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onContinue: () => void;
}) {
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>(
    project.scriptBuilderSelectedStoryProofIds ?? [],
  );
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>(
    project.scriptBuilderSelectedFrameworkIds ?? [],
  );
  const [extraNotes, setExtraNotes] = useState(project.scriptBuilderExtraNotes ?? "");
  const [scriptOutputType, setScriptOutputType] = useState(project.scriptOutputType || "Structured Recording Draft");
  const [depthPreference, setDepthPreference] = useState(project.depthPreference || "Detailed");
  const [outputTypeHelpOpen, setOutputTypeHelpOpen] = useState(false);
  const [depthHelpOpen, setDepthHelpOpen] = useState(false);
  const [savingIngredients, setSavingIngredients] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState(project.generatedScript ?? "");
  const [savingGeneratedScript, setSavingGeneratedScript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [applyingToFinal, setApplyingToFinal] = useState(false);

  // Fresh from each generate/use-as-current response, not the `project`
  // prop — this component's Generate/Regenerate/Use as Current actions
  // call their routes directly (not via `onSave`), so the parent's own
  // `project` prop is not guaranteed to reflect the very latest
  // generation the instant it completes. Same reasoning `generatedScript`
  // above already relies on local state for.
  const [activeGenerationId, setActiveGenerationId] = useState(project.activeScriptGenerationId ?? null);
  const [scriptMeta, setScriptMeta] = useState(project.generatedScriptMeta ?? null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ScriptGenerationRecord[]>([]);
  const [usingAsCurrentId, setUsingAsCurrentId] = useState<string | null>(null);

  const [promptOpen, setPromptOpen] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const [finalScript, setFinalScript] = useState(project.compiledScript ?? "");
  const [savingFinal, setSavingFinal] = useState(false);
  // Compact by default once a Final Script Draft already exists;
  // expanded by default when there isn't one yet, so a user starting
  // fresh (or pasting their own script instead of generating one) still
  // sees an editor immediately instead of an empty status card.
  const [finalDraftExpanded, setFinalDraftExpanded] = useState(!project.compiledScript?.trim());

  useEffect(() => {
    setFinalScript(project.compiledScript ?? "");
    setGeneratedScript(project.generatedScript ?? "");
    setActiveGenerationId(project.activeScriptGenerationId ?? null);
    setScriptMeta(project.generatedScriptMeta ?? null);
    setFinalDraftExpanded(!project.compiledScript?.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function loadHistory() {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}/script-generations`);
      const data = await res.json();
      if (res.ok && data.ok) setHistory(data.generations ?? []);
    } catch {
      // Best-effort — Previous Generations is a recovery convenience,
      // never required for the primary generate/edit/approve flow.
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const stories = businessBrain?.stories ?? [];
  const frameworks = businessBrain?.frameworks ?? [];
  const hasOffer = project.startingPointType === "productOffer" && !!project.productOfferInput?.selectedOfferId;

  function toggleStory(id: string) {
    setSelectedStoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleFramework(id: string) {
    setSelectedFrameworkIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveIngredients() {
    setSavingIngredients(true);
    try {
      await onSave({
        scriptBuilderSelectedStoryProofIds: selectedStoryIds,
        scriptBuilderSelectedFrameworkIds: selectedFrameworkIds,
        scriptBuilderExtraNotes: extraNotes,
        scriptOutputType,
        depthPreference,
      });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingIngredients(false);
    }
  }

  /** Bug fix (2026-09-03): this step never had a Continue action at all
   *  — the workspace's "currentStep" audit found the same gap here that
   *  Input already had before its own fix. Saves the current ingredients
   *  plus `currentStep: "Create Video"` in one request, and only
   *  navigates if that request actually succeeds — same pattern as
   *  every other Continue action in this workflow. */
  async function continueToCreateVideo() {
    setContinuing(true);
    try {
      await onSave({
        scriptBuilderSelectedStoryProofIds: selectedStoryIds,
        scriptBuilderSelectedFrameworkIds: selectedFrameworkIds,
        scriptBuilderExtraNotes: extraNotes,
        scriptOutputType,
        depthPreference,
        currentStep: "Create Video",
      });
      toast.success("Saved.");
      onContinue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setContinuing(false);
    }
  }

  /** Primary action. Saves the current ingredients first (so the
   *  server-side prompt assembly reflects what's on screen), then asks
   *  the model to write the script. A failed call never touches the
   *  previous `generatedScript` — this only updates local state (and
   *  therefore the textarea) when the request actually succeeds. */
  async function generateScript() {
    setGeneratingScript(true);
    // Client-side safety net (production incident 2026-09-02): the server
    // route has its own timeout and a 300s hard function ceiling, and
    // normally responds with a clean error well before that. This exists
    // only for the worst case — the connection itself drops silently and
    // the fetch promise never settles at all — so the spinner still
    // clears instead of running forever. Set comfortably above the
    // server's own 300s ceiling so the server's own clean error always
    // wins the race under normal conditions.
    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 310_000);
    try {
      await saveIngredients();
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}/generate-script`,
        { method: "POST", signal: controller.signal },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't generate the script");
      setGeneratedScript(data.project?.generatedScript ?? "");
      setActiveGenerationId(data.project?.activeScriptGenerationId ?? null);
      setScriptMeta(data.project?.generatedScriptMeta ?? null);
      if (data.truncated) {
        toast.warning("Script generated, but it may be incomplete — it reached the output limit.");
      } else {
        toast.success("Script generated.");
      }
      void loadHistory();
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      toast.error(
        timedOut
          ? "Generation timed out. Your previous script (if any) is unchanged — please try again."
          : err instanceof Error
            ? err.message
            : "Couldn't generate the script. Your previous script (if any) is unchanged.",
      );
    } finally {
      clearTimeout(clientTimeout);
      setGeneratingScript(false);
    }
  }

  async function saveGeneratedScriptEdits() {
    setSavingGeneratedScript(true);
    try {
      await onSave({ generatedScript });
      toast.success("Generated Script saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingGeneratedScript(false);
    }
  }

  async function copyGeneratedScript() {
    if (!generatedScript) return;
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  /** Explicit, never-silent replace of Final Script Draft. A normal
   *  save/copy of whatever's currently in the Generated Script editor —
   *  never calls AI, never spends tokens, never creates a generation.
   *  Collapses Final Script Draft back to its compact status once
   *  saved, confirming the approval. */
  async function useAsFinalScriptDraft() {
    if (!generatedScript.trim()) return;
    if (
      finalScript.trim() &&
      !confirm("You already have a Final Script Draft. Replace it with the Generated Script?")
    ) {
      return;
    }
    setApplyingToFinal(true);
    try {
      await onSave({ compiledScript: generatedScript });
      setFinalScript(generatedScript);
      setFinalDraftExpanded(false);
      toast.success("Final Script Draft updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the Final Script Draft.");
    } finally {
      setApplyingToFinal(false);
    }
  }

  /** Loads a retained prior generation back into the active Generated
   *  Script editor. Deliberately never touches Final Script Draft. */
  async function recoverGeneration(generationId: string) {
    setUsingAsCurrentId(generationId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}/script-generations/${generationId}/use-as-current`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't recover that generation");
      setGeneratedScript(data.project?.generatedScript ?? "");
      setActiveGenerationId(data.project?.activeScriptGenerationId ?? null);
      toast.success("Loaded into Generated Script.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't recover that generation.");
    } finally {
      setUsingAsCurrentId(null);
    }
  }

  /** Secondary/power-user path — unchanged from before generation
   *  existed: deterministic prompt assembly only, no model call. */
  async function generatePrompt() {
    setGeneratingPrompt(true);
    try {
      await saveIngredients();
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}/generate-script-prompt`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't generate prompt");
      toast.success("Script Prompt Built — ready to copy.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate prompt");
    } finally {
      setGeneratingPrompt(false);
    }
  }

  async function copyPrompt() {
    if (!project.generatedScriptPrompt) return;
    try {
      await navigator.clipboard.writeText(project.generatedScriptPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  async function saveFinalScript() {
    setSavingFinal(true);
    try {
      await onSave({ compiledScript: finalScript });
      setFinalDraftExpanded(false);
      toast.success("Final Script Draft saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingFinal(false);
    }
  }

  async function copyFinalScript() {
    if (!finalScript) return;
    try {
      await navigator.clipboard.writeText(finalScript);
      toast.success("Copied.");
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  const showTruncationWarning = !!scriptMeta?.truncated && generatedScript === (project.generatedScript ?? "");
  const previousGenerations = history.filter((h) => h.id !== activeGenerationId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Step 3: Script Prompt Builder</h2>
        <p className="text-sm text-muted-foreground">
          Generate your script right here, built from your Business Brain and everything
          you&apos;ve saved so far. Prefer your own AI tool? The prompt is still available below.
        </p>
      </div>

      {/* 1. Script Ingredients */}
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Script Ingredients</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The studio automatically includes your Audience and Brand Voice when
          available. Choose stories, frameworks, or extra notes to make the generated
          script stronger.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <IncludedBadge label="Audience" included={!!businessBrain?.audience?.help} />
          <IncludedBadge label="Brand Voice" included={!!businessBrain?.voice?.sound} />
          <IncludedBadge label="Creator Vision" included={!!businessBrain?.vision?.statement} />
          {hasOffer && (
            <IncludedBadge label={`Offer: ${project.productOfferInput?.selectedOfferName}`} included />
          )}
        </div>

        <div className="mt-4 space-y-2">
          <Label>Stories + Proof to Include · {selectedStoryIds.length} selected</Label>
          {stories.length === 0 && (
            <p className="text-xs text-muted-foreground">No stories saved yet.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {stories.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStory(s.id)}
                className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  selectedStoryIds.includes(s.id) ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                {s.name || "(untitled story)"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label>Frameworks to Include · {selectedFrameworkIds.length} selected</Label>
          {frameworks.length === 0 && (
            <p className="text-xs text-muted-foreground">No frameworks saved yet.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {frameworks.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFramework(f.id)}
                className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  selectedFrameworkIds.includes(f.id) ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                {f.name || "(untitled framework)"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="extra-notes">Extra Script Notes</Label>
          <p className="text-xs text-muted-foreground">
            High-priority creator direction — add anything the script should emphasize,
            include, avoid, or remember. Type, paste, or tap the mic to dictate.
          </p>
          <DictationTextarea id="extra-notes" value={extraNotes} onChange={setExtraNotes} rows={3} />
          {(project.scriptBuilderVoiceNotes?.length ?? 0) > 0 && (
            <LegacyVoiceNotes voiceNotes={project.scriptBuilderVoiceNotes!} />
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={saveIngredients} disabled={savingIngredients}>
            {savingIngredients ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Ingredients
          </Button>
        </div>
      </div>

      {/* 2. Script Output Settings — restored (2026-09-03) to match the
          original product's own screenshots: two real dropdowns,
          Script Output Type on the left and Depth Preference on the
          right, each with a collapsible "what does this mean?"
          disclosure underneath. */}
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Script Output Settings</h3>
        <p className="mt-1 text-xs text-muted-foreground">Tailor the prompt to get the right kind of draft.</p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="script-output-type">Script Output Type</Label>
            <select
              id="script-output-type"
              value={scriptOutputType}
              onChange={(e) => setScriptOutputType(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-muted/30 px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
            >
              {SCRIPT_OUTPUT_TYPE_DESCRIPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value}
                </option>
              ))}
            </select>
            <Collapsible open={outputTypeHelpOpen} onOpenChange={setOutputTypeHelpOpen}>
              <CollapsibleGroupTrigger>What do these script types mean?</CollapsibleGroupTrigger>
              <CollapsibleContent>
                <div className="space-y-2.5 pt-1 pb-2 text-xs text-muted-foreground">
                  {SCRIPT_OUTPUT_TYPE_DESCRIPTIONS.map((t) => (
                    <p key={t.value}>
                      <strong className="text-foreground">{t.value}:</strong> {t.description}
                    </p>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="depth-preference">Depth Preference</Label>
            <select
              id="depth-preference"
              value={depthPreference}
              onChange={(e) => setDepthPreference(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-muted/30 px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
            >
              {DEPTH_PREFERENCES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.value}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {DEPTH_PREFERENCES.find((d) => d.value === depthPreference)?.description}
            </p>
            <Collapsible open={depthHelpOpen} onOpenChange={setDepthHelpOpen}>
              <CollapsibleGroupTrigger>What does depth preference mean?</CollapsibleGroupTrigger>
              <CollapsibleContent>
                <div className="space-y-2.5 pt-1 pb-2 text-xs text-muted-foreground">
                  {DEPTH_PREFERENCES.map((d) => (
                    <p key={d.value}>
                      <strong className="text-foreground">{d.value}:</strong> {d.description}
                    </p>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>

      {/* 3. Generate / Regenerate Script */}
      <div className="flex justify-center">
        <Button type="button" size="lg" onClick={generateScript} disabled={generatingScript}>
          {generatingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generatingScript ? "Generating…" : generatedScript ? "Regenerate Script" : "Generate Script"}
        </Button>
      </div>

      {/* 4. Generated Script editor */}
      {(generatedScript || generatingScript) && (
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Generated Script</h3>
            {generatedScript && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={copyGeneratedScript}>
                  {copiedScript ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedScript ? "Copied" : "Copy"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={generateScript} disabled={generatingScript}>
                  {generatingScript ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Regenerate
                </Button>
              </div>
            )}
          </div>

          {showTruncationWarning && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This script may be incomplete because the generation reached its output limit.</p>
            </div>
          )}

          {generatingScript && !generatedScript ? (
            <div className="mt-3 flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Writing your script…
            </div>
          ) : (
            <>
              <Textarea
                value={generatedScript}
                onChange={(e) => setGeneratedScript(e.target.value)}
                rows={16}
                className={`mt-3 ${LONG_FORM_MAX_HEIGHT}`}
              />
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={saveGeneratedScriptEdits}
                  disabled={savingGeneratedScript}
                >
                  {savingGeneratedScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Edits
                </Button>
                <Button type="button" size="sm" onClick={useAsFinalScriptDraft} disabled={applyingToFinal}>
                  {applyingToFinal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Use as Final Script Draft
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 5. Previous Generations — up to the 2 other retained generations
          (the 3rd retained one is normally whichever is already active
          above). Full text included per item so "View" is instant, no
          extra round trip. */}
      {previousGenerations.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleGroupTrigger>
              Previous Generations ({previousGenerations.length})
            </CollapsibleGroupTrigger>
            <CollapsibleContent>
              <div className="space-y-3 pt-2">
                {previousGenerations.map((record) => (
                  <ScriptHistoryItem
                    key={record.id}
                    record={record}
                    onUseAsCurrent={() => recoverGeneration(record.id)}
                    usingAsCurrent={usingAsCurrentId === record.id}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* 6. Final Script Draft — compact status by default once it has
          content; View/Edit expands a height-capped editor. Saving or
          using this never calls AI. */}
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Final Script Draft</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          This is the script Magnetix will use for Create Video, Titles, and Publish.
          Never overwritten automatically.
        </p>

        {!finalDraftExpanded ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
              <Check className="h-4 w-4 shrink-0" />
              <span className="font-medium">Saved / Approved</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copyFinalScript}>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setFinalDraftExpanded(true)}>
                <Pencil className="h-3.5 w-3.5" />
                View / Edit
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Textarea
              id="final-script"
              value={finalScript}
              onChange={(e) => setFinalScript(e.target.value)}
              rows={10}
              className={`mt-3 ${LONG_FORM_MAX_HEIGHT}`}
              placeholder="Paste your own finished script here, or use “Use as Final Script Draft” above."
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {finalScript.trim() && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setFinalDraftExpanded(false)}>
                  Collapse
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={copyFinalScript} disabled={!finalScript}>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button type="button" size="sm" onClick={saveFinalScript} disabled={savingFinal}>
                {savingFinal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Final Script
              </Button>
            </div>
          </>
        )}
      </div>

      {/* 7. External script prompt — secondary/power-user path, unchanged
          behavior, collapsed by default. */}
      <div className="rounded-2xl border border-dashed p-4">
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-muted-foreground">
            Prefer your own AI tool? View or copy the prompt instead.
          </span>
          {promptOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {promptOpen && (
          <div className="mt-4 space-y-3">
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={generatePrompt} disabled={generatingPrompt}>
                {generatingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {project.generatedScriptPrompt ? "Regenerate this prompt" : "Build Script Prompt"}
              </Button>
            </div>

            {project.generatedScriptPrompt && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Generated Script Prompt</Label>
                  <Button type="button" size="sm" variant="outline" onClick={copyPrompt}>
                    {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedPrompt ? "Copied" : "Copy Prompt"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy this into ChatGPT, Claude, or your preferred AI tool.
                </p>
                <Textarea
                  value={project.generatedScriptPrompt}
                  readOnly
                  rows={12}
                  className={`font-mono text-xs ${LONG_FORM_MAX_HEIGHT}`}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 8. Continue to Create Video */}
      <div className="flex justify-center">
        <Button type="button" onClick={continueToCreateVideo} disabled={continuing}>
          {continuing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue to Create Video
        </Button>
      </div>
    </div>
  );
}

function IncludedBadge({ label, included }: { label: string; included: boolean }) {
  if (!included) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-400">
      <Check className="h-3 w-3" />
      {label}
    </span>
  );
}

/** One row in the "Previous Generations" list — compact by default,
 *  its own local "View" expand (rather than one shared toggle) so
 *  looking at two prior generations side by side is possible. */
function ScriptHistoryItem({
  record,
  onUseAsCurrent,
  usingAsCurrent,
}: {
  record: ScriptGenerationRecord;
  onUseAsCurrent: () => void;
  usingAsCurrent: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!record.scriptText) return;
    try {
      await navigator.clipboard.writeText(record.scriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  const when = new Date(record.generatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium">{when}</span>
          {record.scriptOutputType && <Badge variant="secondary">{record.scriptOutputType}</Badge>}
          {record.depthPreference && <Badge variant="secondary">{record.depthPreference}</Badge>}
          {record.status === "truncated" && <Badge variant="destructive">Incomplete</Badge>}
        </div>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide" : "View"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onUseAsCurrent} disabled={usingAsCurrent}>
            {usingAsCurrent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Use as Current
          </Button>
        </div>
      </div>
      {expanded && (
        <Textarea
          value={record.scriptText ?? ""}
          readOnly
          rows={10}
          className="mt-3 max-h-[400px] overflow-y-auto font-mono text-xs"
        />
      )}
    </div>
  );
}
