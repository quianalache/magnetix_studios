import type { Viewport } from "@puckeditor/core";
import type { PuckColumnWidth } from "@/types/pages-funnels-puck";

/**
 * Shared constants for the production Puck foundation. Every value here is
 * a module-level constant specifically so it's referentially stable across
 * re-renders — see `IFRAME_CONFIG`'s doc comment below and master spec §3/
 * §12: any object/array passed as a controlled `<Puck>` prop MUST be a
 * stable reference, never a fresh inline literal, or the first insert of an
 * editor session silently fails to undo (the Insert Undo Blocker finding).
 */

export const WIDTH_OPTIONS: { label: string; value: PuckColumnWidth }[] = [
  { label: "Auto", value: "auto" },
  { label: "1/4", value: "1/4" },
  { label: "1/3", value: "1/3" },
  { label: "1/2", value: "1/2" },
  { label: "2/3", value: "2/3" },
  { label: "3/4", value: "3/4" },
  { label: "Full", value: "full" },
];

export const ALIGN_OPTIONS = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
] as const;

/**
 * 12-column grid span per Column width value — the exact mapping proven in
 * the POC (see master spec §3: "Field-driven Column widths were proven
 * using a 12-column CSS Grid"). Always `col-span-12` below `sm:` (mobile
 * stacks full-width) and only takes its real fraction at `sm:` and up.
 * "auto" has no natural grid-span meaning (a flex-only concept — "share
 * remaining space") so it falls back to half width.
 */
export const COLUMN_SPAN_CLASS: Record<PuckColumnWidth, string> = {
  auto: "col-span-12 sm:col-span-6",
  "1/4": "col-span-12 sm:col-span-3",
  "1/3": "col-span-12 sm:col-span-4",
  "1/2": "col-span-12 sm:col-span-6",
  "2/3": "col-span-12 sm:col-span-8",
  "3/4": "col-span-12 sm:col-span-9",
  full: "col-span-12",
};

/**
 * Native Puck device-preview viewports (master spec §3/§14: "Desktop/
 * Tablet/Mobile behavior was proven... do not build a duplicate custom
 * device-preview system"). Carries over the exact sizes proven in the POC —
 * no stronger existing convention was found elsewhere in the repo for this.
 * Module-level constant: this is passed straight into `<Puck viewports={}>`
 * as a controlled prop and must be stable (see file doc comment above).
 */
export const VIEWPORTS: Viewport[] = [
  { width: 1280, height: "auto", label: "Desktop", icon: "Monitor" },
  { width: 768, height: "auto", label: "Tablet", icon: "Tablet" },
  { width: 390, height: "auto", label: "Mobile", icon: "Smartphone" },
];

/**
 * Stable `iframe` config for a controlled `<Puck>` — module-level, NOT an
 * inline object literal at the call site. This is the exact root cause /
 * fix from the Insert Undo Blocker investigation (master spec §3/§12): a
 * fresh `iframe={{...}}` literal on every render of a controlled `<Puck>`
 * corrupted `history[0]`, silently breaking Undo for the first insert of an
 * editor session. `syncHostStyles: true` is what propagates Magnetix/
 * Tailwind styling into the canvas iframe (proven in the POC).
 */
export const IFRAME_CONFIG = {
  enabled: true,
  waitForStyles: true,
  syncHostStyles: true,
} as const;
