import type { VideoProvider } from "@/types/community";

/**
 * Parse a pasted video URL into a provider + id + canonical embed URL, for
 * every provider a Lesson (or the inline lesson-body video block, or a
 * Standalone Course theme's video block) can reference. Client-safe (no
 * server-only deps) so the builder validates on paste and the player
 * renders the iframe from the same logic.
 *
 * One declarative table (VIDEO_PROVIDERS below) is the single source of
 * truth for both recognizing a pasted URL AND building the embed URL a
 * lesson stores/renders — adding a provider means adding ONE entry used by
 * both `parseVideoUrl` and `embedUrlFor`, so the two can never drift apart
 * the way two independent switch statements eventually would.
 *
 * Security boundary: the dedicated Lesson `videoUrl`/`videoProvider` field
 * (and the inline lesson-video TipTap node) render `embedUrlFor`'s output
 * directly as a React `<iframe src>` — never through `sanitizeLessonHtml`
 * (that sanitizer only processes rich-text `bodyHtml` strings, where it
 * already permits any `https://` iframe src with no per-host allowlist —
 * confirmed live, not assumed). The real safety property here is narrower
 * and structural: the iframe src is ALWAYS one of this table's own fixed
 * templates with a regex-extracted id slotted in, never the creator's raw
 * pasted string — so a new provider is safe to add precisely because its
 * `embedUrl` function is one more fixed template, not because anything
 * gets allow-listed elsewhere.
 *
 * Adilo (2026-09-14): confirmed live against the owner's own real video
 * (`adilo.bigcommand.com/watch/Ok2zBWdW`, privacy "people with the private
 * link" / embeddable on any website) — her account uses the standard
 * `adilo.bigcommand.com` domain, and Adilo's own real oEmbed endpoint
 * (`adilo.bigcommand.com/web/oembed`) confirms the canonical embed iframe
 * src for that exact video is the SAME `/watch/{id}` URL, not a separate
 * `/embed/` path. Loaded it in a real cross-origin iframe: no
 * X-Frame-Options/CSP block (confirmed via response headers and live
 * render), no Adilo session/login required, real HLS segments fetched
 * successfully. If a future customer's Adilo account uses a white-labeled
 * embed domain instead of `adilo.bigcommand.com`, that account's videos
 * won't match this pattern yet — a real, separate gap to close later if it
 * comes up, not guessed at here.
 */
export interface ParsedVideo {
  provider: VideoProvider;
  id: string;
  embedUrl: string;
}

interface VideoProviderDefinition {
  provider: VideoProvider;
  /** Tried in order; the first capturing group is the extracted id. */
  patterns: RegExp[];
  embedUrl: (id: string) => string;
}

const VIDEO_PROVIDERS: VideoProviderDefinition[] = [
  {
    // watch?v=, youtu.be/, /embed/, /shorts/
    provider: "youtube",
    patterns: [
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    ],
    embedUrl: (id) => `https://www.youtube.com/embed/${id}`,
  },
  {
    // vimeo.com/123456789 (optionally with a hash) or player.vimeo.com
    provider: "vimeo",
    patterns: [
      /vimeo\.com\/(?:video\/)?(\d+)/,
      /player\.vimeo\.com\/video\/(\d+)/,
    ],
    embedUrl: (id) => `https://player.vimeo.com/video/${id}`,
  },
  {
    // loom.com/share/{id} or loom.com/embed/{id}
    provider: "loom",
    patterns: [/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/],
    embedUrl: (id) => `https://www.loom.com/embed/${id}`,
  },
  {
    // share.descript.com/view/{id} or share.descript.com/embed/{id}
    provider: "descript",
    patterns: [/share\.descript\.com\/(?:view|embed)\/([A-Za-z0-9]+)/],
    embedUrl: (id) => `https://share.descript.com/embed/${id}`,
  },
  {
    // Two real, documented formats: the canonical iframe embed
    // (fast.wistia.net/embed/iframe/{id}) and the public "medias" page URL,
    // which CAN live on a custom account subdomain (e.g.
    // mycompany.wistia.com/medias/{id}) — but the id alone is enough:
    // Magnetix always builds the universal fast.wistia.net embed URL
    // itself, so a custom subdomain in the pasted URL never needs storing.
    provider: "wistia",
    patterns: [/wistia\.(?:net|com)\/(?:embed\/iframe|medias)\/([A-Za-z0-9]+)/],
    embedUrl: (id) => `https://fast.wistia.net/embed/iframe/${id}`,
  },
  {
    // adilo.bigcommand.com/watch/{id} — confirmed live to be both the
    // shareable link AND the correct iframe embed src (Adilo's own oEmbed
    // response for a real video returns this exact URL as `html`'s iframe
    // src). Anchored to the literal "adilo." subdomain so a real
    // `bigcommand.com` URL for something else (e.g. `help.bigcommand.com`,
    // `encoding.bigcommand.com` — both real, unrelated hosts on the same
    // parent domain) is never mistaken for a video id.
    provider: "adilo",
    patterns: [/adilo\.bigcommand\.com\/watch\/([A-Za-z0-9]+)/],
    embedUrl: (id) => `https://adilo.bigcommand.com/watch/${id}`,
  },
];

export function parseVideoUrl(raw: string): ParsedVideo | null {
  const url = raw.trim();
  if (!url) return null;
  for (const def of VIDEO_PROVIDERS) {
    for (const pattern of def.patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          provider: def.provider,
          id: match[1],
          embedUrl: def.embedUrl(match[1]),
        };
      }
    }
  }
  return null;
}

/**
 * Parse a pasted generic embed — either a full `<iframe>` embed code (pull
 * `src` out of it) or a bare URL — for the rich-text editor's Embed button's
 * fallback when the input isn't a recognized provider link. Only `https://`
 * survives (matches the `iframe` scheme restriction in `lesson-html.ts`'s
 * sanitizer, the actual security boundary on render). Not used for the
 * dedicated Lesson video field, which only ever accepts a recognized
 * provider from the table above — see this module's own top comment.
 */
export function extractEmbedSrc(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const iframeMatch = trimmed.match(
    /<iframe[^>]*\bsrc\s*=\s*["']([^"']+)["']/i
  );
  const src = (iframeMatch ? iframeMatch[1] : trimmed).trim();
  return /^https:\/\//i.test(src) ? src : null;
}

export function embedUrlFor(
  provider: VideoProvider | null,
  id: string | null
): string | null {
  if (!provider || !id) return null;
  const def = VIDEO_PROVIDERS.find((d) => d.provider === provider);
  // Falls through to null for any provider with no table entry (e.g. a
  // future one not yet added) — the player's `{embedUrl && <iframe .../>}`
  // pattern already renders nothing rather than a broken iframe for that case.
  return def ? def.embedUrl(id) : null;
}
