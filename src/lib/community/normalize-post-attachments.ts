import "server-only";

import { parseVideoUrl } from "@/lib/community/video-embed";
import {
  MAX_IMAGES_PER_POST,
  MAX_VOICE_NOTES_PER_POST,
} from "@/lib/community/community-image-mime";
import { MAX_FILES_PER_POST } from "@/lib/community/community-file-mime";
import type { MediaAttachment, VideoProviderName } from "@/types/media-attachment";

const MAX_GIFS_PER_POST = 1;
const MAX_VIDEO_LINKS_PER_POST = 1;

/**
 * Normalize + validate client-supplied attachments — shared by the
 * create-post route AND the edit-post route (extracted here in Phase D
 * specifically so the two can never validate differently). Every image/
 * voice/file object was already uploaded (and server-validated at upload
 * time) via its own /api/community/[saId]/community-* route before ever
 * reaching this function — this pass only checks SHAPE and caps counts;
 * it does not re-verify the Storage object exists.
 *
 * `video-link` is the one kind actually RE-validated here, not just
 * shape-checked: the client-reported `provider`/`providerId`/`embedUrl`
 * are discarded entirely and re-derived server-side from the client's
 * `originalUrl` via `parseVideoUrl` — the same function the composer used
 * to preview it. This is the actual security boundary that keeps a
 * Community post from ever rendering an arbitrary iframe: a client could
 * otherwise claim any `embedUrl` it wants, and `CommunityPostAttachments`
 * blindly renders whatever's stored.
 *
 * `gif` is shape-checked but not re-verified against the provider (no
 * live provider is wired yet — see the Phase D report) — a future pass
 * wiring the GIF picker should reconsider whether provider-id round-trip
 * verification is worth adding then.
 *
 * `authorMemberId` is always overwritten with the real authenticated
 * member — never trusted from the client, same discipline as everything
 * else in these routes.
 */
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
      const image = (item as { image?: Record<string, unknown> }).image;
      if (
        image &&
        typeof image.id === "string" &&
        typeof image.url === "string" &&
        typeof image.storagePath === "string" &&
        typeof image.mimeType === "string" &&
        typeof image.fileSizeBytes === "number"
      ) {
        images.push({
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
        });
      }
    } else if (kind === "voice" && voices.length < MAX_VOICE_NOTES_PER_POST) {
      const voice = (item as { voice?: Record<string, unknown> }).voice;
      if (
        voice &&
        typeof voice.id === "string" &&
        typeof voice.url === "string" &&
        typeof voice.storagePath === "string" &&
        typeof voice.mimeType === "string" &&
        typeof voice.durationMs === "number" &&
        typeof voice.fileSizeBytes === "number"
      ) {
        voices.push({
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
        });
      }
    } else if (kind === "file" && files.length < MAX_FILES_PER_POST) {
      const file = (item as { file?: Record<string, unknown> }).file;
      if (
        file &&
        typeof file.id === "string" &&
        typeof file.url === "string" &&
        typeof file.storagePath === "string" &&
        typeof file.fileName === "string" &&
        typeof file.mimeType === "string" &&
        typeof file.fileSizeBytes === "number"
      ) {
        files.push({
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
        });
      }
    } else if (kind === "gif" && gifs.length < MAX_GIFS_PER_POST) {
      const gif = (item as { gif?: Record<string, unknown> }).gif;
      if (
        gif &&
        gif.provider === "tenor" &&
        typeof gif.providerId === "string" &&
        typeof gif.url === "string" &&
        typeof gif.previewUrl === "string" &&
        typeof gif.width === "number" &&
        typeof gif.height === "number"
      ) {
        gifs.push({
          kind: "gif",
          gif: {
            id: typeof gif.id === "string" ? gif.id : gif.providerId,
            provider: "tenor",
            providerId: gif.providerId,
            url: gif.url,
            previewUrl: gif.previewUrl,
            width: gif.width,
            height: gif.height,
            attribution: typeof gif.attribution === "string" ? gif.attribution : undefined,
            authorMemberId,
            createdAt: Date.now(),
          },
        });
      }
    } else if (kind === "video-link" && videoLinks.length < MAX_VIDEO_LINKS_PER_POST) {
      const videoLink = (item as { videoLink?: Record<string, unknown> }).videoLink;
      const originalUrl =
        videoLink && typeof videoLink.originalUrl === "string" ? videoLink.originalUrl : null;
      // Re-derived from the URL, never trusting the client's own
      // provider/providerId/embedUrl claims — see the module comment.
      const parsed = originalUrl ? parseVideoUrl(originalUrl) : null;
      if (parsed) {
        videoLinks.push({
          kind: "video-link",
          videoLink: {
            id: typeof videoLink!.id === "string" ? (videoLink!.id as string) : parsed.id,
            originalUrl: originalUrl!,
            provider: parsed.provider as VideoProviderName,
            providerId: parsed.id,
            embedUrl: parsed.embedUrl,
            authorMemberId,
            createdAt: Date.now(),
          },
        });
      }
    }
  }
  return [...images, ...voices, ...gifs, ...files, ...videoLinks];
}
