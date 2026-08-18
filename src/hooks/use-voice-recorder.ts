"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_VOICE_NOTE_DURATION_MS,
  VOICE_NOTE_RECORD_MIME_CANDIDATES,
} from "@/lib/community/voice-note-mime";

export type VoiceRecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopped"
  | "error"
  | "unsupported";

export interface RecordedVoiceNote {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  fileSizeBytes: number;
}

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }
  for (const type of VOICE_NOTE_RECORD_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  // None of our candidates matched (observed on some Safari builds) — let
  // the browser pick its own default; `recorder.mimeType` after start()
  // tells us what it actually used.
  return "";
}

/**
 * One continuous start -> stop recording session (no pause/resume, per the
 * Phase 0 architecture decision). Requests the microphone on `start()`,
 * always stops the mic tracks on stop/cancel/unmount so the browser never
 * shows an active-microphone indicator after the fact, and auto-stops at
 * `MAX_VOICE_NOTE_DURATION_MS` rather than allowing indefinite recording.
 *
 * Produces a Blob + the REAL mimeType the browser used (never assumed) +
 * a client-timed duration + file size — the four things every caller
 * needs, regardless of which surface (DM/Post/channel/test harness) is
 * using it.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordedVoiceNote | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const mimeTypeRef = useRef("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const stopMicTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
    maxDurationTimerRef.current = null;
  }, []);

  // Belt-and-suspenders cleanup if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopMicTracks();
      clearTimers();
    };
  }, [stopMicTracks, clearTimers]);

  const start = useCallback(async () => {
    if (!supported) {
      setState("unsupported");
      setError("Voice recording isn't supported in this browser.");
      return;
    }
    setError(null);
    setResult(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const actualType = mimeTypeRef.current || recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        const durationMs = Date.now() - startedAtRef.current;
        stopMicTracks();
        clearTimers();
        setResult({ blob, mimeType: actualType, durationMs, fileSizeBytes: blob.size });
        setState("stopped");
      };

      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");

      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
      maxDurationTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_VOICE_NOTE_DURATION_MS);
    } catch (err) {
      stopMicTracks();
      clearTimers();
      setState("error");
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone access was denied."
          : name === "NotFoundError"
            ? "No microphone was found."
            : name === "NotReadableError"
              ? "The microphone is already in use by another app."
              : "Couldn't access the microphone.",
      );
    }
  }, [supported, stopMicTracks, clearTimers]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  /** Abort mid-recording (no result produced), or discard an
   *  already-stopped-but-not-yet-uploaded take. Either way, always ends
   *  with the mic fully released and state back to idle. */
  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null; // suppress producing a result
      recorder.stop();
    }
    stopMicTracks();
    clearTimers();
    chunksRef.current = [];
    setResult(null);
    setElapsedMs(0);
    setError(null);
    setState("idle");
  }, [stopMicTracks, clearTimers]);

  /** Clear a finished result (e.g. after a successful upload) without
   *  touching the mic — recording already ended by this point. */
  const reset = useCallback(() => {
    setResult(null);
    setElapsedMs(0);
    setError(null);
    setState("idle");
  }, []);

  return {
    state,
    elapsedMs,
    error,
    result,
    supported,
    start,
    stop,
    cancel,
    reset,
    maxDurationMs: MAX_VOICE_NOTE_DURATION_MS,
  };
}
