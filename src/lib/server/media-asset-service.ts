import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { mediaStorageAdapter } from "@/lib/server/media-storage";
import {
  resolveMediaAssetAccess,
  type VerifiedMediaViewer,
} from "@/lib/server/media-asset-access-service";
import type {
  MediaAsset,
  MediaAssetAccessPolicy,
  MediaAssetDerivatives,
  MediaAssetMetadata,
  MediaAssetSource,
  MediaAssetStatus,
  MediaAssetStorage,
  MediaAssetType,
} from "@/types/media-asset";

function assetsCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/mediaAssets`);
}

function toMediaAsset(snap: FirebaseFirestore.DocumentSnapshot): MediaAsset {
  return { id: snap.id, ...(snap.data() as Omit<MediaAsset, "id">) };
}

export interface MediaAssetTenant {
  agencyId: string;
  subAccountId: string;
}

export interface CreateMediaAssetInput {
  uploadedByPersonId?: string | null;
  mediaType: MediaAssetType;
  source?: MediaAssetSource | null;
  storage: MediaAssetStorage;
  access: MediaAssetAccessPolicy;
  metadata?: Partial<MediaAssetMetadata>;
  derivatives?: MediaAssetDerivatives;
  status?: Extract<MediaAssetStatus, "pending" | "uploading">;
}

export type UpdateMediaAssetInput = Partial<
  Pick<MediaAsset, "source" | "access" | "metadata" | "derivatives">
>;

/** All canonical MediaAsset writes are server-only and tenant-scoped. */
export async function createMediaAsset(
  tenant: MediaAssetTenant,
  input: CreateMediaAssetInput
): Promise<MediaAsset> {
  const ref = assetsCol(tenant.subAccountId).doc();
  await ref.set({
    agencyId: tenant.agencyId,
    subAccountId: tenant.subAccountId,
    uploadedByPersonId: input.uploadedByPersonId ?? null,
    mediaType: input.mediaType,
    source: input.source ?? null,
    storage: input.storage,
    status: input.status ?? "pending",
    access: input.access,
    metadata: {
      originalFilename: null,
      durationMs: null,
      width: null,
      height: null,
      ...input.metadata,
    },
    derivatives: input.derivatives ?? {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  return toMediaAsset(await ref.get());
}

/** A raw asset id is never enough: callers must supply the owning tenant. */
export async function getMediaAsset(
  tenant: MediaAssetTenant,
  assetId: string,
  options?: { includeDeleted?: boolean }
): Promise<MediaAsset | null> {
  const snap = await assetsCol(tenant.subAccountId).doc(assetId).get();
  if (!snap.exists) return null;
  const asset = toMediaAsset(snap);
  if (
    asset.agencyId !== tenant.agencyId ||
    asset.subAccountId !== tenant.subAccountId
  )
    return null;
  if (
    !options?.includeDeleted &&
    (asset.status === "deleted" || asset.deletedAt)
  )
    return null;
  return asset;
}

export async function updateMediaAsset(
  tenant: MediaAssetTenant,
  assetId: string,
  patch: UpdateMediaAssetInput
): Promise<void> {
  if (!(await getMediaAsset(tenant, assetId)))
    throw new Error("MediaAsset not found");
  await assetsCol(tenant.subAccountId)
    .doc(assetId)
    .set(
      { ...patch, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
}

export async function setMediaAssetStatus(
  tenant: MediaAssetTenant,
  assetId: string,
  status: MediaAssetStatus
): Promise<void> {
  if (
    !(await getMediaAsset(tenant, assetId, {
      includeDeleted: status === "deleted",
    }))
  )
    throw new Error("MediaAsset not found");
  await assetsCol(tenant.subAccountId)
    .doc(assetId)
    .set(
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        ...(status === "deleted"
          ? { deletedAt: FieldValue.serverTimestamp() }
          : {}),
      },
      { merge: true }
    );
}

export function markMediaAssetReady(tenant: MediaAssetTenant, assetId: string) {
  return setMediaAssetStatus(tenant, assetId, "ready");
}
export function markMediaAssetFailed(
  tenant: MediaAssetTenant,
  assetId: string
) {
  return setMediaAssetStatus(tenant, assetId, "failed");
}
export function softDeleteMediaAsset(
  tenant: MediaAssetTenant,
  assetId: string
) {
  return setMediaAssetStatus(tenant, assetId, "deleted");
}

/** Resolve a short-lived URL only after the caller has established access. */
export async function resolveMediaAssetUrl(input: {
  tenant: MediaAssetTenant;
  assetId: string;
  viewer: VerifiedMediaViewer;
  disposition?: "inline" | "attachment";
  expiresInSeconds?: number;
}) {
  const asset = await getMediaAsset(input.tenant, input.assetId);
  if (!asset) return null;
  const decision = resolveMediaAssetAccess(asset, input.viewer);
  if (!decision.allowed) return null;
  return mediaStorageAdapter(asset.storage.provider).createAuthorizedUrl({
    key: asset.storage.key,
    disposition: input.disposition,
    expiresInSeconds: input.expiresInSeconds,
  });
}
