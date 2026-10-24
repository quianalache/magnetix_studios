"use client";

import { useState } from "react";
import { Flower2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MINDSET_LIBRARY, MINDSET_KIND_LABEL, type MindsetEntry } from "@/lib/mymagnetix/mindset";

/**
 * The Magnetix Mindset banner — lotus mark, kind pill and "New thought"
 * control on the Visual Direction 2 hero wash (2026-10-24). The library
 * itself is a small static array (no AI call, no network request), so
 * cycling through it client-side on click is real, working interactivity,
 * not a decorative dead button.
 */
export function MindsetCard({ initial }: { initial: MindsetEntry }) {
  const [entry, setEntry] = useState(initial);

  function nextThought() {
    // Same list, next real entry — never repeats the current one back-to-back.
    let next = entry;
    while (next.text === entry.text && MINDSET_LIBRARY.length > 1) {
      next = MINDSET_LIBRARY[Math.floor(Math.random() * MINDSET_LIBRARY.length)];
    }
    setEntry(next);
  }

  return (
    // Visual Direction 2 moment treatment: the approved lavender/blush hero
    // wash (near-white, dark text) instead of a saturated violet slab.
    <section aria-label="Magnetix Mindset" className="mx-hero-wash relative overflow-hidden rounded-card border border-border p-5 sm:p-6">
      <div className="relative flex items-start gap-4 sm:gap-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-tag-violet-fg shadow-card sm:size-12">
          <Flower2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-micro font-medium tracking-[0.2em] text-ink-secondary uppercase">Magnetix Mindset</p>
          <p className="mt-1.5 font-display text-title-md leading-snug text-foreground sm:text-title-lg">{entry.text}</p>
          <span className="mt-3 inline-flex rounded-full bg-tag-violet-bg px-2.5 py-0.5 text-micro font-medium text-tag-violet-fg">
            {MINDSET_KIND_LABEL[entry.kind]}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={nextThought} className="hidden shrink-0 bg-card sm:inline-flex">
          New thought
          <RefreshCw />
        </Button>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={nextThought} className="mt-4 w-full bg-card sm:hidden">
        New thought
        <RefreshCw />
      </Button>
    </section>
  );
}
