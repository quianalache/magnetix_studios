"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Mic, Send, Square, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { uploadVoiceNote } from "@/lib/community/upload-voice-note";
import { VoiceNotePlayer } from "./voice-note-player";
import type { VoiceNote } from "@/types/media-attachment";

type UploadFn = (opts: {
  saId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
}) => Promise<VoiceNote>;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

/**
 * Reusable record -> preview -> confirm -> upload widget. Surface-agnostic
 * by design: it knows nothing about DMs/Posts/channels — a finished
 * upload is handed back via `onUploaded`, and the caller decides what to
 * do with it (attach to a draft message, append to a list, etc). This is
 * the ONE recording UI Phase 2+ surfaces should mount, not rebuild.
 *
 * Deliberately keeps the preview-before-committing step (record -> stop
 * -> listen -> confirm) rather than auto-confirming on stop — audio can't
 * be corrected the way text can, so a real "does this sound right?"
 * moment before it's committed is worth the one extra tap, in a DM or a
 * post alike.
 *
 * `confirmLabel`/`confirmIcon` let the SAME confirm action communicate
 * differently per context (default "Send" — the right word once this
 * mounts inside a DM thread; a Community post composer passes "Attach"
 * instead, since "Send" a voice note followed by a separate "Post" button
 * for the whole post was confusing — see the Phase C QA correction). This
 * is a label/icon override only — the underlying confirm behavior
 * (upload, hand back via onUploaded, reset) is identical regardless of
 * context, so there's still exactly one recorder implementation.
 */
export function VoiceNoteRecorder({
  saId,
  brand = "#202124",
  confirmLabel = "Send",
  confirmIcon: ConfirmIcon = Send,
  upload = uploadVoiceNote,
  onUploaded,
}: {
  saId: string;
  brand?: string;
  confirmLabel?: string;
  confirmIcon?: LucideIcon;
  /** Defaults to the community voice-note upload path. Pass a different
   *  uploader (e.g. YTCS's own `/api/sub-accounts/[id]/ytcs/voice-notes`
   *  route) to reuse this same record/preview/confirm UI against a
   *  different auth/Storage destination — see YouTube Content Studio's
   *  Brain Dump input for the first non-community caller. */
  upload?: UploadFn;
  onUploaded: (voiceNote: VoiceNote) => void;
}) {
  const { state, elapsedMs, error, result, supported, start, stop, cancel, reset, maxDurationMs } =
    useVoiceRecorder();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Local, unauthenticated object-URL preview of the just-recorded blob —
  // playable immediately, before any upload happens.
  useEffect(() => {
    if (!result) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  async function send() {
    if (!result) return;
    setUploading(true);
    setUploadError(null);
    try {
      const voiceNote = await upload({
        saId,
        blob: result.blob,
        mimeType: result.mimeType,
        durationMs: result.durationMs,
      });
      onUploaded(voiceNote);
      reset();
    } catch (err) {
      // Deliberately keep `result` intact so Retry re-sends the SAME
      // blob without re-recording.
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function discard() {
    reset();
    setUploadError(null);
  }

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        Voice recording isn&apos;t supported in this browser.
      </p>
    );
  }

  if (state === "idle" || state === "error") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: brand }}
        >
          <Mic className="h-4 w-4" /> Record voice note
        </button>
        {state === "error" && error && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </span>
        )}
      </div>
    );
  }

  if (state === "requesting") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Requesting microphone access…
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-full border border-[#E4E4E4] bg-white px-3 py-2">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
        <span className="text-sm font-medium tabular-nums text-[#202124]">
          {formatElapsed(elapsedMs)} / {formatElapsed(maxDurationMs)}
        </span>
        <button
          type="button"
          onClick={stop}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
          style={{ backgroundColor: brand }}
        >
          <Square className="h-3 w-3" /> Stop
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (state === "stopped" && result && previewUrl) {
    return (
      <div className="flex flex-col gap-2">
        <VoiceNotePlayer url={previewUrl} durationMs={result.durationMs} brand={brand} />
        {uploadError && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> {uploadError}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={send}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ConfirmIcon className="h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading…" : uploadError ? "Retry" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={discard}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> Discard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
