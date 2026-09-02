"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { uploadYtcsVoiceNote } from "@/lib/ytcs/upload-voice-note";
import type { BusinessBrain } from "@/types/business-brain";
import type { YtcsVideoProject, YtcsVoiceNoteRef } from "@/types/ytcs";
import type { VoiceNote } from "@/types/media-attachment";

const SCRIPT_OUTPUT_TYPES = [
  "Full Script",
  "Structured Recording Draft",
  "Talking Point Outline",
  "Hybrid Script + Talking Points",
];

/**
 * Step 3: Script Prompt Builder. Builds a copy-paste AI prompt — never
 * generates the script in-app (migration spec §9). "Generate Script
 * Prompt" calls the deterministic server route (no AI model call);
 * regenerating only ever touches `generatedScriptPrompt`, never
 * `compiledScript` (Final Script Draft) — enforced server-side too, but
 * this UI never even sends compiledScript in that request.
 */
export function ScriptPromptBuilderStep({
  subAccountId,
  project,
  businessBrain,
  onSave,
}: {
  subAccountId: string;
  project: YtcsVideoProject;
  businessBrain: BusinessBrain | null;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
}) {
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>(
    project.scriptBuilderSelectedStoryProofIds ?? [],
  );
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>(
    project.scriptBuilderSelectedFrameworkIds ?? [],
  );
  const [extraNotes, setExtraNotes] = useState(project.scriptBuilderExtraNotes ?? "");
  const [scriptOutputType, setScriptOutputType] = useState(project.scriptOutputType || "Structured Recording Draft");
  const [depthPreference] = useState("Detailed"); // only real/confirmed value — see Phase 2 addendum
  const [generating, setGenerating] = useState(false);
  const [savingIngredients, setSavingIngredients] = useState(false);
  const [copied, setCopied] = useState(false);
  const [finalScript, setFinalScript] = useState(project.compiledScript ?? "");
  const [savingFinal, setSavingFinal] = useState(false);

  useEffect(() => {
    setFinalScript(project.compiledScript ?? "");
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

  async function generatePrompt() {
    setGenerating(true);
    try {
      await saveIngredients();
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}/generate-script-prompt`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't generate prompt");
      toast.success("Script Prompt Built — your custom script prompt is ready to copy.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate prompt");
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    if (!project.generatedScriptPrompt) return;
    try {
      await navigator.clipboard.writeText(project.generatedScriptPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  async function attachExtraNotesVoice(vn: VoiceNote) {
    const ref: YtcsVoiceNoteRef = {
      id: vn.id,
      storagePath: vn.storagePath,
      url: vn.url,
      mimeType: vn.mimeType,
      sizeBytes: vn.fileSizeBytes,
    };
    try {
      await onSave({ scriptBuilderVoiceNotes: [...(project.scriptBuilderVoiceNotes ?? []), ref] });
      toast.success("Voice note attached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't attach voice note.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Step 3: Script Prompt Builder</h2>
        <p className="text-sm text-muted-foreground">
          Build a strong copy-and-paste prompt for ChatGPT, Claude, or your AI tool of
          choice. This section builds the prompt, not the whole script.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Script Ingredients</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The studio automatically includes your Audience and Brand Voice when
          available. Choose stories, frameworks, or extra notes to make the generated
          prompt stronger.
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
            High-priority creator direction — add anything the generated prompt should
            emphasize, include, avoid, or remember.
          </p>
          <Textarea
            id="extra-notes"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            rows={3}
          />
          <VoiceNoteRecorder
            saId={subAccountId}
            confirmLabel="Attach"
            upload={uploadYtcsVoiceNote}
            onUploaded={attachExtraNotesVoice}
          />
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
        <p className="mt-1 text-xs text-muted-foreground">Tailor the prompt to get the right kind of draft.</p>

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
          <Label>Depth Preference</Label>
          <Button type="button" size="sm" variant="default" disabled>
            Detailed
          </Button>
          <p className="text-xs text-muted-foreground">
            Detailed gives you more material to work with. It is easier to cut down a
            rich draft than stretch a thin one. (Balanced/Concise aren&apos;t confirmed
            as real historical options yet — see the migration spec&apos;s Phase 2 notes.)
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <Button type="button" onClick={generatePrompt} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {project.generatedScriptPrompt ? "Regenerate this prompt" : "Generate Script Prompt"}
        </Button>
      </div>

      {project.generatedScriptPrompt && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Generated Script Prompt</Label>
            <Button type="button" size="sm" variant="outline" onClick={copyPrompt}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Prompt"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Copy this into ChatGPT, Claude, or your preferred AI tool.
          </p>
          <Textarea value={project.generatedScriptPrompt} readOnly rows={12} className="font-mono text-xs" />
        </div>
      )}

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="final-script">Save Final Script</Label>
        <p className="text-xs text-muted-foreground">
          Paste your finished script here to keep it with the project. This is never
          overwritten by regenerating the prompt above.
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
