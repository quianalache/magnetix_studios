import type { VideoProvider } from "@/types/community";

/**
 * Parse a pasted YouTube, Vimeo, Loom, or Descript URL into a provider + id +
 * canonical embed URL. Client-safe (no server-only deps) so the builder
 * validates on paste and the player renders the iframe from the same logic.
 * Adding a provider here also requires allow-listing its embed host in
 * `lesson-html.ts`'s `sanitizeLessonHtml` — that's the hard security boundary
 * that decides which iframe hosts actually survive into rendered lesson HTML.
 */
export interface ParsedVideo {
  provider: VideoProvider;
  id: string;
  embedUrl: string;
}

export function parseVideoUrl(raw: string): ParsedVideo | null {
  const url = raw.trim();
  if (!url) return null;

  // YouTube — watch?v=, youtu.be/, /embed/, /shorts/
  const yt =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) ??
    null;
  if (yt) {
    return {
      provider: "youtube",
      id: yt[1],
      embedUrl: `https://www.youtube.com/embed/${yt[1]}`,
    };
  }

  // Vimeo — vimeo.com/123456789 (optionally with a hash) or player.vimeo.com
  const vimeo =
    url.match(/vimeo\.com\/(?:video\/)?(\d+)/) ??
    url.match(/player\.vimeo\.com\/video\/(\d+)/) ??
    null;
  if (vimeo) {
    return {
      provider: "vimeo",
      id: vimeo[1],
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`,
    };
  }

  // Loom — loom.com/share/{id} or loom.com/embed/{id}
  const loom =
    url.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/) ?? null;
  if (loom) {
    return {
      provider: "loom",
      id: loom[1],
      embedUrl: `https://www.loom.com/embed/${loom[1]}`,
    };
  }

  // Descript — share.descript.com/view/{id} or share.descript.com/embed/{id}
  const descript =
    url.match(/share\.descript\.com\/(?:view|embed)\/([A-Za-z0-9]+)/) ?? null;
  if (descript) {
    return {
      provider: "descript",
      id: descript[1],
      embedUrl: `https://share.descript.com/embed/${descript[1]}`,
    };
  }

  return null;
}

export function embedUrlFor(
  provider: VideoProvider | null,
  id: string | null,
): string | null {
  if (!provider || !id) return null;
  switch (provider) {
    case "youtube":
      return `https://www.youtube.com/embed/${id}`;
    case "vimeo":
      return `https://player.vimeo.com/video/${id}`;
    case "loom":
      return `https://www.loom.com/embed/${id}`;
    case "descript":
      return `https://share.descript.com/embed/${id}`;
  }
}
