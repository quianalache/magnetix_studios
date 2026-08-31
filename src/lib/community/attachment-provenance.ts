import "server-only";

import type { MediaAttachment } from "@/types/media-attachment";

type StoredAttachmentKind = Extract<
  MediaAttachment["kind"],
  "image" | "voice" | "file"
>;

const segmentByKind: Record<StoredAttachmentKind, string> = {
  image: "post-images",
  voice: "voice-notes",
  file: "post-files",
};

/**
 * A Firebase path may only be used for cleanup when it lies in the exact
 * server-generated member namespace for its attachment kind. This prevents a
 * crafted post/comment payload from turning Admin-SDK cleanup into a
 * cross-member or cross-tenant delete primitive.
 */
export function isOwnedCommunityAttachmentStoragePath(input: {
  storagePath: string;
  subAccountId: string;
  memberId: string;
  kind: StoredAttachmentKind;
}): boolean {
  const prefix = `community/${input.subAccountId}/${segmentByKind[input.kind]}/${input.memberId}/`;
  const remainder = input.storagePath.slice(prefix.length);
  return (
    input.storagePath.startsWith(prefix) &&
    remainder.length > 0 &&
    !remainder.includes("/") &&
    !remainder.includes("..") &&
    !remainder.includes("\\\\")
  );
}

export function ownedAttachmentStoragePath(
  attachment: MediaAttachment,
  subAccountId: string
): string | null {
  switch (attachment.kind) {
    case "image":
      return isOwnedCommunityAttachmentStoragePath({
        storagePath: attachment.image.storagePath,
        subAccountId,
        memberId: attachment.image.authorMemberId,
        kind: "image",
      })
        ? attachment.image.storagePath
        : null;
    case "voice":
      return isOwnedCommunityAttachmentStoragePath({
        storagePath: attachment.voice.storagePath,
        subAccountId,
        memberId: attachment.voice.authorMemberId,
        kind: "voice",
      })
        ? attachment.voice.storagePath
        : null;
    case "file":
      return isOwnedCommunityAttachmentStoragePath({
        storagePath: attachment.file.storagePath,
        subAccountId,
        memberId: attachment.file.authorMemberId,
        kind: "file",
      })
        ? attachment.file.storagePath
        : null;
    case "gif":
    case "video-link":
      return null;
  }
}
