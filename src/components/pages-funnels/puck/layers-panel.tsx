"use client";

import type { ReactNode } from "react";
import { PanelTop } from "lucide-react";
import { createUsePuck } from "@puckeditor/core";
import { cn } from "@/lib/utils";

const useTypedPuck = createUsePuck();

/**
 * Light Magnetix wrapper around Puck's native Outline content — Phase 2B
 * task §7 ("LAYERS: Puck Outline functionality presented through Magnetix
 * UI"). Puck's own left icon-rail already implements the "switch between
 * Blocks and Outline in one shared panel" tab behavior natively (confirmed
 * live in Phase 2A screenshots — a small icon rail toggling one shared
 * panel's content, not two permanently-visible panels), so this component
 * does NOT rebuild tab-switching; it only relabels/restyles what appears
 * once that native tab is active, via `overrides.outline` (editor-shell.tsx).
 * `children` is Puck's own real Outline tree — untouched, still 100%
 * responsible for selection/expand-collapse.
 *
 * Popup Edit Mode (Slice 4.5): Puck's tree is the Popup's own content only,
 * and `popupName` adds the Popup frame as the top layer — choosing it
 * selects the frame (Puck's root), exactly like clicking the panel.
 */
export function MagnetixLayersPanel({ children, popupName }: { children: ReactNode; popupName?: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-3 py-3">
        <p className="text-foreground text-sm font-semibold">Layers</p>
        {popupName ? <p className="text-caption text-muted-foreground">This popup only</p> : null}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {popupName ? <PopupFrameLayer name={popupName} /> : null}
        <div className={popupName ? "pl-3" : undefined}>{children}</div>
      </div>
    </div>
  );
}

function PopupFrameLayer({ name }: { name: string }) {
  const selected = useTypedPuck((s) => !s.selectedItem);
  const dispatch = useTypedPuck((s) => s.dispatch);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => dispatch({ type: "setUi", ui: { itemSelector: null } })}
      className={cn(
        "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium",
        selected ? "bg-tag-violet-bg text-tag-violet-fg" : "text-foreground hover:bg-muted",
      )}
      data-popup-frame-layer=""
    >
      <PanelTop className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{name} Popup</span>
    </button>
  );
}
