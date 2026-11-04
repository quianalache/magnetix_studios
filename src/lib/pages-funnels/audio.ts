/**
 * Audio block (Wave 3) — one audio file with the browser's own accessible
 * player. The file is normally a Media Library audio file: picking it makes
 * a public copy (the same explicit "make public" step images use), and the
 * block stores that public URL plus the asset id. A direct https link to an
 * audio file also works. No podcast hosting, no autoplay.
 * Pure + client-safe.
 */

export interface AudioSource {
  src: string;
  /** Media Library asset the public copy came from ("" for a direct link). */
  mediaAssetId: string;
}

export interface AudioBlockProps {
  source: AudioSource;
  title: string;
  caption: string;
}

export const AUDIO_LIMITS = { url: 2048, title: 160, caption: 500 } as const;

export const DEFAULT_AUDIO_PROPS: AudioBlockProps = { source: { src: "", mediaAssetId: "" }, title: "", caption: "" };

/** The MIME types the Media Library accepts as audio (and storage.rules allows). */
export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
] as const;

/** A safe `src` for <audio>: absolute http(s) only. */
export function safeAudioSrc(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > AUDIO_LIMITS.url) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) ? u.href : null;
  } catch {
    return null;
  }
}

export function audioBlockProblem(props: Record<string, unknown>): string | null {
  const source = props.source as Partial<AudioSource> | undefined;
  if (source !== undefined && (typeof source !== "object" || source === null)) return "An Audio file couldn't be read.";
  if (source?.src !== undefined && typeof source.src !== "string") return "An Audio file couldn't be read.";
  if (typeof source?.src === "string" && source.src.trim() && !safeAudioSrc(source.src)) return "An Audio file must be a public https link.";
  if (source?.mediaAssetId !== undefined && (typeof source.mediaAssetId !== "string" || source.mediaAssetId.length > 128)) return "An Audio file couldn't be read.";
  if (props.title !== undefined && (typeof props.title !== "string" || props.title.length > AUDIO_LIMITS.title)) return `An Audio title must be ${AUDIO_LIMITS.title} characters or fewer.`;
  if (props.caption !== undefined && (typeof props.caption !== "string" || props.caption.length > AUDIO_LIMITS.caption)) return `An Audio caption must be ${AUDIO_LIMITS.caption} characters or fewer.`;
  return null;
}
