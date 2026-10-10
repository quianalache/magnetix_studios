"use client";

import { useRef } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * Report Builder zoom (2026-10-10) — the ONE zoom system, laid out like
 * the owner-approved mockup: Fit Page · Fit Width · percentage · − · a long
 * visible slider track with a draggable knob · +.
 *
 * The percentage is the TRUE canvas scale (100% = the page at its real
 * size). Fit Page / Fit Width are modes the editor measures; the slider,
 * − and + switch to a manual percentage starting from whatever is shown.
 */

export type ZoomMode = number | "fit-page" | "fit-width";

export const ZOOM_MIN = 10;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;

export function clampZoom(pct: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(pct)));
}

/** − / + land on the next multiple of the step, so 47% → 40% / 50%. */
export function stepZoom(currentPct: number, direction: -1 | 1): number {
  const snapped = direction > 0 ? Math.floor(currentPct / ZOOM_STEP) * ZOOM_STEP + ZOOM_STEP : Math.ceil(currentPct / ZOOM_STEP) * ZOOM_STEP - ZOOM_STEP;
  return clampZoom(snapped);
}

export function ZoomControl({
  mode,
  percent,
  onChange,
}: {
  mode: ZoomMode;
  /** The scale currently shown, as a percentage (also correct in Fit modes). */
  percent: number;
  onChange: (next: ZoomMode) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = clampZoom(percent);
  const ratio = (pct - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);

  function pctAt(clientX: number): number {
    const rect = trackRef.current!.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return clampZoom(ZOOM_MIN + r * (ZOOM_MAX - ZOOM_MIN));
  }

  const fitButton = (value: "fit-page" | "fit-width", label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={mode === value}
      className={`h-9 shrink-0 rounded-lg border px-3 text-[13px] font-medium transition ${
        mode === value ? "border-violet-300 bg-violet-50 text-violet-800" : "border-violet-100 bg-white text-[#18204a] hover:bg-violet-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-w-0 items-center gap-2" data-zoom-control>
      <div className="hidden items-center gap-2 sm:flex">
        {fitButton("fit-page", "Fit Page")}
        {fitButton("fit-width", "Fit Width")}
      </div>
      <span className="w-11 shrink-0 text-right text-[13px] font-semibold tabular-nums text-[#18204a]" data-zoom-percent aria-live="polite">
        {pct}%
      </span>
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => onChange(stepZoom(pct, -1))}
        disabled={pct <= ZOOM_MIN}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-[#18204a] hover:bg-violet-50 disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Zoom"
        aria-valuemin={ZOOM_MIN}
        aria-valuemax={ZOOM_MAX}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        data-zoom-slider
        className="group relative flex h-7 w-24 shrink-0 cursor-pointer touch-none items-center outline-none sm:w-32 xl:w-36"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onChange(pctAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(pctAt(e.clientX));
        }}
        onKeyDown={(e) => {
          const delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (delta) {
            e.preventDefault();
            onChange(clampZoom(pct + delta * (e.shiftKey ? ZOOM_STEP : 1)));
          } else if (e.key === "Home") {
            e.preventDefault();
            onChange(ZOOM_MIN);
          } else if (e.key === "End") {
            e.preventDefault();
            onChange(ZOOM_MAX);
          }
        }}
      >
        <span className="absolute inset-x-0 h-1.5 rounded-full bg-violet-100" />
        <span className="absolute left-0 h-1.5 rounded-full bg-[#5420a8]" style={{ width: `${ratio * 100}%` }} />
        <span
          className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#5420a8] shadow-[0_1px_4px_rgba(84,32,168,0.45)] ring-violet-300 group-focus-visible:ring-2"
          style={{ left: `${ratio * 100}%` }}
          data-zoom-knob
        />
      </div>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => onChange(stepZoom(pct, 1))}
        disabled={pct >= ZOOM_MAX}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-[#18204a] hover:bg-violet-50 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
