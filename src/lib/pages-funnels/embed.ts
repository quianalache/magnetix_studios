/**
 * Embed block (Wave 3) — the ONE allow-list of embeddable providers.
 *
 * The block never takes HTML or an arbitrary iframe: the author pastes a
 * normal share link (or the provider's own embed link) and this module turns
 * it into the provider's official embed URL. Only URLs that parse to one of
 * the providers below ever render; anything else renders nothing on the live
 * page and an explanation in the builder.
 *
 * Security model (see EMBED_SANDBOX): the iframe `src` is always built here
 * from a fixed https origin per provider, so the frame is always the
 * provider's own origin — never Magnetix's — and the sandbox's
 * `allow-same-origin` only lets the provider's player work normally (its own
 * cookies/storage); it cannot reach the page. No top navigation, no
 * downloads; popups are allowed so "Open in Spotify / Calendly" links work.
 *
 * Pure + client-safe.
 */

export type EmbedProvider =
  | "youtube"
  | "vimeo"
  | "loom"
  | "wistia"
  | "spotify"
  | "apple-podcasts"
  | "soundcloud"
  | "google-maps"
  | "calendly"
  | "typeform"
  | "tally";

export interface EmbedProviderInfo {
  id: EmbedProvider;
  label: string;
  /** Default frame shape: an aspect ratio, or a fixed height in px. */
  defaultSize: { kind: "ratio"; ratio: EmbedAspectRatio } | { kind: "height"; px: number };
  /** iframe `allow` (permissions policy) for this provider. */
  allow: string;
  example: string;
}

export type EmbedAspectRatio = "16:9" | "4:3" | "1:1" | "9:16";
export const EMBED_ASPECT_RATIOS: EmbedAspectRatio[] = ["16:9", "4:3", "1:1", "9:16"];
export const EMBED_RATIO_VALUE: Record<EmbedAspectRatio, string> = { "16:9": "16 / 9", "4:3": "4 / 3", "1:1": "1 / 1", "9:16": "9 / 16" };

const VIDEO_ALLOW = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write";
const AUDIO_ALLOW = "autoplay; encrypted-media; clipboard-write";

export const EMBED_PROVIDERS: Record<EmbedProvider, EmbedProviderInfo> = {
  youtube: { id: "youtube", label: "YouTube", defaultSize: { kind: "ratio", ratio: "16:9" }, allow: VIDEO_ALLOW, example: "https://www.youtube.com/watch?v=…" },
  vimeo: { id: "vimeo", label: "Vimeo", defaultSize: { kind: "ratio", ratio: "16:9" }, allow: VIDEO_ALLOW, example: "https://vimeo.com/…" },
  loom: { id: "loom", label: "Loom", defaultSize: { kind: "ratio", ratio: "16:9" }, allow: VIDEO_ALLOW, example: "https://www.loom.com/share/…" },
  wistia: { id: "wistia", label: "Wistia", defaultSize: { kind: "ratio", ratio: "16:9" }, allow: VIDEO_ALLOW, example: "https://yourname.wistia.com/medias/…" },
  spotify: { id: "spotify", label: "Spotify", defaultSize: { kind: "height", px: 352 }, allow: AUDIO_ALLOW, example: "https://open.spotify.com/episode/…" },
  "apple-podcasts": { id: "apple-podcasts", label: "Apple Podcasts", defaultSize: { kind: "height", px: 450 }, allow: AUDIO_ALLOW, example: "https://podcasts.apple.com/…" },
  soundcloud: { id: "soundcloud", label: "SoundCloud", defaultSize: { kind: "height", px: 166 }, allow: AUDIO_ALLOW, example: "https://soundcloud.com/…" },
  "google-maps": { id: "google-maps", label: "Google Maps", defaultSize: { kind: "height", px: 400 }, allow: "fullscreen", example: "https://www.google.com/maps/embed?pb=… or https://maps.google.com/?q=…" },
  calendly: { id: "calendly", label: "Calendly", defaultSize: { kind: "height", px: 700 }, allow: "clipboard-write", example: "https://calendly.com/yourname/30min" },
  typeform: { id: "typeform", label: "Typeform", defaultSize: { kind: "height", px: 560 }, allow: "camera; microphone; autoplay; encrypted-media; clipboard-write", example: "https://yourname.typeform.com/to/…" },
  tally: { id: "tally", label: "Tally", defaultSize: { kind: "height", px: 500 }, allow: "clipboard-write", example: "https://tally.so/r/…" },
};

/** Sandbox for every embed iframe — see the module doc comment. */
export const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation";

export interface ResolvedEmbed {
  provider: EmbedProvider;
  src: string;
}

const ID = /^[A-Za-z0-9_-]+$/;

