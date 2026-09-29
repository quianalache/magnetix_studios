import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminDb } from "@/lib/firebase/admin";
import { isoOf, memberNames } from "@/lib/server/assets/people";
import { mediaStorageAdapter } from "@/lib/server/media-storage";
import {
  deleteBunnyHostedVideo,
  getBunnyPlaybackUrl,
  syncBunnyHostedVideo,
} from "@/lib/server/bunny-stream-service";
import { listSharesForSubAccount, revokeSharesForAsset, shareView } from "@/lib/server/assets/media-share-service";
import {
  COMMUNITY_FILE_MIME_ALLOWLIST,
  MAX_COMMUNITY_FILE_BYTES,
} from "@/lib/community/community-file-mime";
import {
  COMMUNITY_IMAGE_MIME_ALLOWLIST,
  MAX_COMMUNITY_IMAGE_BYTES,
} from "@/lib/community/community-image-mime";
import type { MediaAsset, VideoOwnerScope } from "@/types/media-asset";
import type { MediaLibraryItem, MediaLibraryKind, MediaUsage } from "@/types/media-library";

/**
 * Media Library (Assets, 2026-09) over the canonical
 * `subAccounts/{id}/mediaAssets` records — no second media store.
 *
 * - Images + documents: uploaded through this server route (the same
 *   Admin-SDK pattern as Community uploads, same MIME allowlists and caps)
 *   to `media-library/{subAccountId}/{assetId}/{uuid}.{ext}` — a path
 *   storage.rules default-deny, with NO public download token. Reads are
 *   short-lived signed URLs issued after a tenant check.
 * - Videos: the existing Bunny hosted-video records and upload flow
 *   (/api/media/hosted-videos/*). Nothing is duplicated or re-hosted.
 * - Deleting refuses while a course lesson, a Resource or a public image
 *   link still uses the file; replay links are revoked only after the
 *   provider confirms the delete.
 * - Files larger than the app server's request cap upload straight to
 *   Firebase Storage (media-upload-intake-service.ts).
 */

export class MediaLibraryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface Tenant {
  agencyId: string;
  subAccountId: string;
}

export const MEDIA_IMAGE_MAX_BYTES = MAX_COMMUNITY_IMAGE_BYTES;
export const MEDIA_DOCUMENT_MAX_BYTES = MAX_COMMUNITY_FILE_BYTES;

