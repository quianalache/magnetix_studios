/**
 * Lesson video URL helpers shared by the server lesson presenter
 * (`course-lesson-presentation.ts`) and the client lesson frame
 * (`lesson-video-frame.tsx`). Client-safe — no server-only imports.
 */

const BUNNY_EMBED_HOST = "iframe.mediadelivery.net";

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Apply the course's "Autoplay lesson videos" setting to an embed URL.
 *
 * Bunny's player autoplays unless told otherwise, so Bunny URLs ALWAYS get
 * an explicit `autoplay=true|false` (the param isn't covered by the embed
 * token, which signs only the video id + expiry). External providers don't
 * autoplay by default, so they're only touched when autoplay is on — and
 * only providers with a documented autoplay param; the rest are returned
 * unchanged (they simply won't autoplay).
 */
export function applyLessonVideoAutoplay(url: string, autoplay: boolean): string {
  const u = parse(url);
  if (!u) return url;
  const host = u.hostname;
  if (host === BUNNY_EMBED_HOST) {
    u.searchParams.set("autoplay", autoplay ? "true" : "false");
    return u.toString();
  }
  if (!autoplay) return url;
  if (host === "www.youtube.com" || host === "player.vimeo.com" || host === "www.loom.com") {
    u.searchParams.set("autoplay", "1");
    return u.toString();
  }
  if (host === "fast.wistia.net") {
    u.searchParams.set("autoPlay", "true");
    return u.toString();
  }
  return url;
}

/**
 * Unix-seconds expiry of a signed Bunny embed URL, or null for anything that
 * isn't one (external providers carry no token). Bunny refuses to load the
 * player once this passes, so the client frame uses it to avoid mounting a
 * stale URL (e.g. a lesson restored from the router cache by Back/Forward).
 */
export function bunnyEmbedExpiresAt(url: string): number | null {
  const u = parse(url);
  if (!u || u.hostname !== BUNNY_EMBED_HOST) return null;
  const expires = Number(u.searchParams.get("expires"));
  return Number.isFinite(expires) && expires > 0 ? expires : null;
}
