"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { bunnyEmbedExpiresAt } from "@/lib/standalone-courses/lesson-video";

/** A Bunny URL this close to expiry is treated as already expired — the
 *  player's own load request has to reach Bunny before the token lapses. */
const EXPIRY_MARGIN_MS = 20_000;

/** The URL minus its signature, so a re-signed URL for the SAME video
 *  doesn't reload an iframe that's already playing. */
function videoIdentity(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.delete("token");
    u.searchParams.delete("expires");
    return u.toString();
  } catch {
    return url;
  }
}

function isFresh(url: string) {
  const expires = bunnyEmbedExpiresAt(url);
  return expires === null || expires * 1000 - Date.now() > EXPIRY_MARGIN_MS;
}

/**
 * Lesson video iframe shared by every Standalone lesson surface (direct
 * course, Community-embedded, Agency) via `StandaloneLessonPlayer`.
 *
 * Bunny embed URLs are signed for 5 minutes and checked ONLY when the
 * iframe loads — once the player is up, its HLS stream is no longer tied to
 * our token, so pause/seek/leaving the tab open keep working. The failure
 * mode is mounting the iframe with an OLD URL: Next's router cache replays
 * a previously rendered lesson on Back/Forward with the token baked in, and
 * Bunny answers with its 403 page. So this never mounts a stale URL — it
 * asks the server to re-render (`router.refresh()`, which re-runs the
 * page's own membership/entitlement checks and signs a new URL) and shows
 * a manual reload as the fallback. Nothing is cached or signed client-side.
 */
export function LessonVideoFrame({ embedUrl, title }: { embedUrl: string; title: string }) {
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (isFresh(embedUrl)) {
      setStale(false);
      // Keep the mounted URL when only the signature changed (an unrelated
      // refresh re-signed the same video) — swapping it would restart playback.
      setSrc((prev) => (prev && videoIdentity(prev) === videoIdentity(embedUrl) ? prev : embedUrl));
      return;
    }
    setSrc((prev) => (prev && videoIdentity(prev) === videoIdentity(embedUrl) ? prev : null));
    setStale(true);
    if (refreshedFor.current !== embedUrl) {
      refreshedFor.current = embedUrl;
      router.refresh();
    }
  }, [embedUrl, router]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      {src ? (
        <iframe
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          // Bunny's library only serves the player to requests that carry a
          // Referer; pin the browser default so a page-level policy can't strip it.
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full"
        />
      ) : stale ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-white/80">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Refreshing video…</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1 rounded-md border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            <RotateCw className="h-3.5 w-3.5" /> Reload video
          </button>
        </div>
      ) : null}
    </div>
  );
}
