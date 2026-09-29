import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  MediaLibraryError,
  getMediaLibraryItem,
  mediaBucketName,
  mediaCollection,
  storeLibraryFile,
  validateLibraryUpload,
  type Tenant,
} from "@/lib/server/assets/media-library-service";
import type { MediaLibraryItem } from "@/types/media-library";

/**
 * Direct-to-storage uploads for the Media Library (Assets corrections,
 * 2026-09-29).
 *
 * Why: images (5 MB) and documents (15 MB) can exceed the app server's
 * request-body cap (~4.5 MB on Vercel), so they can't go through a
 * multipart API route. The browser uploads straight to Firebase Storage
 * with the Firebase client SDK — the same mechanism every other staff
 * upload in this codebase uses (broadcasts, pages, courses, community).
 *
 *   1. `createUploadIntake` (sub-account admin) validates type + size and
 *      writes a server-only `mediaUploadIntakes/{id}` record naming the
 *      exact object key: `media-uploads/{uid}/{intakeId}/{uuid}.{ext}`.
 *   2. The browser writes that object. storage.rules only allow CREATE,
 *      only into the caller's own `{uid}` folder, only up to the document
 *      cap and only for the allowed content types — never read, overwrite
 *      or delete. Nothing there is public or usable by itself.
 *   3. `completeUploadIntake` (same admin, same sub-account) re-validates
 *      the object the server actually finds (size + content type must
 *      match the intake; images must pass a magic-byte check), moves it to
 *      the private `media-library/{sa}/{assetId}/…` path WITHOUT a download
 *      token, creates the MediaAsset and deletes the intake object.
 *      Idempotent: a retried completion returns the same file.
 *
 * Tenancy never comes from the storage path: the intake record binds the
 * upload to one sub-account + uploader, and completion re-checks both.
 * Abandoned intakes are swept daily (api-cleanup cron).
 */

export const INTAKE_COLLECTION = "mediaUploadIntakes";
export const INTAKE_PREFIX = "media-uploads";
const INTAKE_TTL_MS = 60 * 60 * 1000; // an hour to finish the upload

interface IntakeDoc {
  agencyId: string;
  subAccountId: string;
  uid: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  title: string;
  kind: "image" | "document";
  status: "pending" | "completed" | "failed";
  mediaAssetId: string | null;
  createdAt: unknown;
  expiresAt: Timestamp;
}

function safeExt(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}

export async function createUploadIntake(
  t: Tenant,
  uid: string,
  input: { filename?: unknown; mimeType?: unknown; sizeBytes?: unknown; title?: unknown }
): Promise<{ intakeId: string; objectKey: string; bucket: string; expiresAt: string }> {
  const mimeType = typeof input.mimeType === "string" ? input.mimeType : "";
  const sizeBytes = typeof input.sizeBytes === "number" ? input.sizeBytes : Number.NaN;
  const filename = typeof input.filename === "string" ? input.filename.slice(0, 200) : "";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  const kind = validateLibraryUpload(mimeType, sizeBytes);
  const bucket = mediaBucketName();

  const ref = getAdminDb().collection(INTAKE_COLLECTION).doc();
  const objectKey = `${INTAKE_PREFIX}/${uid}/${ref.id}/${randomUUID()}.${safeExt(filename, kind === "image" ? "img" : "bin")}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + INTAKE_TTL_MS);
  const doc: IntakeDoc = {
    agencyId: t.agencyId,
    subAccountId: t.subAccountId,
    uid,
    objectKey,
    mimeType,
    sizeBytes,
    filename,
    title,
    kind,
    status: "pending",
    mediaAssetId: null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  };
  await ref.set(doc);
  return { intakeId: ref.id, objectKey, bucket, expiresAt: expiresAt.toDate().toISOString() };
}

async function loadIntake(t: Tenant, uid: string, intakeId: string) {
  if (!intakeId || intakeId.includes("/")) throw new MediaLibraryError("Upload not found", 404);
  const ref = getAdminDb().collection(INTAKE_COLLECTION).doc(intakeId);
  const snap = await ref.get();
  const intake = snap.data() as IntakeDoc | undefined;
  // Another sub-account's or another person's intake reads as missing.
  if (!intake || intake.subAccountId !== t.subAccountId || intake.agencyId !== t.agencyId || intake.uid !== uid) {
    throw new MediaLibraryError("Upload not found", 404);
  }
  return { ref, intake };
}

export async function completeUploadIntake(t: Tenant, uid: string, intakeId: string): Promise<MediaLibraryItem> {
  const { ref, intake } = await loadIntake(t, uid, intakeId);
  if (intake.status === "completed" && intake.mediaAssetId) return getMediaLibraryItem(t, intake.mediaAssetId);
  if (intake.status !== "pending") throw new MediaLibraryError("This upload can't be completed — try again.", 409);
  if (intake.expiresAt.toMillis() <= Date.now()) throw new MediaLibraryError("This upload expired — try again.", 410);

  const file = getStorage().bucket(mediaBucketName()).file(intake.objectKey);
  const [exists] = await file.exists();
  if (!exists) throw new MediaLibraryError("The file hasn't finished uploading.", 409);

  // Claim the intake so two concurrent completions can't both create a file.
  const assetRef = mediaCollection(t.subAccountId).doc();
  const claimed = await getAdminDb().runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as IntakeDoc | undefined;
    if (!fresh || fresh.status !== "pending") return fresh?.mediaAssetId ?? null;
    tx.update(ref, { status: "completed", mediaAssetId: assetRef.id, completedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (claimed !== true) {
    if (typeof claimed === "string") return getMediaLibraryItem(t, claimed);
    throw new MediaLibraryError("This upload can't be completed — try again.", 409);
  }

  try {
    const [meta] = await file.getMetadata();
    const size = Number(meta.size);
    if (size !== intake.sizeBytes || meta.contentType !== intake.mimeType) {
      throw new MediaLibraryError("The uploaded file doesn't match what was expected — try again.");
    }
    const [bytes] = await file.download();
    await storeLibraryFile(t, uid, {
      bytes,
      mimeType: intake.mimeType,
      filename: intake.filename,
      title: intake.title || undefined,
      assetRef,
    });
  } catch (err) {
    await ref.update({ status: "failed", mediaAssetId: null, failedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw err instanceof MediaLibraryError ? err : new MediaLibraryError("Couldn't save the upload — try again.", 500);
  }
  await file.delete({ ignoreNotFound: true }).catch(() => undefined);
  return getMediaLibraryItem(t, assetRef.id);
}

/** Daily sweep: delete expired intake records + any object still sitting in the intake area. */
export async function sweepExpiredUploadIntakes(limit = 200): Promise<{ deleted: number; hitCap: boolean }> {
  const db = getAdminDb();
  const snap = await db
    .collection(INTAKE_COLLECTION)
    .where("expiresAt", "<", Timestamp.fromMillis(Date.now() - INTAKE_TTL_MS))
    .limit(limit)
    .get();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  for (const d of snap.docs) {
    const intake = d.data() as IntakeDoc;
    if (bucketName && intake.objectKey?.startsWith(`${INTAKE_PREFIX}/`)) {
      await getStorage().bucket(bucketName).file(intake.objectKey).delete({ ignoreNotFound: true }).catch(() => undefined);
    }
    await d.ref.delete();
  }
  return { deleted: snap.size, hitCap: snap.size >= limit };
}
