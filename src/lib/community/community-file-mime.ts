/**
 * Community post generic file/document attachments — client-safe, shared
 * by the upload client and the upload API route, same convention as
 * community-image-mime.ts / voice-note-mime.ts.
 *
 * v1 allowlist is deliberately business/community-document types only —
 * no executables, no archives (a .zip can hide anything), no arbitrary
 * MIME types. Extending this list later is additive; nothing about the
 * upload architecture changes.
 */

export const COMMUNITY_FILE_MIME_ALLOWLIST = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

/** 15 MB — generous enough for a real PDF/deck a member wants to share,
 *  well under Storage/serverless-friendly limits. No concrete reason found
 *  to match the 5 MB image cap; documents are legitimately larger. */
export const MAX_COMMUNITY_FILE_BYTES = 15 * 1024 * 1024;

export const MAX_FILES_PER_POST = 3;

/** Comments & Replies (2026-08-19) — same MIME allowlist/size cap, a
 *  smaller count: one file per comment, matching the same conversational-
 *  not-gallery reasoning as MAX_IMAGES_PER_COMMENT. */
export const MAX_FILES_PER_COMMENT = 1;

export function isAllowedCommunityFileMimeType(mimeType: string): boolean {
  return (COMMUNITY_FILE_MIME_ALLOWLIST as readonly string[]).includes(mimeType);
}

/** Display-only label for the file-type icon/badge — never used for
 *  validation (the MIME allowlist above is the real gate). */
export function labelForCommunityFileMimeType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOC";
    case "application/vnd.ms-excel":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "XLS";
    case "text/csv":
      return "CSV";
    case "text/plain":
      return "TXT";
    case "application/vnd.ms-powerpoint":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "PPT";
    default:
      return "FILE";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
