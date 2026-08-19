/**
 * Community post attachment MIME/limits — client-safe, shared by the
 * upload client and the upload API route, same convention as
 * voice-note-mime.ts. A member manually uploading a .gif file as a static
 * image is fine here (image/gif is a normal image MIME type the existing
 * image pipeline already treats like any other image) — this is NOT the
 * GIF-search/picker feature, which remains out of scope.
 *
 * Also holds MAX_VOICE_NOTES_PER_POST alongside the image limits, since
 * both are "how many of this attachment kind can one post have" caps
 * enforced by the same create-post route — kept together rather than
 * split across this file and voice-note-mime.ts.
 */

export const COMMUNITY_IMAGE_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Matches the existing MAX_IMAGE_BYTES precedent in upload-image.ts — no
 *  concrete reason found to diverge from it for Community post images. */
export const MAX_COMMUNITY_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Phase C v1 limits — conservative, per-kind, independently capped. The
 *  data model (a plain MediaAttachment[]) technically supports more; these
 *  are UI/API limits, not architectural ones. */
export const MAX_IMAGES_PER_POST = 4;
export const MAX_VOICE_NOTES_PER_POST = 1;

/** Comments & Replies (2026-08-19) — deliberately smaller than the post
 *  caps: a comment is a conversational reply, not a gallery post. One of
 *  each kind keeps a comment from becoming a second post. */
export const MAX_IMAGES_PER_COMMENT = 1;
export const MAX_VOICE_NOTES_PER_COMMENT = 1;

export function isAllowedCommunityImageMimeType(mimeType: string): boolean {
  return (COMMUNITY_IMAGE_MIME_ALLOWLIST as readonly string[]).includes(mimeType);
}

export function extensionForCommunityImageMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "img";
  }
}
