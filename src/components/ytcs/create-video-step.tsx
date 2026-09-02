"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Save, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CREATE_VIDEO_STATUSES,
  EDITING_CHECKLIST_ITEMS,
  EDITS_LAB_URL,
  RECORDING_CHECKLIST_ITEMS,
} from "@/lib/ytcs/create-video-checklists";
import type { YtcsVideoProject } from "@/types/ytcs";

/**
 * Step 4: Create Video. NOT an AI generation step — this just tracks
 * moving the video through recording and editing to completion.
 *
 * Checklist toggles auto-save one item at a time (matching the
 * checklist-app expectation that clicking a checkbox is itself the
 * save action) and rely on Firestore's merge-set deep-merging nested
 * objects — verified directly against this project's own real data
 * during Phase 3A — so a toggle here never touches or drops any other
 * key already on `recordingChecklist`/`editingChecklist`, including
 * real historical entries whose keys don't match today's canonical
 * item labels (see the migration spec's Phase 3A addendum).
 */
export function CreateVideoStep({
  project,
  onSave,
}: {
  project: YtcsVideoProject;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
}) {
  const recordingChecklist = project.recordingChecklist ?? {};
  const editingChecklist = project.editingChecklist ?? {};

  const [recordingNotes, setRecordingNotes] = useState(project.recordingNotes ?? "");
  const [savingRecordingNotes, setSavingRecordingNotes] = useState(false);
  const [editingNotes, setEditingNotes] = useState(project.editingNotes ?? "");
  const [savingEditingNotes, setSavingEditingNotes] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    setRecordingNotes(project.recordingNotes ?? "");
    setEditingNotes(project.editingNotes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Legacy real editingChecklist keys that don't match a canonical item
  // label (e.g. "Record Hook", "c1", "c2" seen in real migrated data) —
  // surfaced read-only so nothing real silently disappears from view.
  const unmappedEditingKeys = Object.keys(editingChecklist).filter(
    (k) => !EDITING_CHECKLIST_ITEMS.includes(k),
  );
  const unmappedRecordingKeys = Object.keys(recordingChecklist).filter(
    (k) => !RECORDING_CHECKLIST_ITEMS.includes(k),
  );

  async function toggleItem(kind: "recordingChecklist" | "editingChecklist", item: string, checked: boolean) {
    setSavingItem(`${kind}:${item}`);
    try {
      await onSave({ [kind]: { [item]: checked } } as Partial<YtcsVideoProject>);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingItem(null);
    }
  }

  async function saveRecordingNotes() {
    setSavingRecordingNotes(true);
    try {
      await onSave({ recordingNotes });
      toast.success("Recording notes saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingRecordingNotes(false);
    }
  }

  async function saveEditingNotes() {
    setSavingEditingNotes(true);
    try {
      await onSave({ editingNotes });
      toast.success("Editing notes saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingEditingNotes(false);
    }
  }

  async function setStatus(status: string) {
    setSavingStatus(true);
    try {
      await onSave({ createVideoStatus: status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Step 4: Create Video</h2>
        <p className="text-sm text-muted-foreground">
          Move your video from script to finished file. This step is checklists and
          notes to keep you organized — nothing here is AI-generated.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Create Video Status</Label>
        <div className="flex flex-wrap gap-2">
          {CREATE_VIDEO_STATUSES.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={project.createVideoStatus === s ? "default" : "outline"}
              disabled={savingStatus}
              onClick={() => setStatus(s)}
            >
              {s}
            </Button>
          ))}
        </div>
        {project.createVideoStatus && !CREATE_VIDEO_STATUSES.includes(project.createVideoStatus) && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This project has an older status value not in the current list —{" "}
            <strong>&quot;{project.createVideoStatus}&quot;</strong>. It&apos;s preserved as-is; pick
            one of the options above only if you want to change it.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Recording Checklist</h3>
          <div className="mt-3 space-y-2">
            {RECORDING_CHECKLIST_ITEMS.map((item) => (
              <label key={item} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={recordingChecklist[item] === true}
                  disabled={savingItem === `recordingChecklist:${item}`}
                  onCheckedChange={(v) => toggleItem("recordingChecklist", item, v === true)}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          {unmappedRecordingKeys.length > 0 && (
            <LegacyKeysNote keys={unmappedRecordingKeys} data={recordingChecklist} />
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Editing Checklist</h3>
          <div className="mt-3 space-y-2">
            {EDITING_CHECKLIST_ITEMS.map((item) => (
              <label key={item} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={editingChecklist[item] === true}
                  disabled={savingItem === `editingChecklist:${item}`}
                  onCheckedChange={(v) => toggleItem("editingChecklist", item, v === true)}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          {unmappedEditingKeys.length > 0 && (
            <LegacyKeysNote keys={unmappedEditingKeys} data={editingChecklist} />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recording-notes">Recording Notes</Label>
        <Textarea
          id="recording-notes"
          value={recordingNotes}
          onChange={(e) => setRecordingNotes(e.target.value)}
          rows={4}
          placeholder="Anything to remember for the recording session — retakes, timing, setup..."
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={saveRecordingNotes} disabled={savingRecordingNotes}>
            {savingRecordingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Recording Notes
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="editing-notes">Editing Notes</Label>
        <Textarea
          id="editing-notes"
          value={editingNotes}
          onChange={(e) => setEditingNotes(e.target.value)}
          rows={4}
          placeholder="Anything to remember for the edit — cuts, pacing, music, captions..."
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={saveEditingNotes} disabled={savingEditingNotes}>
            {savingEditingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Editing Notes
          </Button>
        </div>
      </div>

      <a
        href={EDITS_LAB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Video className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            The Edits Lab
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Premium Resource
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Want help editing faster? Simple, clean video editing so you can finish
            polished videos without turning every upload into a production. You can
            still complete this step without it.
          </p>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
      </a>
    </div>
  );
}

function LegacyKeysNote({ keys, data }: { keys: string[]; data: Record<string, boolean> }) {
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      This project also has older checklist data not shown above:{" "}
      {keys.map((k) => `"${k}" (${data[k] ? "checked" : "unchecked"})`).join(", ")}. It&apos;s
      preserved, just not from today&apos;s checklist wording.
    </p>
  );
}
