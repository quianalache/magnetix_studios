import type { VideoPlaybackConfig } from "@/types/pages-funnels-puck";

/**
 * System B Video source model (master spec §24.6/§8). One shared resolver
 * — `resolveVideoEmbed()` — consumed identically by the ONE shared
 * `VideoRender` (elements.tsx, already used by both `clientPuckConfig` and
 * `serverPuckConfig`), so editor canvas/Preview/public page can never
 * diverge in how a video URL gets interpreted (master spec's explicit
 * "use one shared rendering path... do not create separate iframe/embed
 * logic per surface").
 *
 * Providers supported: YouTube, Vimeo, and a "direct" fallback (any other
 * URL — real hosted `.mp4`/`.webm`/`.mov` files, and anything else,
 * including a Loom "direct file" export link) rendered as a native
 * `<video>` element. No other provider-specific SDK/embed is implemented —
 * per the task's explicit "do not invent providers the platform cannot
 * render reliably."
 */

export type VideoProvider = "youtube" | "vimeo" | "direct";

interface DetectedVideo {
  provider: VideoProvider;
  /** The provider's own video id (YouTube/Vimeo only) — `null` for
   *  "direct", where the whole URL IS the source. */
  id: string | null;
}

const YOUTUBE_PATTERN =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/;
const VIMEO_PATTERN =
  /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)/;

/** Auto-detects the provider from a pasted URL — matches the task's
 *  explicit "prefer automatic provider detection from URL where clean"
 *  instruction; there is deliberately no separate "Provider" field for
 *  the user to set by hand. */
export function detectVideoProvider(url: string): DetectedVideo {
  const yt = url.match(YOUTUBE_PATTERN);
  if (yt) return { provider: "youtube", id: yt[1] };
  const vimeo = url.match(VIMEO_PATTERN);
  if (vimeo) return { provider: "vimeo", id: vimeo[1] };
  return { provider: "direct", id: null };
}

export interface ResolvedVideoEmbed {
  kind: "iframe" | "video" | "none";
  src: string;
  /** Effective (post-browser-restriction) autoplay/muted/loop/controls —
   *  already coerced (see `resolveVideoEmbed`'s own doc comment), never
   *  the raw, possibly-invalid combination straight from `playback`. */
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  controls: boolean;
  posterUrl: string | null;
}

/**
 * Turns a raw pasted URL + playback config into exactly what each surface
 * needs to render — never a raw invalid combination. Browsers block
 * unmuted autoplay, so `autoplay` here ALWAYS implies `muted` regardless
 * of what `playback.muted` said (master spec's explicit "do not create
 * configuration combinations that browsers cannot honor" — enforced here,
 * once, rather than trusting every render call site to remember it).
 */
export function resolveVideoEmbed(
  url: string,
  playback: VideoPlaybackConfig | undefined
): ResolvedVideoEmbed {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      kind: "none",
      src: "",
      autoplay: false,
      muted: false,
      loop: false,
      controls: true,
      posterUrl: null,
    };
  }

  const autoplay = !!playback?.autoplay;
  const muted = autoplay || !!playback?.muted;
  const loop = !!playback?.loop;
  const controls = playback?.showControls ?? true;

  const detected = detectVideoProvider(trimmed);

  if (detected.provider === "youtube" && detected.id) {
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      controls: controls ? "1" : "0",
      autoplay: autoplay ? "1" : "0",
      mute: muted ? "1" : "0",
      loop: loop ? "1" : "0",
    });
    // YouTube's embed only actually loops when `playlist` repeats the same
    // video id — undocumented-but-well-known API quirk, not a Magnetix
    // invention.
    if (loop) params.set("playlist", detected.id);
    return {
      kind: "iframe",
      src: `https://www.youtube-nocookie.com/embed/${detected.id}?${params.toString()}`,
      autoplay,
      muted,
      loop,
      controls,
      posterUrl: null, // not settable via a reliable query param — see VideoPlaybackConfig's doc comment
    };
  }

  if (detected.provider === "vimeo" && detected.id) {
    const params = new URLSearchParams({
      title: "0",
      byline: "0",
      portrait: "0",
      autoplay: autoplay ? "1" : "0",
      muted: muted ? "1" : "0",
      loop: loop ? "1" : "0",
      controls: controls ? "1" : "0",
    });
    return {
      kind: "iframe",
      src: `https://player.vimeo.com/video/${detected.id}?${params.toString()}`,
      autoplay,
      muted,
      loop,
      controls,
      posterUrl: null,
    };
  }

  // Direct file / unrecognized URL — rendered as a native <video>, which
  // honors autoplay/muted/loop/controls as real HTML attributes and
  // supports a real poster image.
  return {
    kind: "video",
    src: trimmed,
    autoplay,
    muted,
    loop,
    controls,
    posterUrl: playback?.posterUrl || null,
  };
}
