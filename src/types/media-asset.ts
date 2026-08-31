import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * Canonical, provider-neutral media record. Feature documents should retain
 * their existing legacy URL fields during migration, but new work can refer
 * to this stable id and resolve access server-side.
 */
export interface MediaAsset {
  id: string;
  agencyId: string;
  subAccountId: string;
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
export type MediaStorageProvider = "firebase" | "s3_compatible" | "external";

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
