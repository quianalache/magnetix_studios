"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { uploadYtcsVoiceNote } from "@/lib/ytcs/upload-voice-note";
import type { YtcsIdea, YtcsVoiceNoteRef } from "@/types/ytcs";
import type { VoiceNote } from "@/types/media-attachment";

/**
 * Create/edit form for a Saved Idea — the real confirmed schema only
 * (migration spec §14): title, type, notes, priority, status, plus
 * voice notes. No `whatSparkedThis`/`relatedTopicId`/etc. — those were
 * proposed but never actually built, per the spec's own reconciliation.
 * Type/Priority/Status are plain text (no confirmed enum exists for
 * any of them beyond one real value each — "Random Thought"/"Medium"/
 * "Someday" — so a dropdown would invent options with zero evidence);
 * new ideas default to those three real values since that's what every
 * real idea in the export actually used.
 */
export function IdeaDialog({
  subAccountId,
  open,
  onOpenChange,
  idea,
  onSaved,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = creating a new idea. */
  idea: YtcsIdea | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Random Thought");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [status, setStatus] = useState("Someday");
  const [voiceNotes, setVoiceNotes] = useState<YtcsVoiceNoteRef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(idea?.title ?? "");
    setType(idea?.type ?? "Random Thought");
    setNotes(idea?.notes ?? "");
    setPriority(idea?.priority ?? "Medium");
    setStatus(idea?.status ?? "Someday");
    setVoiceNotes(idea?.ideaVoiceNotes ?? []);
  }, [open, idea]);

  async function attachVoice(vn: VoiceNote) {
    const ref: YtcsVoiceNoteRef = {
      id: vn.id,
      storagePath: vn.storagePath,
      url: vn.url,
      mimeType: vn.mimeType,
      sizeBytes: vn.fileSizeBytes,
      attachedEntityType: "idea",
      status: "uploaded",
    };
    setVoiceNotes((prev) => [...prev, ref]);
  }

  function removeVoice(id: string) {
    setVoiceNotes((prev) => prev.filter((v) => v.id !== id));
  }

  async function save() {
    if (!title.trim()) {
      toast.error("Give the idea a title.");
      return;
    }
    setSaving(true);
    try {
      const body = { title: title.trim(), type, notes, priority, status, ideaVoiceNotes: voiceNotes };
      const res = await fetch(
        idea ? `/api/sub-accounts/${subAccountId}/ytcs/ideas/${idea.id}` : `/api/sub-accounts/${subAccountId}/ytcs/ideas`,
        {
          method: idea ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save");
      toast.success(idea ? "Idea updated." : "Idea saved.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{idea ? "Edit Idea" : "Save an Idea"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="idea-title">Title</Label>
            <Input id="idea-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="idea-type">Type</Label>
              <Input id="idea-type" value={type} onChange={(e) => setType(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-priority">Priority</Label>
              <Input id="idea-priority" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="idea-status">Status</Label>
            <Input id="idea-status" value={status} onChange={(e) => setStatus(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="idea-notes">Notes</Label>
            <Textarea
              id="idea-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="The random thought, hot take, or question itself..."
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5" /> Voice Notes
            </Label>
            {voiceNotes.map((vn) => (
              <div key={vn.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <VoiceNotePlayer url={vn.url ?? ""} durationMs={0} />
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeVoice(vn.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <VoiceNoteRecorder
              saId={subAccountId}
              confirmLabel="Attach"
              upload={uploadYtcsVoiceNote}
              onUploaded={attachVoice}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
