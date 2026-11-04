/**
 * Video block → Media Library hosted video (Wave 3). The block stores the
 * asset id (+ its title for the builder); playback URLs are minted at render
 * time by `resolveMediaVideosForPage` and passed in as
 * `metadata.resolvedVideos`. Pure + client-safe.
 */
export interface MediaVideoRef {
  assetId: string;
  title: string;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function normalizeMediaVideo(raw: unknown): MediaVideoRef | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  return typeof v.assetId === "string" && ID.test(v.assetId) ? { assetId: v.assetId, title: typeof v.title === "string" ? v.title : "" } : null;
}

/** Every Media Library video id used by Video blocks in these trees. */
export function collectMediaVideoIds(...trees: unknown[]): string[] {
  const ids = new Set<string>();
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) return value.forEach(visit);
    const node = value as { type?: unknown; props?: Record<string, unknown> };
    if (node.type === "Video" && node.props) {
      const ref = normalizeMediaVideo(node.props.mediaVideo);
      if (ref) ids.add(ref.assetId);
    }
    Object.values(value).forEach(visit);
  };
  trees.forEach(visit);
  return [...ids];
}

/** Bunny's embed player accepts its own playback flags as query params. */
export function withBunnyPlaybackFlags(src: string, flags: { autoplay?: boolean; muted?: boolean; loop?: boolean }): string {
  try {
    const u = new URL(src);
    u.searchParams.set("autoplay", flags.autoplay ? "true" : "false");
    if (flags.muted) u.searchParams.set("muted", "true");
    if (flags.loop) u.searchParams.set("loop", "true");
    u.searchParams.set("preload", "true");
    return u.href;
  } catch {
    return src;
  }
}
