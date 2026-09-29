import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * Canonical, provider-neutral media record. Feature documents should retain
 * their existing legacy URL fields during migration, but new work can refer
 * to this stable id and resolve access server-side.
 */
export interface MediaAsset {
  id: string;
  agencyId: string;
  subAccountId: string | null;
  ownerScope?: VideoOwnerScope;
  uploadedByPersonId: string | null;
  mediaType: MediaAssetType;
  source: MediaAssetSource | null;
  storage: MediaAssetStorage;
  status: MediaAssetStatus;
  access: MediaAssetAccessPolicy;
  metadata: MediaAssetMetadata;
  derivatives?: MediaAssetDerivatives;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  deletedAt: Timestamp | FieldValue | null;
  bunny?: BunnyMediaAssetMetadata;
  references?: MediaAssetReference[];
  /** Media Library display fields (Assets, 2026-09). Optional/additive. */
  library?: MediaLibraryFields;
  /**
   * Public delivery copy of a Media Library IMAGE (Assets corrections,
   * 2026-09-29). Created only by an explicit admin action; the original
   * object stays private. Absent/null = private.
   */
  publicImage?: MediaPublicImage | null;
}

export interface MediaPublicImage {
  /** Storage key of the public copy (`media-public/{sa}/{assetId}/{uuid}.{ext}`). */
  key: string;
  url: string;
  publishedAt: Timestamp | FieldValue | null;
  publishedByUid: string;
}

export interface MediaLibraryFields {
  title?: string | null;
  tags?: string[];
  updatedByUid?: string | null;
}

export type VideoOwnerScope =
  | { kind: "tenant"; agencyId: string; subAccountId: string }
  | { kind: "agency"; agencyId: string };

export type LessonVideoSource =
  | {
      sourceType: "external";
      provider: string;
      url: string;
      videoId: string;
    }
  | { sourceType: "hosted"; hostedVideoId: string };

export interface BunnyMediaAssetMetadata {
  libraryId: string;
  videoGuid: string;
  title: string;
  lifecycleStatus: MediaAssetStatus;
  durationSeconds: number | null;
  storageBytes: number | null;
  width: number | null;
  height: number | null;
  thumbnailFileName: string | null;
  providerStatus: number | string | null;
  providerUpdatedAt: Timestamp | FieldValue | null;
  deletedAt: Timestamp | FieldValue | null;
  /**
   * Set while a provider delete is in flight (Assets corrections,
   * 2026-09-29): no new playback token is issued during that window. Cleared
   * when the provider delete fails; honoured for a bounded time only, so a
   * crashed delete can't block playback forever.
   */
  deletionStartedAt?: Timestamp | FieldValue | null;
}

export interface MediaAssetReference {
  type: "course_lesson";
  courseId: string;
  lessonId: string;
  createdAt: Timestamp | FieldValue | null;
}

export type MediaAssetType =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "recording"
  | "other";
export type MediaAssetStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "failed"
  | "deleted";
export type MediaStorageProvider =
  | "firebase"
  | "s3_compatible"
  | "external"
  | "bunny";

/** A durable relation to the feature that owns or exposes an asset. */
export interface MediaAssetSource {
  type:
    | "community_post"
    | "community_channel"
    | "course"
    | "webinar"
    | "live_session"
    | "marketing"
    | "other";
  id: string;
}

/** Provider/key metadata only — never persist a short-lived signed URL here. */
export interface MediaAssetStorage {
  provider: MediaStorageProvider;
  key: string;
  bucket: string | null;
  mimeType: string;
  fileSizeBytes: number | null;
}

export interface MediaAssetMetadata {
  originalFilename: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

/** Future transcoding/HLS/poster relations without inventing URL fields. */
export interface MediaAssetDerivatives {
  posterAssetId?: string | null;
  hlsManifestKey?: string | null;
  renditionKeys?: Record<string, string>;
}

/**
 * Explicit authorization intent. The resolver maps these policies to a
 * verified request principal; a URL alone is never proof of access.
 */
export type MediaAssetAccessPolicy =
  | { type: "public" }
  | { type: "tenant" }
  | { type: "owner" }
  | { type: "community_group"; groupId: string }
  | { type: "course"; courseId: string }
  | { type: "webinar"; webinarId: string }
  | { type: "live_session"; liveSessionId: string };
