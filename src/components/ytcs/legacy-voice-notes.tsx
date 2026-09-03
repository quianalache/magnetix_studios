"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import type { YtcsVoiceNoteRef } from "@/types/ytcs";

/**
 * Read-only playback for real historical voice-note recordings, shared
 * across every YTCS surface that replaced its active voice-note
 * recorder with dictation (Deep Dive first, Extra Script Notes second —
 * see the migration spec's Deep Dive Dictation / Extra Script Notes
 * Dictation addenda). Never the primary interaction anymore, just
 * preserved access. Renders nothing when a project has none (the
 * common case going forward).
 */
export function LegacyVoiceNotes({ voiceNotes }: { voiceNotes: YtcsVoiceNoteRef[] }) {
  const [open, setOpen] = useState(false);
  if (voiceNotes.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed p-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-xs text-muted-foreground"
      >
        <span>
          Legacy voice note{voiceNotes.length === 1 ? "" : "s"} from before dictation ({voiceNotes.length})
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {voiceNotes.map((vn) =>
            vn.url ? <VoiceNotePlayer key={vn.id} url={vn.url} durationMs={0} /> : null,
          )}
        </div>
      )}
    </div>
  );
}
