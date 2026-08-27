"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Drawer } from "@puckeditor/core";
import type { Config } from "@puckeditor/core";
import { Input } from "@/components/ui/input";
import { BLOCK_ICONS } from "@/components/pages-funnels/puck/block-icons";

/**
 * Custom Magnetix Blocks panel — Phase 2B task §4/§5/§6. Replaces Puck's
 * own plain text-row drawer via `overrides.drawer` (editor-shell.tsx), per
 * the user's explicit dislike of "the current text-heavy Puck library."
 *
 * CRITICAL constraint this component exists to satisfy: it must still use
 * Puck's REAL drag/insertion system, not a click-to-append fallback. This
 * is achieved by building on `Drawer`/`Drawer.Item` — first-class, stable,
 * publicly exported Puck components (confirmed present in the installed
 * 0.23.0 package's runtime export list, not an internal/private API).
 * `Drawer.Item` owns the actual dnd-kit draggable source and drop
 * mechanics internally; its `children` prop is a render-prop function
 * `({children, name}) => ReactElement` that this component uses to supply
 * fully custom visuals (an icon + label tile) while Puck keeps 100% control
 * of drag detection, the insertion-position indicator, and the drop itself.
 * Nothing here reimplements or wraps drag/drop logic of its own.
 *
 * Reads categories/components directly from the real production `Config`
 * (`clientPuckConfig`) rather than hardcoding a second parallel list, so
 * this panel can never silently drift out of sync with the actual
 * registry — every category/component here already exists because
 * config.tsx put it there.
 */

const CATEGORY_ORDER = [
  "layout",
  "elements",
  "prebuiltSections",
  "business",
] as const;

export function MagnetixBlocksPanel({ config }: { config: Config }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blocks..."
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        <Drawer>
          {CATEGORY_ORDER.map((categoryKey) => {
            const category = config.categories?.[categoryKey];
            if (!category) return null;
            const names = (category.components ?? []).filter((name) =>
              query ? name.toLowerCase().includes(query) : true
            );
            if (names.length === 0) return null;

            return (
              <div key={categoryKey} className="mb-5">
                <p className="text-muted-foreground mb-2 px-1 text-[11px] font-semibold tracking-wider uppercase">
                  {category.title ?? categoryKey}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {names.map((name) => {
                    const Icon = BLOCK_ICONS[name];
                    const label = config.components?.[name]?.label ?? name;
                    return (
                      <Drawer.Item
                        key={name}
                        name={name}
                        label={typeof label === "string" ? label : name}
                      >
                        {({ children, name: itemName }) => (
                          <div
                            data-puck-drawer-item={itemName}
                            className="border-border bg-card hover:border-primary/40 hover:bg-primary/5 flex cursor-grab flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-medium transition-colors active:cursor-grabbing"
                          >
                            {Icon && (
                              <Icon className="text-muted-foreground h-4 w-4" />
                            )}
                            <span className="text-foreground">
                              {typeof label === "string" ? label : itemName}
                            </span>
                            {/* `children` is Drawer.Item's own drag-affordance
                                plumbing (kept mounted, visually hidden — not
                                removed — so Puck's internal drag-preview
                                capture, which reads this subtree, keeps
                                working exactly as it does for the stock
                                drawer). */}
                            <span className="sr-only">{children}</span>
                          </div>
                        )}
                      </Drawer.Item>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Drawer>

        {CATEGORY_ORDER.every((key) => {
          const category = config.categories?.[key];
          const names = (category?.components ?? []).filter((name) =>
            query ? name.toLowerCase().includes(query) : true
          );
          return names.length === 0;
        }) && (
          <p className="text-muted-foreground px-1 text-sm">
            No blocks match &ldquo;{search}&rdquo;.
          </p>
        )}
      </div>

      <div className="border-border text-muted-foreground border-t p-3 text-center text-[11px]">
        Drag a block onto the canvas.
      </div>
    </div>
  );
}
