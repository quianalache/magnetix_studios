"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { VoiceNoteRecorder } from "@/components/community/voice-notes/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { deleteVoiceNote } from "@/lib/community/upload-voice-note";
import type { VoiceNote } from "@/types/media-attachment";

/**
 * Phase 1 internal test harness — NOT a product surface. Proves the
 * shared recorder/upload/player round trip end to end without inventing
 * any fake DM/post integration. Uploaded notes live only in this
 * component's local state (nothing is persisted to a message/post
 * anywhere) — reloading the page clears the list; the underlying Storage
 * objects can be individually deleted with the button below to prove the
 * cleanup path works.
 */
export function VoiceNoteLabClient({ saId, brand }: { saId: string; brand: string }) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleUploaded(voiceNote: VoiceNote) {
    setNotes((prev) => [voiceNote, ...prev]);
    toast.success("Uploaded — storagePath: " + voiceNote.storagePath);
  }

  async function handleDelete(note: VoiceNote) {
    setDeletingId(note.id);
    try {
      await deleteVoiceNote(saId, note.storagePath);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      toast.success("Deleted from Storage.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-4">
        <VoiceNoteRecorder saId={saId} brand={brand} onUploaded={handleUploaded} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[#202124]">
          Uploaded this session ({notes.length})
        </h2>
        {notes.length === 0 ? (
          <p className="text-sm text-[#909090]">
            Nothing uploaded yet. Record and send a note above.
          </p>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="flex items-center gap-3 rounded-xl border border-[#E4E4E4] bg-white p-3">
                <VoiceNotePlayer url={note.url} durationMs={note.durationMs} brand={brand} />
                <div className="flex-1 text-xs text-[#909090]">
                  <div>{note.mimeType}</div>
                  <div>{(note.fileSizeBytes / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(note)}
                  disabled={deletingId === note.id}
                  className="flex items-center gap-1 rounded-md border border-[#E4E4E4] px-2 py-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title="Delete from Storage (cleanup test)"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