function col(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/mediaAssets`);
}

function toAsset(snap: FirebaseFirestore.DocumentSnapshot): MediaAsset {
  return { id: snap.id, ...(snap.data() as Omit<MediaAsset, "id">) };
}

function isLive(a: MediaAsset) {
  return a.status !== "deleted" && !a.deletedAt;
}

export function kindOf(a: Pick<MediaAsset, "mediaType">): MediaLibraryKind {
  if (a.mediaType === "image") return "image";
  if (a.mediaType === "video" || a.mediaType === "recording") return "video";
  if (a.mediaType === "document") return "document";
  return "other";
}

export function tenantScope(t: Tenant): VideoOwnerScope {
  return { kind: "tenant", agencyId: t.agencyId, subAccountId: t.subAccountId };
}

export async function tenantOf(subAccountId: string): Promise<Tenant> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) throw new MediaLibraryError("Sub-account not found", 404);
  return { subAccountId, agencyId: (snap.data()?.agencyId as string) ?? "" };
}

/** A live asset of THIS sub-account (and agency) — a foreign or deleted id reads as missing. */
export async function loadTenantAsset(t: Tenant, assetId: string): Promise<MediaAsset> {
  if (!assetId || assetId.includes("/") || assetId === "__usage") throw new MediaLibraryError("File not found", 404);
  const snap = await col(t.subAccountId).doc(assetId).get();
  if (!snap.exists) throw new MediaLibraryError("File not found", 404);
  const a = toAsset(snap);
  if (a.subAccountId !== t.subAccountId || (t.agencyId && a.agencyId !== t.agencyId) || !isLive(a)) {
    throw new MediaLibraryError("File not found", 404);
  }
  return a;
}

function titleOf(a: MediaAsset): string {
  return a.library?.title || a.bunny?.title || a.metadata?.originalFilename || "Untitled";
}

// ── usage ────────────────────────────────────────────────────────────────────

async function usageMap(t: Tenant, assets: MediaAsset[]): Promise<Map<string, MediaUsage[]>> {
  const db = getAdminDb();
  const out = new Map<string, MediaUsage[]>();
  const push = (id: string, u: MediaUsage) => out.set(id, [...(out.get(id) ?? []), u]);

  // Course lessons (the references the Bunny/course integration maintains).
  const courseIds = new Set<string>();
  for (const a of assets) for (const r of a.references ?? []) if (r.type === "course_lesson") courseIds.add(r.courseId);
  const courseTitles = new Map<string, string>();
  if (courseIds.size) {
    const snaps = await db.getAll(...[...courseIds].map((c) => db.doc(`subAccounts/${t.subAccountId}/standaloneCourses/${c}`)));
    snaps.forEach((s) => courseTitles.set(s.id, (s.data()?.title as string) || "Course"));
  }
  const lessonRefs = assets.flatMap((a) =>
    (a.references ?? []).filter((r) => r.type === "course_lesson").map((r) => ({ a, r }))
  );
  const lessonSnaps = lessonRefs.length
    ? await db.getAll(
        ...lessonRefs.map(({ r }) => db.doc(`subAccounts/${t.subAccountId}/standaloneCourses/${r.courseId}/lessons/${r.lessonId}`))
      )
    : [];
  lessonRefs.forEach(({ a, r }, i) =>
    push(a.id, {
      kind: "course_lesson",
      label: `Courses — ${courseTitles.get(r.courseId) ?? "Course"}`,
      detail: `Lesson: ${(lessonSnaps[i]?.data()?.title as string) || "Untitled lesson"}`,
      href: `/courses/${r.courseId}`,
    })
  );

  // Images an admin made public (pages / emails / course thumbnails embed the
  // public copy's URL — removing it would break them, so it counts as a use).
  for (const a of assets) {
    if (a.publicImage?.url) {
      push(a.id, { kind: "public_image", label: "Public image link", detail: "Used on pages, emails or course images", href: null });
    }
  }

  // Resource Library entries that point at a file.
  const resources = await db.collection("assets").where("subAccountId", "==", t.subAccountId).get();
  for (const r of resources.docs) {
    const id = r.data().mediaAssetId as string | undefined;
    if (id) push(id, { kind: "resource", label: "Resource Library", detail: (r.data().name as string) || "Resource", href: `/assets?tab=resources&resource=${r.id}` });
  }
  return out;
}

export async function usageOf(t: Tenant, asset: MediaAsset): Promise<MediaUsage[]> {
  return (await usageMap(t, [asset])).get(asset.id) ?? [];
}

// ── list / view ──────────────────────────────────────────────────────────────

async function signedThumb(a: MediaAsset): Promise<string | null> {
  if (kindOf(a) !== "image" || a.storage.provider !== "firebase") return null;
  try {
    return (await mediaStorageAdapter("firebase").createAuthorizedUrl({ key: a.storage.key, expiresInSeconds: 30 * 60 })).url;
  } catch {
    return null;
  }
}

async function toItems(t: Tenant, assets: MediaAsset[]): Promise<MediaLibraryItem[]> {
  const [usage, shares, names] = await Promise.all([
    usageMap(t, assets),
    listSharesForSubAccount(t.subAccountId),
    memberNames(t.subAccountId, assets.map((a) => a.uploadedByPersonId)),
  ]);
  return Promise.all(
    assets.map(async (a) => {
      const share = shares.find((s) => s.mediaAssetId === a.id) ?? null;
      const u = [...(usage.get(a.id) ?? [])];
      const shareV = share ? shareView(share) : null;
      if (shareV && shareV.status === "active" && !shareV.expired) {
        u.push({ kind: "replay_link", label: "Public replay link", detail: shareV.expiresAt ? `Expires ${shareV.expiresAt.slice(0, 10)}` : "No expiry", href: null });
      }
      return {
        id: a.id,
        kind: kindOf(a),
        mediaType: a.mediaType,
        provider: a.storage.provider,
        title: titleOf(a),
        filename: a.metadata?.originalFilename ?? null,
        mimeType: a.storage.mimeType,
        sizeBytes: a.bunny?.storageBytes ?? a.storage.fileSizeBytes ?? null,
        width: a.metadata?.width ?? a.bunny?.width ?? null,
        height: a.metadata?.height ?? a.bunny?.height ?? null,
        durationSeconds: a.bunny?.durationSeconds ?? (a.metadata?.durationMs ? Math.round(a.metadata.durationMs / 1000) : null),
        status: a.status,
        tags: a.library?.tags ?? [],
        createdAt: isoOf(a.createdAt),
        updatedAt: isoOf(a.updatedAt),
        uploadedByName: a.uploadedByPersonId ? names.get(a.uploadedByPersonId) ?? null : null,
        thumbnailUrl: await signedThumb(a),
        usage: u,
        share: shareV,
        publicUrl: a.publicImage?.url ?? null,
      } satisfies MediaLibraryItem;
    })
  );
}

export async function listMediaLibrary(t: Tenant, opts: { kind?: MediaLibraryKind; readyOnly?: boolean } = {}): Promise<MediaLibraryItem[]> {
  const snap = await col(t.subAccountId).get();
  const assets = snap.docs
    .filter((d) => d.id !== "__usage")
    .map(toAsset)
    .filter((a) => a.subAccountId === t.subAccountId && (!t.agencyId || a.agencyId === t.agencyId) && isLive(a))
    .filter((a) => !opts.kind || kindOf(a) === opts.kind)
    .filter((a) => !opts.readyOnly || a.status === "ready");
  const items = await toItems(t, assets);
  return items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function getMediaLibraryItem(t: Tenant, assetId: string): Promise<MediaLibraryItem> {
  const a = await loadTenantAsset(t, assetId);
  return (await toItems(t, [a]))[0];
}

// ── upload (images + documents) ──────────────────────────────────────────────

function safeExt(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}

export function classifyUpload(mimeType: string): "image" | "document" | null {
  if ((COMMUNITY_IMAGE_MIME_ALLOWLIST as readonly string[]).includes(mimeType)) return "image";
  if ((COMMUNITY_FILE_MIME_ALLOWLIST as readonly string[]).includes(mimeType)) return "document";
  return null;
}

/** Server-side validation shared by every Media Library upload path. */
export function validateLibraryUpload(mimeType: string, size: number): "image" | "document" {
  const kind = classifyUpload(mimeType);
  if (!kind) {
    throw new MediaLibraryError(
      mimeType.startsWith("video/")
        ? "Upload videos with “Upload video” — they're hosted on Bunny Stream."
        : "That file type isn't supported. Use an image (JPG, PNG, GIF, WebP) or a PDF, Word, Excel, PowerPoint, CSV or text file."
    );
  }
  const max = kind === "image" ? MEDIA_IMAGE_MAX_BYTES : MEDIA_DOCUMENT_MAX_BYTES;
  if (!Number.isFinite(size) || size <= 0) throw new MediaLibraryError("That file is empty.");
  if (size > max) throw new MediaLibraryError(`File is too large — keep ${kind === "image" ? "images" : "documents"} under ${Math.round(max / 1024 / 1024)} MB.`);
  return kind;
}

export function mediaBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new MediaLibraryError("File uploads aren't configured on this deployment.", 503);
  return bucketName;
}

/** Magic-byte check for images, so a renamed non-image can't be stored (or later published) as one. */
export function looksLikeImage(buf: Buffer, mimeType: string): boolean {
  const b = buf;
  switch (mimeType) {
    case "image/jpeg":
      return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return b.length > 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a");
    case "image/webp":
      return b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
    default:
      return true;
  }
}

/**
 * Store validated bytes as a private Media Library object + its canonical
 * MediaAsset. Used by the small-file form route AND the direct-upload
 * completion (which reads the bytes back from the private intake object).
 */
export async function storeLibraryFile(
  t: Tenant,
  uid: string,
  input: { bytes: Buffer; mimeType: string; filename: string; title?: string; assetRef?: FirebaseFirestore.DocumentReference }
): Promise<string> {
  const kind = validateLibraryUpload(input.mimeType, input.bytes.length);
  if (kind === "image" && !looksLikeImage(input.bytes, input.mimeType)) {
    throw new MediaLibraryError("That file isn't a valid image.");
  }
  const bucketName = mediaBucketName();
  const ref = input.assetRef ?? col(t.subAccountId).doc();
  const key = `media-library/${t.subAccountId}/${ref.id}/${randomUUID()}.${safeExt(input.filename || "", kind === "image" ? "img" : "bin")}`;
  await getStorage()
    .bucket(bucketName)
    .file(key)
    .save(input.bytes, {
      resumable: false,
      // No firebaseStorageDownloadTokens: the object is private; reads are signed URLs.
      metadata: { contentType: input.mimeType, metadata: { subAccountId: t.subAccountId, mediaAssetId: ref.id } },
    });
  await ref.set({
    agencyId: t.agencyId,
    subAccountId: t.subAccountId,
    ownerScope: tenantScope(t),
    uploadedByPersonId: uid,
    mediaType: kind,
    source: { type: "other", id: "media-library" },
    storage: { provider: "firebase", key, bucket: bucketName, mimeType: input.mimeType, fileSizeBytes: input.bytes.length },
    status: "ready",
    access: { type: "tenant" },
    metadata: { originalFilename: (input.filename || "").slice(0, 200) || null, durationMs: null, width: null, height: null },
    derivatives: {},
    library: { title: (input.title || input.filename || "Untitled").trim().slice(0, 200), tags: [], updatedByUid: uid },
    references: [],
    publicImage: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  return ref.id;
}

/** Small-file path (multipart through the app server — fine under the ~4.5 MB request cap). */
export async function uploadMediaFile(t: Tenant, uid: string, file: File, title?: string): Promise<MediaLibraryItem> {
  validateLibraryUpload(file.type, file.size);
  const id = await storeLibraryFile(t, uid, {
    bytes: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    filename: file.name || "",
    title,
  });
  return getMediaLibraryItem(t, id);
}

export function mediaCollection(subAccountId: string) {
  return col(subAccountId);
}

// ── open / edit / refresh / delete ───────────────────────────────────────────

/** Short-lived URL for a staff member of THIS sub-account: signed file URL, or a token-signed Bunny embed. */
export async function authorizedMediaUrl(
  t: Tenant,
  assetId: string,
  disposition: "inline" | "attachment" = "inline"
): Promise<{ url: string; expiresInSeconds: number; embed: boolean }> {
  const a = await loadTenantAsset(t, assetId);
  if (a.storage.provider === "bunny") {
    const url = await getBunnyPlaybackUrl(tenantScope(t), a.id);
    if (!url) throw new MediaLibraryError("This video is still processing.", 409);
    return { url, expiresInSeconds: 300, embed: true };
  }
  if (a.storage.provider === "external") throw new MediaLibraryError("External media has no stored file.", 409);
  const { url } = await mediaStorageAdapter(a.storage.provider).createAuthorizedUrl({ key: a.storage.key, disposition, expiresInSeconds: 15 * 60 });
  return { url, expiresInSeconds: 900, embed: false };
}

export async function updateMediaLibraryFields(t: Tenant, uid: string, assetId: string, patch: { title?: unknown; tags?: unknown }) {
  const a = await loadTenantAsset(t, assetId);
  const library = { ...(a.library ?? {}), updatedByUid: uid } as Record<string, unknown>;
  if (typeof patch.title === "string") {
    const title = patch.title.trim().slice(0, 200);
    if (!title) throw new MediaLibraryError("Give the file a name.");
    library.title = title;
  }
  if (Array.isArray(patch.tags)) {
    library.tags = [...new Set(patch.tags.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
  }
  await col(t.subAccountId).doc(a.id).set({ library, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getMediaLibraryItem(t, a.id);
}

/** Re-read a hosted video's processing state from Bunny (the existing sync). */
export async function refreshHostedVideo(t: Tenant, assetId: string) {
  const a = await loadTenantAsset(t, assetId);
  if (a.storage.provider !== "bunny") return getMediaLibraryItem(t, a.id);
  await syncBunnyHostedVideo(tenantScope(t), a.id);
  return getMediaLibraryItem(t, a.id);
}

/**
 * Delete order (Assets corrections, 2026-09-29): dependency check → provider
 * delete → soft delete → revoke replay links. A provider failure leaves the
 * record, its playback and every replay link exactly as they were; while
 * the Bunny delete is in flight no new playback token is issued
 * (see deleteBunnyHostedVideo).
 */
export async function deleteMediaLibraryAsset(t: Tenant, assetId: string, uid: string) {
  const a = await loadTenantAsset(t, assetId);
  const usage = (await usageOf(t, a)).filter((u) => u.kind !== "replay_link");
  if (usage.length) {
    const publicOnly = usage.every((u) => u.kind === "public_image");
    throw new MediaLibraryError(
      publicOnly
        ? "This image has a public link used on pages, emails or course images. Turn off the public link first — anything using it will lose the image."
        : `This file is still used in: ${usage.map((u) => `${u.label} (${u.detail})`).join("; ")}. Remove it there first.`,
      409
    );
  }
  if (a.storage.provider === "bunny") {
    try {
      await deleteBunnyHostedVideo(tenantScope(t), a.id);
    } catch (err) {
      throw new MediaLibraryError(
        `Bunny couldn't delete the video, so nothing was changed — replay links still work. ${err instanceof Error ? err.message : ""}`.trim(),
        502
      );
    }
  } else {
    if (a.storage.provider === "firebase" && a.source?.id === "media-library") {
      // Only objects the Media Library itself stored are removed; legacy
      // objects owned by other features are never deleted from here.
      await mediaStorageAdapter("firebase").deleteObject(a.storage.key);
    }
    await col(t.subAccountId).doc(a.id).set(
      { status: "deleted", deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  // After a confirmed delete. If this write fails the links are already dead
  // (resolveReplay refuses a deleted asset), so it's logged, not surfaced.
  await revokeSharesForAsset(t.subAccountId, a.id, uid).catch((err) =>
    console.error("[media-library] revoke after delete failed", a.id, err)
  );
}
