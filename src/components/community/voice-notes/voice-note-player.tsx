"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PlayerStatus = "idle" | "loading" | "ready" | "error";

/**
 * ONE reusable inline voice-note player — an actual playback control, not
 * a link. The `url` is only ever passed to the underlying `<audio>`
 * element; it is never rendered as visible text/UI.
 *
 * The progress track is its own isolated element (the `<input
 * type="range">` below) precisely so a future waveform visualization can
 * replace/enhance it without touching the audio element or playback state
 * logic above it — per the Phase 0 architecture decision to defer real
 * waveform analysis without painting this component into a corner.
 */
export function VoiceNotePlayer({
  url,
  durationMs,
  brand = "#202124",
  className,
}: {
  url: string;
  /** Best-known duration before the browser has loaded real metadata —
   *  typically the client-timed recording duration. Overwritten once the
   *  audio element reports its own (more accurate) decoded duration. */
  durationMs: number;
  brand?: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalMs(audio.duration * 1000);
      }
      setStatus((s) => (s === "error" ? s : "ready"));
    };
    const onTime = () => setCurrentMs(audio.currentTime * 1000);
    const onEnded = () => {
      setPlaying(false);
      setCurrentMs(0);
    };
    const onError = () => setStatus("error");
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [url]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio || status === "error") return;
    if (status === "idle") setStatus("loading");
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setStatus("error"));
    }
  }

  function seek(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentMs(ms);
  }

  return (
    <div
      className={cn(
        "flex w-full max-w-xs items-center gap-2 rounded-full border border-[#E4E4E4] bg-white px-2 py-1.5",
        className,
      )}
    >
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        disabled={status === "error"}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
        style={{ backgroundColor: brand }}
      >
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === "error" ? (
          <AlertCircle className="h-4 w-4" />
        ) : playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5 translate-x-[1px]" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {status === "error" ? (
          <span className="text-xs text-destructive">Couldn&apos;t play this recording.</span>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={Math.max(totalMs, 1)}
              value={Math.min(currentMs, totalMs)}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1 w-full cursor-pointer"
              style={{ accentColor: brand }}
              aria-label="Seek"
            />
            <span className="text-[11px] tabular-nums text-[#909090]">
              {formatTime(currentMs)} / {formatTime(totalMs)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
