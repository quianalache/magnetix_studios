"use client";

import type { ReactNode } from "react";
import { createUsePuck } from "@puckeditor/core";
import { BLOCK_ICONS } from "@/components/pages-funnels/puck/block-icons";

const useTypedPuck = createUsePuck();

/**
 * Light Magnetix wrapper around Puck's native Fields content —
 * Phase 2B task §8 ("selected element name/type, logically grouped
 * controls, clean labels... this task is the shell and visual system,
 * do NOT yet redesign every element's full settings taxonomy"). `children`
 * is Puck's own real field inputs, unmodified — this component only adds a
 * header identifying what's selected, using the public `createUsePuck()`
 * hook (`selectedItem`, a first-class field on its return value, confirmed
 * in the installed 0.23.0 types) rather than tracking selection separately.
 * `createUsePuck()` — not the bare `usePuck()` hook — per Puck's own
 * runtime guidance: `usePuck()` without a selector re-renders on every
 * store change, `createUsePuck()` yields a typed, selector-based hook that
 * only re-renders when `selectedItem` itself changes.
 * When nothing is selected, shows Page-level settings framing instead of an
 * empty/confusing panel.
 */
export function MagnetixSettingsPanel({ children }: { children: ReactNode }) {
  const selectedItem = useTypedPuck((s) => s.selectedItem);
  const type = selectedItem?.type;
  const Icon = type ? BLOCK_ICONS[type] : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        {Icon && (
          <span className="bg-primary/10 text-primary flex h-6 w-6 items-center justify-center rounded-md">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <p className="text-foreground text-sm font-semibold">
          {type ?? "Page"} Settings
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
