import type { ReactNode } from "react";

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
 */
export function MagnetixLayersPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-3 py-3">
        <p className="text-foreground text-sm font-semibold">Layers</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}
