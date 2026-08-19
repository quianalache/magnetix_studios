"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid } from "@giphy/react-components";
import type { IGif } from "@giphy/js-types";
import { Search, X } from "lucide-react";
import { getGiphyFetch, GIPHY_CONTENT_RATING, GIPHY_PAGE_LIMIT } from "@/lib/community/giphy-client";
import { cn } from "@/lib/utils";

/**
 * Shared GIF search/browse UI — used by the post composer AND the comment
 * composer (Part 9), and deliberately independent of both: this component
 * takes no `PostComposer` prop, imports nothing from it, and knows nothing
 * about posts vs. comments. It's also the intended reuse point for a
 * future Chat-style Channels GIF button (Part 12) — that future work still
 * needs its OWN GIPHY key when it's built (never assume this key), but the
 * picker component itself is already shaped to be dropped in unchanged.
 *
 * Deliberately does NOT use GIPHY's own `SearchBar`/`SearchContextManager`
 * components — those ship their own visual styling, and Part 14 explicitly
 * wants this feature in Magnetix's design system, not GoCollab's or
 * GIPHY's. What IS used verbatim from the official SDK is `Grid` (handles
 * pagination, lazy loading, and — importantly — GIPHY's own analytics
 * pingback + attribution behavior internally), fed by a `fetchGifs`
 * callback built from `GiphyFetch.search`/`.trending` called directly here
 * in the browser. No server route is involved anywhere in this file.
 *
 * `onSelect` hands back the full `IGif` GIPHY returned — the caller keeps
 * that in memory for an immediate, fully-detailed preview, and only
 * persists `{ provider: "giphy", providerId: gif.id, title: gif.title }`
 * (see media-attachment.ts) when the post/comment is actually saved.
 */
export function GiphyPicker({
  onSelect,
  className,
  gridWidth = 288,
}: {
  onSelect: (gif: IGif) => void;
  className?: string;
  gridWidth?: number;
}) {
  const gf = useMemo(() => getGiphyFetch(), []);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  if (!gf) {
    return (
      <div className={cn("w-72 p-4 text-center text-sm text-[#909090]", className)}>
        GIFs aren&apos;t available right now.
      </div>
    );
  }

  const fetchGifs = (offset: number) =>
    debounced
      ? gf.search(debounced, { offset, limit: GIPHY_PAGE_LIMIT, rating: GIPHY_CONTENT_RATING })
      : gf.trending({ offset, limit: GIPHY_PAGE_LIMIT, rating: GIPHY_CONTENT_RATING });

  return (
    <div className={cn("flex w-72 flex-col gap-2 sm:w-80", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#909090]" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search GIPHY"
          className="w-full rounded-md border border-[#E4E4E4] bg-white py-1.5 pl-8 pr-7 text-sm outline-none focus:border-[#b4b4b4]"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            title="Clear search"
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[#909090] hover:text-[#202124]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto">
        {/* Remounting on `debounced` resets Grid's own internal pagination
            state for a fresh search — it has no public "reset" API, and
            reusing one instance across searches left stale pages mixed in
            when this was first tried live. */}
        <Grid
          key={debounced}
          width={gridWidth}
          columns={2}
          gutter={6}
          fetchGifs={fetchGifs}
          onGifClick={(gif, e) => {
            e.preventDefault();
            onSelect(gif);
          }}
          noLink
          hideAttribution={false}
          noResultsMessage={<span className="block px-2 py-6 text-center text-xs text-[#909090]">No GIFs found</span>}
        />
      </div>

      <p className="text-center text-[10px] text-[#b4b4b4]">Powered by GIPHY</p>
    </div>
  );
}
