import type { MediaAssetStatus, MediaAssetType, MediaStorageProvider } from "@/types/media-asset";

/**
 * Media Library (Assets, 2026-09) — the browser-facing view of the
 * canonical `subAccounts/{id}/mediaAssets` records. It is NOT a second
 * media store: images and documents are MediaAssets on Firebase Storage
 * (private `media-library/…` objects, read through short-lived signed URLs),
 * videos are the existing Bunny-hosted MediaAssets.
 */

export type MediaLibraryKind = "image" | "video" | "document" | "other";

export interface MediaUsage {
  kind: "course_lesson" | "resource" | "replay_link" | "public_image";
  label: string;
  detail: string;
  /** In-app link to the place it's used. */
  href: string | null;
}

export interface MediaLibraryItem {
  id: string;
  kind: MediaLibraryKind;
  mediaType: MediaAssetType;
  provider: MediaStorageProvider;
  title: string;
  filename: string | null;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  status: MediaAssetStatus;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  uploadedByName: string | null;
  /** Short-lived signed thumbnail for images (null for videos/documents). */
  thumbnailUrl: string | null;
  usage: MediaUsage[];
  /** The active public replay link, if sharing is on. */
  share: MediaShareView | null;
  /**
   * Public delivery URL of an image an admin explicitly made public for
   * pages / emails / course thumbnails (a separate public copy — the
   * original stays private). Null while the image is private.
   */
  publicUrl: string | null;
}

export type MediaShareKind = "public_replay";
export type MediaShareStatus = "active" | "revoked";

/**
 * `mediaShares/{shareId}` — server-only (default deny). Application-level
 * sharing of ONE MediaAsset. The public URL carries `{shareId}.{hmac}`;
 * nothing grants access to anything but this asset, and Bunny tokens are
 * minted per view with a short expiry. `kind` + `recipient` leave room for
 * future private gift links without a schema change.
 */
export interface MediaShareDoc {
  agencyId: string;
  subAccountId: string;
  mediaAssetId: string;
  kind: MediaShareKind;
  status: MediaShareStatus;
  /** Reserved for private gift links (not implemented): who may open it. */
  recipient: null;
  expiresAt: unknown | null;
  createdByUid: string;
  createdAt: unknown;
  revokedAt: unknown | null;
  revokedByUid: string | null;
  viewCount: number;
  lastViewedAt: unknown | null;
}

export interface MediaShareView {
  id: string;
  url: string;
  status: MediaShareStatus;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string | null;
  viewCount: number;
}

/** A read-only reference into another CRM module (CRM Resources). */
export type CrmResourceType =
  | "course"
  | "offer"
  | "community"
  | "form"
  | "page"
  | "webinar"
  | "booking_page"
  | "product"
  | "website";

export interface CrmResourceItem {
  id: string;
  type: CrmResourceType;
  title: string;
  description: string;
  /** "Courses", "Offers", … */
  sourceModule: string;
  /** How people get it: Member Access, Checkout Link, Public Page, … */
  delivery: string;
  status: "active" | "draft" | "archived";
  statusLabel: string;
  updatedAt: string | null;
  updatedByName: string | null;
  /** Where the authoritative record is managed. */
  href: string;
  /** Public page, when the module has one. */
  publicUrl: string | null;
}
