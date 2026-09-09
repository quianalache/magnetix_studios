"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MISSING_SCRIPT_GUARD } from "@/lib/ytcs/title-prompt";
import type { GeneratedTitleOption } from "@/lib/ytcs/title-generation";
import type { YtcsVideoProject } from "@/types/ytcs";

/** Same height-cap convention as Script Prompt Builder's long-form
 *  boxes (2026-09-09 Script + Titles AI UX pass) — the external prompt
 *  is the only long text left on this page now that generated titles
 *  render as compact cards instead of one giant textarea. */
const LONG_FORM_MAX_HEIGHT = "max-h-[560px] overflow-y-auto";

/**
 * Step 5: Titles. Generate Titles is now the primary, in-app AI action
 * (2026-09-09 Script + Titles AI UX pass) — reuses `buildTitlePrompt()`
 * completely unchanged (via `buildTitleGenerationPrompt()`, which only
 * adds a JSON-response-format instruction on top; see
 * title-generation.ts) for the real title strategy, same as
 * In-App Script Generation did for scripts. The external Title Prompt
 * Builder (copy-paste into ChatGPT/Claude) is preserved exactly as it
 * was — now collapsed by default as a secondary/power-user path,
 * matching Script Prompt Builder's own external-prompt treatment.
 * `generatedTitles`/`titleTopPick`/`titleThumbnailIdeas` are the AI's
 * output; `selectedTitle`/`backupTitle` stay the real, independently
 * editable approved fields — cards populate them via "Use as Primary/
 * Backup", they never lock them. The OLD in-app generator's real
 * historical output (`generatedTitles`/`top3Titles` in the `legacy`
 * bucket per migration spec §12/§18) is a completely different,
 * unrelated field and is still never read or rendered here.
 */
