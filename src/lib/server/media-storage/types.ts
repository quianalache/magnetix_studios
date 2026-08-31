import type { MediaStorageProvider } from "@/types/media-asset";

export interface MediaUploadTarget {
  method: "PUT" | "POST";
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface MediaObjectMetadata {
  key: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  etag: string | null;
}

export interface AuthorizedMediaUrl {
  url: string;
  expiresAt: Date;
}

export interface CreateMediaUploadTargetInput {
  key: string;
  mimeType: string;
  expiresInSeconds?: number;
}

export interface CreateAuthorizedMediaUrlInput {
  key: string;
  disposition?: "inline" | "attachment";
  expiresInSeconds?: number;
}

/** Server-only abstraction; implementations never disclose credentials. */
export interface MediaStorageAdapter {
  readonly provider: MediaStorageProvider;
  createUploadTarget(
    input: CreateMediaUploadTargetInput
  ): Promise<MediaUploadTarget>;
  inspectObject(key: string): Promise<MediaObjectMetadata | null>;
  createAuthorizedUrl(
    input: CreateAuthorizedMediaUrlInput
  ): Promise<AuthorizedMediaUrl>;
  deleteObject(key: string): Promise<void>;
}

export class MediaStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaStorageConfigurationError";
  }
}
