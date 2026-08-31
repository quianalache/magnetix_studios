import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  AuthorizedMediaUrl,
  CreateAuthorizedMediaUrlInput,
  CreateMediaUploadTargetInput,
  MediaObjectMetadata,
  MediaStorageAdapter,
  MediaUploadTarget,
} from "@/lib/server/media-storage/types";
import { MediaStorageConfigurationError } from "@/lib/server/media-storage/types";

const DEFAULT_URL_TTL_SECONDS = 15 * 60;

interface S3MediaConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function config(): S3MediaConfig {
  const endpoint = process.env.MAGNETIX_MEDIA_S3_ENDPOINT;
  const bucket = process.env.MAGNETIX_MEDIA_S3_BUCKET;
  const accessKeyId = process.env.MAGNETIX_MEDIA_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MAGNETIX_MEDIA_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new MediaStorageConfigurationError(
      "S3-compatible media storage requires MAGNETIX_MEDIA_S3_ENDPOINT, MAGNETIX_MEDIA_S3_BUCKET, MAGNETIX_MEDIA_S3_ACCESS_KEY_ID, and MAGNETIX_MEDIA_S3_SECRET_ACCESS_KEY."
    );
  }
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.MAGNETIX_MEDIA_S3_REGION ?? "auto",
  };
}

function client(c: S3MediaConfig) {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: process.env.MAGNETIX_MEDIA_S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
    },
  });
}

/** Generic S3 semantics; Cloudflare R2 is configured entirely by environment. */
export const s3CompatibleMediaStorageAdapter: MediaStorageAdapter = {
  provider: "s3_compatible",
  async createUploadTarget(
    input: CreateMediaUploadTargetInput
  ): Promise<MediaUploadTarget> {
    const c = config();
    const expiresIn = input.expiresInSeconds ?? DEFAULT_URL_TTL_SECONDS;
    const url = await getSignedUrl(
      client(c),
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: input.key,
        ContentType: input.mimeType,
      }),
      { expiresIn }
    );
    return {
      method: "PUT",
      url,
      headers: { "content-type": input.mimeType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  },
  async inspectObject(key: string): Promise<MediaObjectMetadata | null> {
    const c = config();
    try {
      const object = await client(c).send(
        new HeadObjectCommand({ Bucket: c.bucket, Key: key })
      );
      return {
        key,
        mimeType: object.ContentType ?? null,
        fileSizeBytes: object.ContentLength ?? null,
        etag: object.ETag ?? null,
      };
    } catch (error: unknown) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  },
  async createAuthorizedUrl(
    input: CreateAuthorizedMediaUrlInput
  ): Promise<AuthorizedMediaUrl> {
    const c = config();
    const expiresIn = input.expiresInSeconds ?? DEFAULT_URL_TTL_SECONDS;
    const url = await getSignedUrl(
      client(c),
      new GetObjectCommand({
        Bucket: c.bucket,
        Key: input.key,
        ResponseContentDisposition:
          input.disposition === "attachment" ? "attachment" : undefined,
      }),
      { expiresIn }
    );
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  },
  async deleteObject(key: string): Promise<void> {
    const c = config();
    await client(c).send(
      new DeleteObjectCommand({ Bucket: c.bucket, Key: key })
    );
  },
};