export function TitlesStep({
  subAccountId,
  project,
  onSave,
  onGenerate,
  onContinue,
}: {
  subAccountId: string;
  project: YtcsVideoProject;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onGenerate: () => Promise<void>;
  onContinue: () => void;
}) {
  const [selectedTitle, setSelectedTitle] = useState(project.selectedTitle ?? "");
  const [backupTitle, setBackupTitle] = useState(project.backupTitle ?? "");
  const [titleNotes, setTitleNotes] = useState(project.titleNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [continuing, setContinuing] = useState(false);

  // In-app title generation — local state, same reasoning as Script
  // Prompt Builder's `generatedScript`: this component's own fetch
  // calls the generate-titles route directly (not via `onSave`), so
  // results are held locally rather than trusted to stay in sync with
  // the `project` prop between renders.
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [titles, setTitles] = useState<GeneratedTitleOption[]>(project.generatedTitles ?? []);
  const [topPick, setTopPick] = useState(project.titleTopPick ?? null);
  const [thumbnailIdeas, setThumbnailIdeas] = useState<string[]>(project.titleThumbnailIdeas ?? []);

  // External Title Prompt Builder — unchanged logic, now collapsed by
  // default (was always-visible before this pass).
  const [promptOpen, setPromptOpen] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    setSelectedTitle(project.selectedTitle ?? "");
    setBackupTitle(project.backupTitle ?? "");
    setTitleNotes(project.titleNotes ?? "");
    setTitles(project.generatedTitles ?? []);
    setTopPick(project.titleTopPick ?? null);
    setThumbnailIdeas(project.titleThumbnailIdeas ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const hasScript = !!project.compiledScript?.trim();

  /** Primary action. Regenerating replaces the current 10-title result
   *  outright (no history at launch, per instruction) but never touches
   *  `selectedTitle`/`backupTitle` — those stay whatever the user
   *  already chose until they explicitly pick a different card. */
  async function generateTitles() {
    setGeneratingTitles(true);
    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 150_000);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}/generate-titles`,
        { method: "POST", signal: controller.signal },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't generate titles");
      setTitles(data.project?.generatedTitles ?? []);
      setTopPick(data.project?.titleTopPick ?? null);
      setThumbnailIdeas(data.project?.titleThumbnailIdeas ?? []);
      toast.success("Titles generated.");
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      toast.error(
        timedOut
          ? "Title generation timed out. Your previous titles (if any) are unchanged — please try again."
          : err instanceof Error
            ? err.message
            : "Couldn't generate titles. Your previous titles (if any) are unchanged.",
      );
    } finally {
      clearTimeout(clientTimeout);
      setGeneratingTitles(false);
    }
  }

  function applyAsPrimaryTitle(title: string) {
    setSelectedTitle(title);
    toast.success("Set as Selected Title — click Save Titles to keep it.");
  }
  function applyAsBackupTitle(title: string) {
    setBackupTitle(title);
    toast.success("Set as Backup Title — click Save Titles to keep it.");
  }

  /** Secondary/power-user path — unchanged from before in-app
   *  generation existed: deterministic prompt assembly only, no model
   *  call. */
  async function generatePrompt() {
    setGeneratingPrompt(true);
    try {
      await onGenerate();
      toast.success("Title Prompt built — ready to copy.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate the title prompt.");
    } finally {
      setGeneratingPrompt(false);
    }
  }

  async function copyPrompt() {
    if (!project.generatedTitlePrompt) return;
    try {
      await navigator.clipboard.writeText(project.generatedTitlePrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  async function saveTitles() {
    setSaving(true);
    try {
      await onSave({ selectedTitle, backupTitle, titleNotes });
      toast.success("Titles saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  /** Bug fix (2026-09-03): this button previously called `onContinue()`
   *  directly — no save, no `currentStep` write, so nothing on screen
   *  was guaranteed saved before navigating and a refresh always lost
   *  track of real progress past Titles. Now saves the current title
   *  fields plus `currentStep: "Publish"` in one request, and only
   *  navigates once that request actually succeeds. */
  async function continueToPublish() {
    setContinuing(true);
    try {
      await onSave({ selectedTitle, backupTitle, titleNotes, currentStep: "Publish" });
      toast.success("Saved.");
      onContinue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setContinuing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Step 5: Titles</h2>
        <p className="text-sm text-muted-foreground">
          Generate title options right here, built from your actual Final Script
          Draft. Prefer your own AI tool? The title prompt is still available below.
        </p>
      </div>

      {!hasScript && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{MISSING_SCRIPT_GUARD}</p>
        </div>
      )}

      {/* Primary action */}
      <div className="flex justify-center">
        <Button type="button" size="lg" onClick={generateTitles} disabled={generatingTitles || !hasScript}>
          {generatingTitles ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generatingTitles ? "Generating…" : titles.length > 0 ? "Regenerate Titles" : "Generate Titles"}
        </Button>
      </div>

      {titles.length > 0 && (
        <>
          <div className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold">Title Options</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The top 3 are marked below. Use as Primary or Backup on whichever fits —
              you can still edit both fields yourself afterward.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {titles.map((option, i) => (
                <TitleCard
                  key={`${option.title}-${i}`}
                  option={option}
                  isSelected={selectedTitle === option.title}
                  isBackup={backupTitle === option.title}
                  onUsePrimary={() => applyAsPrimaryTitle(option.title)}
                  onUseBackup={() => applyAsBackupTitle(option.title)}
                />
              ))}
            </div>
          </div>

          {topPick && (
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <h3 className="text-sm font-semibold">Top Pick</h3>
              <p className="text-sm font-medium">{topPick.title}</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>
                  <strong className="text-foreground">Why it works:</strong> {topPick.whyItWorks}
                </p>
                <p>
                  <strong className="text-foreground">Viewer tension:</strong> {topPick.viewerTension}
                </p>
                <p>
                  <strong className="text-foreground">Curiosity, promise, or benefit:</strong>{" "}
                  {topPick.curiosityPromiseBenefit}
                </p>
                <p>
                  <strong className="text-foreground">Why it fits the script:</strong> {topPick.whyItFitsScript}
                </p>
              </div>
            </div>
          )}

          {thumbnailIdeas.length > 0 && (
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <h3 className="text-sm font-semibold">Thumbnail Ideas</h3>
              <ul className="list-disc space-y-1 pl-4 text-sm">
                {thumbnailIdeas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Your Chosen Title</h3>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="selected-title">Selected Title</Label>
            <span className="text-xs text-muted-foreground">{selectedTitle.length} characters</span>
          </div>
          <Input
            id="selected-title"
            value={selectedTitle}
            onChange={(e) => setSelectedTitle(e.target.value)}
            placeholder="The title you're going with"
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="backup-title">Backup Title</Label>
            <span className="text-xs text-muted-foreground">{backupTitle.length} characters</span>
          </div>
          <Input
            id="backup-title"
            value={backupTitle}
            onChange={(e) => setBackupTitle(e.target.value)}
            placeholder="A strong alternative, just in case"
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="title-notes">Notes</Label>
          <Textarea
            id="title-notes"
            value={titleNotes}
            onChange={(e) => setTitleNotes(e.target.value)}
            rows={3}
            placeholder="Anything to remember about your title choice..."
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={saveTitles} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Titles
          </Button>
        </div>
      </div>

      {/* External Title Prompt — secondary/power-user path, unchanged
          behavior, collapsed by default. */}
      <div className="rounded-2xl border border-dashed p-4">
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-muted-foreground">
            Prefer your own AI tool? View or copy the title prompt instead.
          </span>
          {promptOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {promptOpen && (
          <div className="mt-4 space-y-3">
            {!hasScript ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{MISSING_SCRIPT_GUARD}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The prompt is built from your Final Script Draft, plus your Audience and
                Brand Voice when available.
              </p>
            )}

            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={generatePrompt} disabled={generatingPrompt || !hasScript}>
                {generatingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {project.generatedTitlePrompt ? "Regenerate this prompt" : "Build Title Prompt"}
              </Button>
            </div>

            {project.generatedTitlePrompt && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Generated Title Prompt</Label>
                  <Button type="button" size="sm" variant="outline" onClick={copyPrompt}>
                    {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedPrompt ? "Copied" : "Copy Title Prompt"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy this into ChatGPT, Claude, or your preferred AI tool.
                </p>
                <Textarea
                  value={project.generatedTitlePrompt}
                  readOnly
                  rows={12}
                  className={`font-mono text-xs ${LONG_FORM_MAX_HEIGHT}`}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Button type="button" onClick={continueToPublish} disabled={continuing}>
          {continuing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue to Publish
        </Button>
      </div>
    </div>
  );
}

function TitleCard({
  option,
  isSelected,
  isBackup,
  onUsePrimary,
  onUseBackup,
}: {
  option: GeneratedTitleOption;
  isSelected: boolean;
  isBackup: boolean;
  onUsePrimary: () => void;
  onUseBackup: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{option.title}</p>
        {option.topPickRank && <Badge>Top {option.topPickRank}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="secondary">{option.titleType}</Badge>
        <span>{option.characterCount} characters</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button type="button" size="sm" variant={isSelected ? "default" : "outline"} onClick={onUsePrimary}>
          {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
          Use as Primary
        </Button>
        <Button type="button" size="sm" variant={isBackup ? "default" : "outline"} onClick={onUseBackup}>
          {isBackup ? <Check className="h-3.5 w-3.5" /> : null}
          Use as Backup
        </Button>
      </div>
    </div>
  );
}
