import "server-only";

import { parseVideoUrl } from "@/lib/community/video-embed";
import {
  MAX_IMAGES_PER_POST,
  MAX_VOICE_NOTES_PER_POST,
  MAX_IMAGES_PER_COMMENT,
  MAX_VOICE_NOTES_PER_COMMENT,
} from "@/lib/community/community-image-mime";
import { MAX_FILES_PER_POST, MAX_FILES_PER_COMMENT } from "@/lib/community/community-file-mime";
import { MAX_GIFS_PER_POST, MAX_GIFS_PER_COMMENT } from "@/lib/community/gif-limits";
import type { MediaAttachment, VideoProviderName } from "@/types/media-attachment";

const MAX_VIDEO_LINKS_PER_POST = 1;

/**
 * Normalize + validate client-supplied attachments — shared by the
 * create/edit POST and COMMENT routes (extracted in Phase D specifically
 * so no two routes can ever validate differently, extended here for
 * Comments & Replies the same way). Every image/voice/file object was
 * already uploaded (and server-validated at upload time) via its own
 * /api/community/[saId]/community-* route before ever reaching this
 * function — this pass only checks SHAPE and caps counts; it does not
 * re-verify the Storage object exists.
 *
 * `video-link` is the one kind actually RE-validated here, not just
 * shape-checked: the client-reported `provider`/`providerId`/`embedUrl`
 * are discarded entirely and re-derived server-side from the client's
 * `originalUrl` via `parseVideoUrl` — the same function the composer used
 * to preview it. This is the actual security boundary that keeps a
 * Community post from ever rendering an arbitrary iframe: a client could
 * otherwise claim any `embedUrl` it wants, and `CommunityPostAttachments`
 * blindly renders whatever's stored. Comments never offer video-link at
 * all (product decision, not an oversight) — `normalizeCommentAttachments`
 * below has no video-link branch, so a hand-crafted request claiming a
 * `kind: "video-link"` item on a comment is silently dropped, not stored.
 *
 * `gif` is shape-checked but not re-verified against the provider — GIPHY
 * (Phase D) is the only accepted provider; the id itself isn't re-resolved
 * server-side (no server-side GIPHY calls at all, per GIPHY's own
 * client-side-only Search/Trending requirement), so a hand-crafted request
 * could technically claim a `providerId` that doesn't exist. That's an
 * accepted, bounded risk: the client-side SDK re-resolution the renderer
 * always does simply fails closed (the "GIF unavailable" state) for a
 * bogus id, so this can never render or serve anything other than a real
 * GIPHY asset.
 *
 * `authorMemberId` is always overwritten with the real authenticated
 * member — never trusted from the client, same discipline as everything
 * else in these routes.
 */

function validateImageItem(
  item: unknown,
  authorMemberId: string,
): Extract<MediaAttachment, { kind: "image" }> | null {
  if (!item || typeof item !== "object") return null;
  const image = (item as { image?: Record<string, unknown> }).image;
  if (
    !image ||
    typeof image.id !== "string" ||
    typeof image.url !== "string" ||
    typeof image.storagePath !== "string" ||
    typeof image.mimeType !== "string" ||
    typeof image.fileSizeBytes !== "number"
  ) {
    return null;
  }
  return {
    kind: "image",
    image: {
      id: image.id,
      url: image.url,
      storagePath: image.storagePath,
      mimeType: image.mimeType,
      fileSizeBytes: image.fileSizeBytes,
      width: typeof image.width === "number" ? image.width : undefined,
      height: typeof image.height === "number" ? image.height : undefined,
      authorMemberId,
      createdAt: Date.now(),
      status: "ready",
    },
  };
}

function validateVoiceItem(
  item: unknown,
  authorMemberId: string,
): Extract<MediaAttachment, { kind: "voice" }> | null {
  if (!item || typeof item !== "object") return null;
  const voice = (item as { voice?: Record<string, unknown> }).voice;
  if (
    !voice ||
    typeof voice.id !== "string" ||
    typeof voice.url !== "string" ||
    typeof voice.storagePath !== "string" ||
    typeof voice.mimeType !== "string" ||
    typeof voice.durationMs !== "number" ||
    typeof voice.fileSizeBytes !== "number"
  ) {
    return null;
  }
  return {
    kind: "voice",
    voice: {
      id: voice.id,
      url: voice.url,
      storagePath: voice.storagePath,
      mimeType: voice.mimeType,
      durationMs: voice.durationMs,
      fileSizeBytes: voice.fileSizeBytes,
      authorMemberId,
      createdAt: Date.now(),
      status: "ready",
    },
  };
}

function validateFileItem(
  item: unknown,
  authorMemberId: string,
): Extract<MediaAttachment, { kind: "file" }> | null {
  if (!item || typeof item !== "object") return null;
  const file = (item as { file?: Record<string, unknown> }).file;
  if (
    !file ||
    typeof file.id !== "string" ||
    typeof file.url !== "string" ||
    typeof file.storagePath !== "string" ||
    typeof file.fileName !== "string" ||
    typeof file.mimeType !== "string" ||
    typeof file.fileSizeBytes !== "number"
  ) {
    return null;
  }
  return {
    kind: "file",
    file: {
      id: file.id,
      url: file.url,
      storagePath: file.storagePath,
      fileName: file.fileName.slice(0, 200),
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
      authorMemberId,
      createdAt: Date.now(),
      status: "ready",
    },
  };
}

