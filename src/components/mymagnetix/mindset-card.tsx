"use client";

import { useState } from "react";
import { Flower2, RefreshCw, Sparkles } from "lucide-react";
import { MINDSET_LIBRARY, MINDSET_KIND_LABEL, type MindsetEntry } from "@/lib/mymagnetix/mindset";

/**
 * The Magnetix Mindset banner — approved mockup treatment (gradient card,
 * lotus mark, reflection-style pill, "New thought" control). The library
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
    <div className="relative overflow-hidden rounded-2xl p-6 text-white sm:p-7" style={{ background: "linear-gradient(120deg, #F0ABFC 0%, #C084FC 45%, #7C3AED 100%)" }}>
      <Sparkles className="pointer-events-none absolute right-10 top-6 h-5 w-5 text-white/50" />
      <Sparkles className="pointer-events-none absolute right-28 top-16 h-3 w-3 text-white/40" />
      <div className="relative flex items-start gap-4 sm:gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-sm">
          <Flower2 className="h-6 w-6 text-[#7C3AED]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Magnetix Mindset</p>
          <p className="mt-1.5 font-serif text-[20px] leading-snug sm:text-[22px]">{entry.text}</p>
          <span className="mt-3 inline-block rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-medium text-white">
            {MINDSET_KIND_LABEL[entry.kind]}
          </span>
        </div>
        <button
          type="button"
          onClick={nextThought}
          className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#5E2574] shadow-sm transition-opacity hover:opacity-90 sm:flex"
        >
          New thought
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={nextThought}
        className="relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-white/20 px-3.5 py-2 text-[12.5px] font-semibold text-white sm:hidden"
      >
        New thought
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
