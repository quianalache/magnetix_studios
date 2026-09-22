import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  MediaAsset,
  MediaAssetReference,
  MediaAssetStatus,
  VideoOwnerScope,
} from "@/types/media-asset";

const libraryId = () => process.env.BUNNY_STREAM_LIBRARY_ID?.trim() || "";
const apiKey = () => process.env.BUNNY_STREAM_API_KEY?.trim() || "";
const cdnHostname = () => process.env.BUNNY_STREAM_CDN_HOSTNAME?.trim() || "";
const tokenKey = () => process.env.BUNNY_STREAM_TOKEN_KEY?.trim() || "";

function requireConfig() {
  const config = { libraryId: libraryId(), apiKey: apiKey(), cdnHostname: cdnHostname(), tokenKey: tokenKey() };
  if (!config.libraryId || !config.apiKey || !config.cdnHostname || !config.tokenKey) {
    throw new Error("Bunny Stream is not configured");
  }
  return config;
}

function assetCollection(scope: VideoOwnerScope) {
  return getAdminDb().collection(
    scope.kind === "tenant"
      ? `subAccounts/${scope.subAccountId}/mediaAssets`
      : `agencies/${scope.agencyId}/mediaAssets`,
  );
}

function scopeMatches(asset: MediaAsset, scope: VideoOwnerScope) {
  if (scope.agencyId && asset.agencyId !== scope.agencyId) return false;
  return scope.kind === "tenant"
    ? asset.subAccountId === scope.subAccountId
    : asset.ownerScope?.kind === "agency";
}

function toAsset(snap: FirebaseFirestore.DocumentSnapshot): MediaAsset {
  return { id: snap.id, ...(snap.data() as Omit<MediaAsset, "id">) };
}

export type BunnyWebhookCheckpoint = (checkpoint: string, details?: Record<string, unknown>) => void;

class BunnyRequestError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`Bunny request failed (${status}) for ${path}`);
    this.name = "BunnyRequestError";
  }
}

async function bunnyRequest<T>(path: string, init: RequestInit = {}, onCheckpoint?: BunnyWebhookCheckpoint): Promise<T> {
  const config = requireConfig();
  onCheckpoint?.("bunny_metadata_get_starting", { path });
  const response = await fetch(`https://video.bunnycdn.com${path}`, {
    ...init,
    headers: { AccessKey: config.apiKey, Accept: "application/json", ...(init.headers || {}) },
  });
  onCheckpoint?.("bunny_get_status_received", { path, httpStatus: response.status, ok: response.ok });
  if (!response.ok) throw new BunnyRequestError(response.status, path);
  const text = await response.text();
  const parsed = (text ? JSON.parse(text) : undefined) as T;
  onCheckpoint?.("bunny_response_parsed", { path, responsePresent: Boolean(parsed) });
  return parsed;
}

