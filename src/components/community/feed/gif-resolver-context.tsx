"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { IGif } from "@giphy/js-types";
import { getGiphyFetch } from "@/lib/community/giphy-client";

/**
 * Batched GIPHY id -> full `IGif` resolution, shared by every GIF-bearing
 * post/comment on one page. `GifAttachment` only ever persists a
 * `providerId` (see media-attachment.ts for why) — rendering it needs the
 * full GIPHY object back, and a feed page can easily have a dozen posts
 * each with their own GIF. Resolving each independently would mean a
 * dozen separate network requests for what the SDK's own `gifs(ids)`
 * (confirmed via its type declarations — a real batch endpoint, not a
 * loop we'd be building ourselves) can do in one. `FeedView`/
 * `PostDetailView` collect every `providerId` currently on screen and
 * mount ONE `GifResolverProvider` around the whole list; individual GIF
 * blocks then just read their own entry back out via `useResolvedGif`.
 *
 * This is metadata memoization for the lifetime of one page view, not the
 * "independent cache/rewrite of GIPHY media assets" GIPHY's terms
 * prohibit — nothing here is persisted, and the resolved `IGif` objects'
 * own `images.*.url` fields (GIPHY's real CDN URLs, untouched) are what
 * ever actually gets rendered, via the official `Gif` component.
 */

interface GifResolverValue {
  gifs: Map<string, IGif>;
  /** True only while the CURRENT id set's batch fetch is in flight — a
   *  block whose id already resolved on a previous batch never flashes a
   *  loading state again just because a sibling GIF was added to the page. */
  loading: boolean;
  keyAvailable: boolean;
}

const GifResolverContext = createContext<GifResolverValue>({
  gifs: new Map(),
  loading: false,
  keyAvailable: false,
});

export function GifResolverProvider({
  providerIds,
  children,
}: {
  providerIds: string[];
  children: ReactNode;
}) {
  const gf = useMemo(() => getGiphyFetch(), []);
  // Stable key so the effect only re-runs when the actual SET of ids
  // changes, not on every re-render of the (much larger) posts/comments
  // array that produced it.
  const idsKey = useMemo(() => Array.from(new Set(providerIds)).sort().join(","), [providerIds]);
  const [gifs, setGifs] = useState<Map<string, IGif>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!gf || !idsKey) return;
    const ids = idsKey.split(",");
    // Already have everything this batch needs — nothing new to fetch.
    if (ids.every((id) => gifs.has(id))) return;
    let cancelled = false;
    setLoading(true);
    gf.gifs(ids)
      .then(({ data }) => {
        if (cancelled) return;
        setGifs((prev) => {
          const next = new Map(prev);
          data.forEach((g) => next.set(String(g.id), g));
          return next;
        });
      })
      .catch(() => {
        // Leave whatever's already resolved in place; ids that never
        // resolve fall through to each block's own "GIF unavailable"
        // state (never a page-level error).
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gf, idsKey]);

  const value = useMemo(
    () => ({ gifs, loading, keyAvailable: gf !== null }),
    [gifs, loading, gf],
  );

  return <GifResolverContext.Provider value={value}>{children}</GifResolverContext.Provider>;
}

/** `undefined` = not yet resolved (still loading, or not in this page's
 *  batch at all); resolved `IGif` = ready to render. There's no separate
 *  "failed" state — an id that never comes back from `gifs()` just stays
 *  `undefined` forever, which the renderer treats as "unavailable" once
 *  loading has finished. */
export function useResolvedGif(providerId: string): IGif | undefined {
  const { gifs } = useContext(GifResolverContext);
  return gifs.get(providerId);
}

export function useGifResolverStatus(): { loading: boolean; keyAvailable: boolean } {
  const { loading, keyAvailable } = useContext(GifResolverContext);
  return { loading, keyAvailable };
}

/** Collects every `providerId` out of a list of posts'/comments' GIF
 *  attachments — the shared helper `FeedView`/`PostDetailView` both call
 *  to build the `providerIds` prop above, so the "how do I find all the
 *  GIFs on this page" logic lives in exactly one place. */
export function collectGifProviderIds(
  items: { attachments?: { kind: string; gif?: { providerId: string } }[] }[],
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    for (const a of item.attachments ?? []) {
      if (a.kind === "gif" && a.gif?.providerId) ids.push(a.gif.providerId);
    }
  }
  return ids;
}
