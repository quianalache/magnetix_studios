"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MISSING_SCRIPT_GUARD } from "@/lib/ytcs/title-prompt";
import type { YtcsVideoProject } from "@/types/ytcs";

/**
 * Step 5: Titles. The final active product is the Title Prompt Builder
 * — a copy-paste AI prompt, never an in-app title generator (migration
 * spec §12). The old in-app generator's real output (`generatedTitles`/
 * `top3Titles`) lives read-only under this project's `legacy` bucket —
 * this component never reads or renders it.
 */
export function TitlesStep({
  project,
  onSave,
  onGenerate,
  onContinue,
}: {
  project: YtcsVideoProject;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onGenerate: () => Promise<void>;
  onContinue: () => void;
}) {
  const [selectedTitle, setSelectedTitle] = useState(project.selectedTitle ?? "");
  const [backupTitle, setBackupTitle] = useState(project.backupTitle ?? "");
  const [titleNotes, setTitleNotes] = useState(project.titleNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    setSelectedTitle(project.selectedTitle ?? "");
    setBackupTitle(project.backupTitle ?? "");
    setTitleNotes(project.titleNotes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const hasScript = !!project.compiledScript?.trim();

  async function generate() {
    setGenerating(true);
    try {
      await onGenerate();
      toast.success("Title Prompt built — ready to copy.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate the title prompt.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    if (!project.generatedTitlePrompt) return;
    try {
      await navigator.clipboard.writeText(project.generatedTitlePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          Build a strong copy-and-paste title prompt for ChatGPT, Claude, or your AI
          tool of choice, based on your actual Final Script Draft.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Title Prompt Builder</h3>

        {!hasScript ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{MISSING_SCRIPT_GUARD}</p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            The prompt is built from your Final Script Draft, plus your Audience and
            Brand Voice when available.
          </p>
        )}

        <div className="mt-4 flex justify-center">
          <Button type="button" onClick={generate} disabled={generating || !hasScript}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {project.generatedTitlePrompt ? "Regenerate Title Prompt" : "Generate Title Prompt"}
          </Button>
        </div>

        {project.generatedTitlePrompt && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Generated Title Prompt</Label>
              <Button type="button" size="sm" variant="outline" onClick={copyPrompt}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy Title Prompt"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Copy this into ChatGPT, Claude, or your preferred AI tool.
            </p>
            <Textarea value={project.generatedTitlePrompt} readOnly rows={12} className="font-mono text-xs" />
          </div>
        )}
      </div>

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

      <div className="flex justify-center">
        <Button type="button" onClick={continueToPublish} disabled={continuing}>
          {continuing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue to Publish
        </Button>
      </div>
    </div>
  );
}