function validateGifItem(
  item: unknown,
  authorMemberId: string,
): Extract<MediaAttachment, { kind: "gif" }> | null {
  if (!item || typeof item !== "object") return null;
  const gif = (item as { gif?: Record<string, unknown> }).gif;
  if (
    !gif ||
    gif.provider !== "giphy" ||
    typeof gif.providerId !== "string" ||
    !gif.providerId.trim()
  ) {
    return null;
  }
  return {
    kind: "gif",
    gif: {
      id: typeof gif.id === "string" ? gif.id : gif.providerId,
      provider: "giphy",
      providerId: gif.providerId,
      title: typeof gif.title === "string" ? gif.title.slice(0, 300) : undefined,
      authorMemberId,
      createdAt: Date.now(),
    },
  };
}

function validateVideoLinkItem(
  item: unknown,
  authorMemberId: string,
): Extract<MediaAttachment, { kind: "video-link" }> | null {
  if (!item || typeof item !== "object") return null;
  const videoLink = (item as { videoLink?: Record<string, unknown> }).videoLink;
  const originalUrl =
    videoLink && typeof videoLink.originalUrl === "string" ? videoLink.originalUrl : null;
  // Re-derived from the URL, never trusting the client's own provider/
  // providerId/embedUrl claims — see the module comment.
  const parsed = originalUrl ? parseVideoUrl(originalUrl) : null;
  if (!parsed || !videoLink) return null;
  return {
    kind: "video-link",
    videoLink: {
      id: typeof videoLink.id === "string" ? videoLink.id : parsed.id,
      originalUrl: originalUrl!,
      provider: parsed.provider as VideoProviderName,
      providerId: parsed.id,
      embedUrl: parsed.embedUrl,
      authorMemberId,
      createdAt: Date.now(),
    },
  };
}

export function normalizePostAttachments(
  raw: unknown,
  authorMemberId: string,
): MediaAttachment[] {
  if (!Array.isArray(raw)) return [];
  const images: MediaAttachment[] = [];
  const voices: MediaAttachment[] = [];
  const gifs: MediaAttachment[] = [];
  const files: MediaAttachment[] = [];
  const videoLinks: MediaAttachment[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: unknown }).kind;

    if (kind === "image" && images.length < MAX_IMAGES_PER_POST) {
      const v = validateImageItem(item, authorMemberId);
      if (v) images.push(v);
    } else if (kind === "voice" && voices.length < MAX_VOICE_NOTES_PER_POST) {
      const v = validateVoiceItem(item, authorMemberId);
      if (v) voices.push(v);
    } else if (kind === "file" && files.length < MAX_FILES_PER_POST) {
      const v = validateFileItem(item, authorMemberId);
      if (v) files.push(v);
    } else if (kind === "gif" && gifs.length < MAX_GIFS_PER_POST) {
      const v = validateGifItem(item, authorMemberId);
      if (v) gifs.push(v);
    } else if (kind === "video-link" && videoLinks.length < MAX_VIDEO_LINKS_PER_POST) {
      const v = validateVideoLinkItem(item, authorMemberId);
      if (v) videoLinks.push(v);
    }
  }
  return [...images, ...voices, ...gifs, ...files, ...videoLinks];
}

/**
 * Comments & Replies (2026-08-19) — same validation RULES per kind (the
 * validators above are shared verbatim, not reimplemented), a different
 * orchestration: smaller caps, and no `video-link` branch at all — a
 * comment can never carry one no matter what a request claims, by
 * construction (there's no code path that would ever accept it), not by
 * a runtime check that could be forgotten to add.
 */
export function normalizeCommentAttachments(
  raw: unknown,
  authorMemberId: string,
): MediaAttachment[] {
  if (!Array.isArray(raw)) return [];
  const images: MediaAttachment[] = [];
  const voices: MediaAttachment[] = [];
  const gifs: MediaAttachment[] = [];
  const files: MediaAttachment[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: unknown }).kind;

    if (kind === "image" && images.length < MAX_IMAGES_PER_COMMENT) {
      const v = validateImageItem(item, authorMemberId);
      if (v) images.push(v);
    } else if (kind === "voice" && voices.length < MAX_VOICE_NOTES_PER_COMMENT) {
      const v = validateVoiceItem(item, authorMemberId);
      if (v) voices.push(v);
    } else if (kind === "file" && files.length < MAX_FILES_PER_COMMENT) {
      const v = validateFileItem(item, authorMemberId);
      if (v) files.push(v);
    } else if (kind === "gif" && gifs.length < MAX_GIFS_PER_COMMENT) {
      const v = validateGifItem(item, authorMemberId);
      if (v) gifs.push(v);
    }
  }
  return [...images, ...voices, ...gifs, ...files];
}
