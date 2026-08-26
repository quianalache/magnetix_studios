"use client";

import { useState } from "react";
import {
  Heading as HeadingIcon,
  Type,
  MousePointerClick,
  Image as ImageIcon,
  Minus,
  MoveVertical,
  GalleryHorizontal,
  Star,
  MessageSquareText,
  HelpCircle,
  Megaphone,
  FileText,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { BLOCK_LIBRARY, type BlockCategory } from "@/lib/pages-funnels/blocks";
import type { BlockType } from "@/types/pages-funnels";

const BLOCK_ICONS: Record<BlockType, typeof HeadingIcon> = {
  heading: HeadingIcon,
  text: Type,
  button: MousePointerClick,
  image: ImageIcon,
  divider: Minus,
  spacer: MoveVertical,
  hero: GalleryHorizontal,
  features: Star,
  testimonials: MessageSquareText,
  faq: HelpCircle,
  cta: Megaphone,
  form: FileText,
};

// Internal category key stays `magnetix` (matches BLOCK_LIBRARY entries and
// the BlockCategory type) — only the customer-facing label changed, per
// product decision: "Magnetix" read as confusing internal branding, renamed
// to "Business" for the blocks that compose other native Magnetix features
// (Form, Booking, Offer/Checkout, Course, Community CTA).
const CATEGORY_LABELS: Record<BlockCategory, string> = {
  basic: "Basic",
  sections: "Sections",
  magnetix: "Business",
};

const CATEGORY_ORDER: BlockCategory[] = ["basic", "sections", "magnetix"];

/** Left panel — search + grouped block library. Clicking an entry appends
 *  that block to the end of the canvas (reliable, no cross-container drag
 *  needed); reordering once a block is on the canvas is Canvas's job. */
export function BlocksPanel({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [search, setSearch] = useState("");
  const filtered = BLOCK_LIBRARY.filter((b) =>
    b.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Blocks</h2>
      </div>
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blocks..."
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        {CATEGORY_ORDER.map((category) => {
          const entries = filtered.filter((b) => b.category === category);
          if (entries.length === 0) return null;
          return (
            <div key={category}>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {entries.map((entry) => {
                  const Icon = BLOCK_ICONS[entry.type];
                  return (
                    <button
                      key={entry.type}
                      type="button"
                      title={entry.description}
                      onClick={() => onAdd(entry.type)}
                      className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">No blocks match &ldquo;{search}&rdquo;.</p>
        )}
      </div>
      <div className="border-t border-border p-3 text-center text-[11px] text-muted-foreground">
        Click a block to add it to the end of the page.
      </div>
    </div>
  );
}
