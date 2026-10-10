"use client";

import { useRef } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Report Builder zoom (2026-10-10) — the ONE zoom system, laid out like
 * the owner-approved mockup: Fit Page · Fit Width · percentage · − · a long
 * visible slider track with a draggable knob · +.
 *
 * Fit Page / Fit Width and preset sizes share ONE dropdown (owner,
 * 2026-10-10) so the slider fits on every width, phones included.
 *
 * The percentage is the TRUE canvas scale (100% = the page at its real
 * size). Fit Page / Fit Width are modes the editor measures; the slider,
 * − and + switch to a manual percentage starting from whatever is shown.
 */

export type ZoomMode = number | "fit-page" | "fit-width";

export const ZOOM_MIN = 10;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;

/** Preset sizes offered in the zoom dropdown, below Fit Page / Fit Width. */
export const ZOOM_PRESETS = [33, 50, 80, 100, 150] as const;

export function zoomModeLabel(mode: ZoomMode): string {
  return mode === "fit-page" ? "Fit Page" : mode === "fit-width" ? "Fit Width" : "Zoom";
}

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

  return (
    <div className="flex min-w-0 flex-auto items-center gap-1.5 sm:flex-none sm:gap-2" data-zoom-control>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Zoom options (${zoomModeLabel(mode)})`}
          data-zoom-mode
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-violet-100 bg-white px-2 text-[12.5px] sm:gap-1.5 sm:px-3 sm:text-[13px] font-medium text-[#18204a] hover:bg-violet-50 data-[popup-open]:border-violet-300 data-[popup-open]:bg-violet-50"
        >
          {zoomModeLabel(mode)}
          <ChevronDown className="h-3.5 w-3.5 text-violet-700" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[150px]">
          {(["fit-page", "fit-width"] as const).map((m) => (
            <DropdownMenuItem key={m} onClick={() => onChange(m)} className="justify-between">
              {zoomModeLabel(m)}
              {mode === m && <Check className="h-3.5 w-3.5 text-violet-700" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {ZOOM_PRESETS.map((p) => (
            <DropdownMenuItem key={p} onClick={() => onChange(p)} className="justify-between tabular-nums">
              {p}%
              {mode === p && <Check className="h-3.5 w-3.5 text-violet-700" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="w-10 shrink-0 text-right text-[13px] sm:w-11 font-semibold tabular-nums text-[#18204a]" data-zoom-percent aria-live="polite">
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
        className="group relative flex h-7 min-w-10 flex-1 cursor-pointer touch-none items-center outline-none sm:w-28 sm:flex-none xl:w-32"
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
