import "server-only";

import { getStorage } from "firebase-admin/storage";
import type {
  MediaStorageAdapter,
  AuthorizedMediaUrl,
  CreateAuthorizedMediaUrlInput,
  CreateMediaUploadTargetInput,
  MediaObjectMetadata,
  MediaUploadTarget,
} from "@/lib/server/media-storage/types";
import { MediaStorageConfigurationError } from "@/lib/server/media-storage/types";

const DEFAULT_URL_TTL_SECONDS = 15 * 60;

function bucket() {
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name) {
    throw new MediaStorageConfigurationError(
      "Firebase Storage is not configured for MediaAsset access."
    );
  }
  return getStorage().bucket(name);
}

/**
 * Adapter for legacy Firebase objects. It deliberately has no direct-upload
 * target: existing Community uploads keep their proven server-upload routes.
 */
export const firebaseMediaStorageAdapter: MediaStorageAdapter = {
  provider: "firebase",
  async createUploadTarget(
    input: CreateMediaUploadTargetInput
  ): Promise<MediaUploadTarget> {
    void input;
    throw new MediaStorageConfigurationError(
      "Firebase MediaAsset direct uploads are not enabled; use the existing server upload route."
    );
  },
  async inspectObject(key: string): Promise<MediaObjectMetadata | null> {
    const file = bucket().file(key);
    try {
      const [metadata] = await file.getMetadata();
      return {
        key,
        mimeType: metadata.contentType ?? null,
        fileSizeBytes: metadata.size ? Number(metadata.size) : null,
        etag: metadata.etag ?? null,
      };
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  },
  async createAuthorizedUrl(
    input: CreateAuthorizedMediaUrlInput
  ): Promise<AuthorizedMediaUrl> {
    const expiresAt = new Date(
      Date.now() + (input.expiresInSeconds ?? DEFAULT_URL_TTL_SECONDS) * 1000
    );
    const [url] = await bucket()
      .file(input.key)
      .getSignedUrl({
        action: "read",
        expires: expiresAt,
        responseDisposition:
          input.disposition === "attachment" ? "attachment" : undefined,
      });
    return { url, expiresAt };
  },
  async deleteObject(key: string): Promise<void> {
    await bucket().file(key).delete({ ignoreNotFound: true });
  },
};