function parse(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const host = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

/**
 * The provider's official embed URL for a pasted link, or null when the link
 * isn't from an allowed provider (or isn't a shape we recognise).
 */
export function resolveEmbedUrl(raw: unknown): ResolvedEmbed | null {
  if (typeof raw !== "string") return null;
  const u = parse(raw);
  if (!u) return null;
  const h = host(u);
  const segs = u.pathname.split("/").filter(Boolean);

  // YouTube — watch, share, shorts, embed links.
  if (h === "youtube.com" || h === "m.youtube.com" || h === "youtu.be" || h === "youtube-nocookie.com") {
    let id: string | null = null;
    if (h === "youtu.be") id = segs[0] ?? null;
    else if (segs[0] === "watch") id = u.searchParams.get("v");
    else if (segs[0] === "embed" || segs[0] === "shorts" || segs[0] === "live") id = segs[1] ?? null;
    return id && ID.test(id) ? { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  // Vimeo — vimeo.com/{id}[/hash] or player.vimeo.com/video/{id}.
  if (h === "vimeo.com" || h === "player.vimeo.com") {
    const idIndex = h === "player.vimeo.com" ? 1 : segs.findIndex((s) => /^\d+$/.test(s));
    const id = idIndex >= 0 ? segs[idIndex] : null;
    if (!id || !/^\d+$/.test(id)) return null;
    const hashSeg = h === "vimeo.com" ? segs[idIndex + 1] : null;
    const hash = u.searchParams.get("h") ?? (hashSeg && /^[a-f0-9]+$/i.test(hashSeg) ? hashSeg : null);
    return { provider: "vimeo", src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}` };
  }
  // Loom — /share/{id} or /embed/{id}.
  if (h === "loom.com") {
    const id = (segs[0] === "share" || segs[0] === "embed") ? segs[1] : null;
    return id && ID.test(id) ? { provider: "loom", src: `https://www.loom.com/embed/${id}` } : null;
  }
  // Wistia — {account}.wistia.com/medias/{id}, wi.st/medias/{id}, fast.wistia.net/embed/iframe/{id}.
  if (h.endsWith(".wistia.com") || h === "wistia.com" || h === "wi.st" || h === "fast.wistia.net" || h === "fast.wistia.com") {
    const i = segs.indexOf("medias");
    const id = i >= 0 ? segs[i + 1] : segs[0] === "embed" && segs[1] === "iframe" ? segs[2] : null;
    return id && ID.test(id) ? { provider: "wistia", src: `https://fast.wistia.net/embed/iframe/${id}` } : null;
  }
  // Spotify — open.spotify.com/{type}/{id} (optional intl-xx prefix).
  if (h === "open.spotify.com") {
    const parts = segs[0]?.startsWith("intl-") ? segs.slice(1) : segs;
    const [type, id] = parts[0] === "embed" ? parts.slice(1) : parts;
    const types = ["track", "album", "playlist", "episode", "show", "artist"];
    return type && types.includes(type) && id && ID.test(id) ? { provider: "spotify", src: `https://open.spotify.com/embed/${type}/${id}` } : null;
  }
  // Apple Podcasts — same path on the embed host.
  if (h === "podcasts.apple.com" || h === "embed.podcasts.apple.com") {
    if (segs.length < 2 || !segs.every((s) => /^[\w.%-]+$/.test(s))) return null;
    const query = u.searchParams.get("i") ? `?i=${encodeURIComponent(u.searchParams.get("i")!)}` : "";
    return { provider: "apple-podcasts", src: `https://embed.podcasts.apple.com/${segs.join("/")}${query}` };
  }
  // SoundCloud — a track/playlist page, rendered by SoundCloud's widget.
  if (h === "soundcloud.com" || h === "m.soundcloud.com" || h === "on.soundcloud.com") {
    if (segs.length < 1) return null;
    const page = `https://soundcloud.com/${segs.join("/")}`;
    return { provider: "soundcloud", src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(page)}&auto_play=false&visual=false` };
  }
  // Google Maps — an "Embed a map" link, or a place/search link (q=…).
  if ((h === "google.com" || h === "maps.google.com") && (segs[0] === "maps" || h === "maps.google.com")) {
    if (segs[0] === "maps" && segs[1] === "embed" && u.searchParams.get("pb")) {
      return { provider: "google-maps", src: `https://www.google.com/maps/embed?pb=${encodeURIComponent(u.searchParams.get("pb")!)}` };
    }
    const placeIndex = segs.indexOf("place");
    const q = u.searchParams.get("q") ?? (placeIndex >= 0 ? decodeURIComponent(segs[placeIndex + 1] ?? "").replace(/\+/g, " ") : "");
    if (!q.trim()) return null;
    return { provider: "google-maps", src: `https://maps.google.com/maps?q=${encodeURIComponent(q.trim())}&output=embed` };
  }
  // Calendly — a scheduling page.
  if (h === "calendly.com") {
    if (segs.length < 1 || !segs.every((s) => /^[\w-]+$/.test(s))) return null;
    return { provider: "calendly", src: `https://calendly.com/${segs.join("/")}?embed_type=Inline&hide_gdpr_banner=1` };
  }
  // Typeform — {account}.typeform.com/to/{id} or form.typeform.com/to/{id}.
  if (h.endsWith(".typeform.com") || h === "typeform.com") {
    const id = segs[0] === "to" ? segs[1] : null;
    return id && ID.test(id) ? { provider: "typeform", src: `https://form.typeform.com/to/${id}` } : null;
  }
  // Tally — tally.so/r/{id} or tally.so/embed/{id}.
  if (h === "tally.so") {
    const id = segs[0] === "r" || segs[0] === "embed" ? segs[1] : null;
    return id && ID.test(id) ? { provider: "tally", src: `https://tally.so/embed/${id}?alignLeft=1&hideTitle=1&transparentBackground=1` } : null;
  }
  return null;
}

/** Block props (stored in the page's Puck tree). */
export interface EmbedBlockProps {
  url: string;
  title: string;
  /** "auto" = the provider's natural size. */
  sizing: "auto" | "ratio" | "height";
  aspectRatio: EmbedAspectRatio;
  heightPx: number;
  /** "full" = the column's width; otherwise a max width in px. */
  maxWidth: "full" | "narrow" | "medium";
  alignment: "left" | "center" | "right";
}

export const EMBED_MAX_WIDTH_PX = { narrow: 480, medium: 720 } as const;
export const EMBED_HEIGHT_LIMITS = { min: 80, max: 1600 } as const;
export const EMBED_LIMITS = { url: 2048, title: 120 } as const;

export const DEFAULT_EMBED_PROPS: EmbedBlockProps = {
  url: "",
  title: "",
  sizing: "auto",
  aspectRatio: "16:9",
  heightPx: 400,
  maxWidth: "full",
  alignment: "center",
};

/** The frame's CSS sizing for these props + provider. */
export function embedFrameSize(props: Pick<EmbedBlockProps, "sizing" | "aspectRatio" | "heightPx">, provider: EmbedProvider | null): { aspectRatio?: string; height?: number } {
  if (props.sizing === "ratio") return { aspectRatio: EMBED_RATIO_VALUE[props.aspectRatio] ?? EMBED_RATIO_VALUE["16:9"] };
  if (props.sizing === "height") {
    const px = Number.isFinite(props.heightPx) ? Math.min(EMBED_HEIGHT_LIMITS.max, Math.max(EMBED_HEIGHT_LIMITS.min, props.heightPx)) : 400;
    return { height: px };
  }
  const d = provider ? EMBED_PROVIDERS[provider].defaultSize : ({ kind: "ratio", ratio: "16:9" } as const);
  return d.kind === "ratio" ? { aspectRatio: EMBED_RATIO_VALUE[d.ratio] } : { height: d.px };
}

/**
 * Strict save-time check of an Embed block's props. A non-empty URL that no
 * provider accepts is allowed in the DRAFT (people paste while typing) but
 * renders nothing; structure and limits are enforced.
 */
export function embedBlockProblem(props: Record<string, unknown>): string | null {
  if (props.url !== undefined && typeof props.url !== "string") return "An Embed link couldn't be read.";
  if (typeof props.url === "string" && props.url.length > EMBED_LIMITS.url) return "An Embed link is too long.";
  if (typeof props.url === "string" && /^\s*(javascript|data|vbscript):/i.test(props.url)) return "An Embed link must be an https link.";
  if (props.title !== undefined && (typeof props.title !== "string" || props.title.length > EMBED_LIMITS.title)) return `An Embed title must be ${EMBED_LIMITS.title} characters or fewer.`;
  if (props.sizing !== undefined && !["auto", "ratio", "height"].includes(String(props.sizing))) return "An Embed size couldn't be read.";
  if (props.aspectRatio !== undefined && !EMBED_ASPECT_RATIOS.includes(props.aspectRatio as EmbedAspectRatio)) return "An Embed aspect ratio isn't supported.";
  if (props.heightPx !== undefined && (typeof props.heightPx !== "number" || props.heightPx < EMBED_HEIGHT_LIMITS.min || props.heightPx > EMBED_HEIGHT_LIMITS.max)) {
    return `An Embed height must be between ${EMBED_HEIGHT_LIMITS.min} and ${EMBED_HEIGHT_LIMITS.max}px.`;
  }
  if (props.maxWidth !== undefined && !["full", "narrow", "medium"].includes(String(props.maxWidth))) return "An Embed width couldn't be read.";
  return null;
}
