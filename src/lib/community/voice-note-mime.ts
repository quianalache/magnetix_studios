/**
 * Voice note MIME/limits — client-safe (no server-only deps), shared by the
 * recorder hook (to pick a supported record format), the upload client
 * (to name the file), and the upload API route (to validate server-side).
 * One source of truth so client and server never drift on what's allowed.
 *
 * Per the Voice Notes Architecture Investigation (Phase 0): no transcoding
 * in Phase 1 — we accept whatever real MIME type the recording browser
 * actually produces, validated against this explicit allowlist rather than
 * a permissive "audio/*" wildcard.
 */

/** Real MIME types real browsers actually produce via MediaRecorder today:
 *  Chrome/Edge/Android -> webm/opus; Firefox -> webm or ogg/opus;
 *  Safari/iOS -> mp4 (aac). Kept broad enough to absorb minor browser
 *  variance without being a wildcard. */
export const VOICE_NOTE_MIME_ALLOWLIST = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
] as const;

/** Candidates tried in order via `MediaRecorder.isTypeSupported()` — the
 *  first match wins. If none match, the caller falls back to letting the
 *  browser pick its own default (still validated against the allowlist
 *  above once we know what it actually produced). */
export const VOICE_NOTE_RECORD_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
] as const;

export const MAX_VOICE_NOTE_DURATION_MS = 3 * 60 * 1000; // 3 minutes
export const MAX_VOICE_NOTE_BYTES = 10 * 1024 * 1024; // 10 MB

export function isAllowedVoiceNoteMimeType(mimeType: string): boolean {
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  return VOICE_NOTE_MIME_ALLOWLIST.some(
    (allowed) => allowed.split(";")[0] === base,
  );
}

export function extensionForVoiceNoteMimeType(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/mpeg":
      return "mp3";
    default:
      return "audio";
  }
}
