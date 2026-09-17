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

/**
 * Agency Community sibling of the two functions above — same ownership-
 * namespace contract, rooted at `community/agency/{agencyId}/...` instead
 * of `community/{subAccountId}/...` so the two ownership scopes can never
 * collide on a Storage path. `memberId` here is the opaque identity id
 * `resolveAgencyCommunityCaller` resolves (a Firebase uid for the owner, a
 * Person id for a member) — the exact same id already used to key
 * likes/poll-votes for agency posts.
 */
export function isOwnedAgencyCommunityAttachmentStoragePath(input: {
  storagePath: string;
  agencyId: string;
  memberId: string;
  kind: StoredAttachmentKind;
}): boolean {
  const prefix = `community/agency/${input.agencyId}/${segmentByKind[input.kind]}/${input.memberId}/`;
  const remainder = input.storagePath.slice(prefix.length);
  return (
    input.storagePath.startsWith(prefix) &&
    remainder.length > 0 &&
    !remainder.includes("/") &&
    !remainder.includes("..") &&
    !remainder.includes("\\\\")
  );
}

export function ownedAgencyAttachmentStoragePath(
  attachment: MediaAttachment,
  agencyId: string
): string | null {
  switch (attachment.kind) {
    case "image":
      return isOwnedAgencyCommunityAttachmentStoragePath({
        storagePath: attachment.image.storagePath,
        agencyId,
        memberId: attachment.image.authorMemberId,
        kind: "image",
      })
        ? attachment.image.storagePath
        : null;
    case "voice":
      return isOwnedAgencyCommunityAttachmentStoragePath({
        storagePath: attachment.voice.storagePath,
        agencyId,
        memberId: attachment.voice.authorMemberId,
        kind: "voice",
      })
        ? attachment.voice.storagePath
        : null;
    case "file":
      return isOwnedAgencyCommunityAttachmentStoragePath({
        storagePath: attachment.file.storagePath,
        agencyId,
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
