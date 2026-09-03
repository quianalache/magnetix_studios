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
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { LegacyVoiceNotes } from "@/components/ytcs/legacy-voice-notes";
import type { BusinessBrain } from "@/types/business-brain";
import type { YtcsVideoProject } from "@/types/ytcs";

/** Exported so YTCS Settings can reuse the same 4 real values for its
 *  Default Script Output Type control — one source of truth. */
export const SCRIPT_OUTPUT_TYPES = [
  "Full Script",
  "Structured Recording Draft",
  "Talking Point Outline",
  "Hybrid Script + Talking Points",
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
  const [savingIngredients, setSavingIngredients] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState(project.generatedScript ?? "");
  const [savingGeneratedScript, setSavingGeneratedScript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [applyingToFinal, setApplyingToFinal] = useState(false);

  const [promptOpen, setPromptOpen] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const [finalScript, setFinalScript] = useState(project.compiledScript ?? "");
  const [savingFinal, setSavingFinal] = useState(false);

  useEffect(() => {
    setFinalScript(project.compiledScript ?? "");
    setGeneratedScript(project.generatedScript ?? "");
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
      if (data.truncated) {
        toast.warning("Script generated, but it may be incomplete — it reached the output limit.");
      } else {
        toast.success("Script generated.");
      }
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

  /** Explicit, never-silent replace of Final Script Draft. */
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
      toast.success("Final Script Draft updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the Final Script Draft.");
    } finally {
      setApplyingToFinal(false);
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
      toast.success("Final Script Draft saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingFinal(false);
    }
  }

  const meta = project.generatedScriptMeta;
  const showTruncationWarning = !!meta?.truncated && generatedScript === (project.generatedScript ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Step 3: Script Prompt Builder</h2>
        <p className="text-sm text-muted-foreground">
          Generate your script right here, built from your Business Brain and everything
          you&apos;ve saved so far. Prefer your own AI tool? The prompt is still available below.
        </p>
      </div>

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

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Script Output Settings</h3>
        <p className="mt-1 text-xs text-muted-foreground">Tailor the script to the right kind of draft.</p>

        <div className="mt-3 space-y-1.5">
          <Label>Script Output Type</Label>
          <div className="flex flex-wrap gap-2">
            {SCRIPT_OUTPUT_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={scriptOutputType === t ? "default" : "outline"}
                onClick={() => setScriptOutputType(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="depth-preference">Depth Preference</Label>
          <select
            id="depth-preference"
            value={depthPreference}
            onChange={(e) => setDepthPreference(e.target.value)}
            className="h-9 w-full rounded-xl border border-input bg-muted/30 px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground sm:w-auto"
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
        </div>
      </div>

      {/* Primary action */}
      <div className="flex justify-center">
        <Button type="button" size="lg" onClick={generateScript} disabled={generatingScript}>
          {generatingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generatingScript ? "Generating…" : generatedScript ? "Regenerate Script" : "Generate Script"}
        </Button>
      </div>

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
                className="mt-3"
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

      {/* Secondary / power-user path — unchanged behavior, just demoted */}
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
                <Textarea value={project.generatedScriptPrompt} readOnly rows={12} className="font-mono text-xs" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="final-script">Final Script Draft</Label>
        <p className="text-xs text-muted-foreground">
          This is the script that moves on to Create Video, Titles, and Publish. Paste
          your own finished script here, or use &quot;Use as Final Script Draft&quot; above.
          Never overwritten automatically.
        </p>
        <Textarea
          id="final-script"
          value={finalScript}
          onChange={(e) => setFinalScript(e.target.value)}
          rows={10}
        />
        <div className="flex justify-end">
          <Button type="button" onClick={saveFinalScript} disabled={savingFinal}>
            {savingFinal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Final Script
          </Button>
        </div>
      </div>

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