interface BunnyVideo {
  guid: string;
  title?: string;
  status?: number;
  encodeProgress?: number;
  length?: number;
  storageSize?: number;
  width?: number;
  height?: number;
  thumbnailFileName?: string;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function lifecycle(video: BunnyVideo): MediaAssetStatus {
  if ((video.status === 5 || video.status === 6) && (video.encodeProgress ?? 0) < 100) return "failed";
  if ((video.encodeProgress ?? 0) >= 100 || video.status === 4) return "ready";
  if (video.status === 0) return "pending";
  if (video.status === 1) return "uploading";
  return "processing";
}

export async function initBunnyHostedVideo(input: {
  scope: VideoOwnerScope;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: string;
  courseId?: string;
  lessonId?: string;
}) {
  const config = requireConfig();
  const bunny = await bunnyRequest<BunnyVideo>(`/library/${config.libraryId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: input.title.trim() || input.filename }),
  });
  if (!bunny.guid) throw new Error("Bunny did not return a video GUID");
  const ref = assetCollection(input.scope).doc();
  const reference: MediaAssetReference | undefined = input.courseId && input.lessonId
    ? { type: "course_lesson", courseId: input.courseId, lessonId: input.lessonId, createdAt: Timestamp.now() }
    : undefined;
  await ref.set({
    agencyId: input.scope.agencyId,
    subAccountId: input.scope.kind === "tenant" ? input.scope.subAccountId : null,
    ownerScope: input.scope,
    uploadedByPersonId: input.createdBy,
    mediaType: "video",
    source: { type: "course", id: input.courseId || "standalone-course" },
    storage: { provider: "bunny", key: bunny.guid, bucket: null, mimeType: input.mimeType, fileSizeBytes: input.sizeBytes },
    status: "uploading",
    access: input.courseId ? { type: "course", courseId: input.courseId } : { type: "owner" },
    metadata: { originalFilename: input.filename, durationMs: null, width: null, height: null },
    bunny: {
      libraryId: config.libraryId, videoGuid: bunny.guid, title: input.title.trim() || input.filename,
      lifecycleStatus: "uploading", durationSeconds: null, storageBytes: null, width: null, height: null,
      thumbnailFileName: null, providerStatus: bunny.status ?? null, providerUpdatedAt: FieldValue.serverTimestamp(), deletedAt: null,
    },
    references: reference ? [reference] : [],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), deletedAt: null,
  });
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return {
    assetId: ref.id,
    videoGuid: bunny.guid,
    libraryId: config.libraryId,
    uploadUrl: "https://video.bunnycdn.com/tusupload",
    authorizationSignature: hash(`${config.libraryId}${config.apiKey}${expires}${bunny.guid}`),
    authorizationExpire: expires,
  };
}

export async function getBunnyAsset(scope: VideoOwnerScope, assetId: string) {
  const snap = await assetCollection(scope).doc(assetId).get();
  if (!snap.exists) return null;
  const asset = toAsset(snap);
  return scopeMatches(asset, scope) && asset.storage.provider === "bunny" ? asset : null;
}

export async function syncBunnyHostedVideo(scope: VideoOwnerScope, assetId: string, onCheckpoint?: BunnyWebhookCheckpoint) {
  const asset = await getBunnyAsset(scope, assetId);
  if (!asset?.bunny) throw new Error("Hosted video not found");
  const video = await bunnyRequest<BunnyVideo>(`/library/${asset.bunny.libraryId}/videos/${asset.bunny.videoGuid}`, {}, onCheckpoint);
  const status = lifecycle(video);
  onCheckpoint?.("metadata_normalized", { providerStatus: video.status ?? null, lifecycleStatus: status });
  onCheckpoint?.("media_asset_update_starting");
  await assetCollection(scope).doc(assetId).set({
    status,
    updatedAt: FieldValue.serverTimestamp(),
    metadata: {
      ...asset.metadata,
      durationMs: typeof video.length === "number" ? video.length * 1000 : asset.metadata.durationMs,
      width: video.width ?? asset.metadata.width,
      height: video.height ?? asset.metadata.height,
    },
    bunny: {
      ...asset.bunny,
      lifecycleStatus: status,
      title: video.title || asset.bunny.title,
      durationSeconds: typeof video.length === "number" ? video.length : asset.bunny.durationSeconds,
      storageBytes: typeof video.storageSize === "number" ? video.storageSize : asset.bunny.storageBytes,
      width: video.width ?? asset.bunny.width,
      height: video.height ?? asset.bunny.height,
      thumbnailFileName: video.thumbnailFileName ?? asset.bunny.thumbnailFileName,
      providerStatus: video.status ?? null,
      providerUpdatedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });
  onCheckpoint?.("usage_recompute_starting");
  await refreshBunnyUsage(scope);
  return { ...(await getBunnyAsset(scope, assetId) as MediaAsset), provider: video };
}

export async function refreshBunnyUsage(scope: VideoOwnerScope) {
  const snap = await assetCollection(scope).where("storage.provider", "==", "bunny").get();
  let hostedVideoCount = 0, storageBytes = 0, durationSeconds = 0;
  snap.docs.forEach((doc) => {
    const asset = toAsset(doc);
    if (asset.status === "deleted") return;
    hostedVideoCount += 1;
    storageBytes += asset.bunny?.storageBytes ?? 0;
    durationSeconds += asset.bunny?.durationSeconds ?? 0;
  });
  await assetCollection(scope).doc("__usage").set({ hostedVideoCount, storageBytes, durationSeconds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { hostedVideoCount, storageBytes, durationSeconds };
}

export async function updateBunnyLessonReference(scope: VideoOwnerScope, assetId: string, reference: Omit<MediaAssetReference, "createdAt">, attached: boolean) {
  const asset = await getBunnyAsset(scope, assetId);
  if (!asset) return;
  const refs = (asset.references || []).filter((item) => !(item.type === reference.type && item.courseId === reference.courseId && item.lessonId === reference.lessonId));
  if (attached) refs.push({ ...reference, createdAt: Timestamp.now() });
  await assetCollection(scope).doc(assetId).set({ references: refs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function deleteBunnyHostedVideo(scope: VideoOwnerScope, assetId: string) {
  const asset = await getBunnyAsset(scope, assetId);
  if (!asset?.bunny) throw new Error("Hosted video not found");
  if ((asset.references || []).length) throw new Error("Hosted video is still referenced by a course lesson");
  await bunnyRequest(`/library/${asset.bunny.libraryId}/videos/${asset.bunny.videoGuid}`, { method: "DELETE" });
  await assetCollection(scope).doc(assetId).set({ status: "deleted", deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), bunny: { ...asset.bunny, lifecycleStatus: "deleted", deletedAt: FieldValue.serverTimestamp() } }, { merge: true });
  await refreshBunnyUsage(scope);
}

export async function getBunnyPlaybackUrl(scope: VideoOwnerScope, assetId: string) {
  const asset = await getBunnyAsset(scope, assetId);
  if (!asset?.bunny || asset.status !== "ready") return null;
  const expires = Math.floor(Date.now() / 1000) + 300;
  const token = hash(`${tokenKey()}${asset.bunny.videoGuid}${expires}`);
  return `https://iframe.mediadelivery.net/embed/${asset.bunny.libraryId}/${asset.bunny.videoGuid}?token=${token}&expires=${expires}`;
}

export async function findBunnyAssetByGuid(videoGuid: string) {
  const db = getAdminDb();
  const paths = ["agencies", "subAccounts"];
  for (const root of paths) {
    const groups = await db.collection(root).get();
    for (const group of groups.docs) {
      const snap = await group.ref.collection("mediaAssets").where("bunny.videoGuid", "==", videoGuid).limit(2).get();
      if (snap.size === 1) return { asset: toAsset(snap.docs[0]), ref: snap.docs[0].ref };
      if (snap.size > 1) throw new Error("Bunny GUID maps to multiple assets");
    }
  }
  return null;
}

export function webhookEventId(payload: Record<string, unknown>) {
  return String(payload.id || payload.eventId || payload.videoGuid || payload.videoId || randomUUID());
}
