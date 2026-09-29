import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  MediaLibraryError,
  classifyUpload,
  kindOf,
  loadTenantAsset,
  looksLikeImage,
  mediaBucketName,
  mediaCollection,
  type Tenant,
} from "@/lib/server/assets/media-library-service";
import type { MediaAsset } from "@/types/media-asset";

/**
 * Public delivery of Media Library IMAGES (Assets corrections, 2026-09-29).
 *
 * Pages, broadcast emails and course/offer thumbnails need a URL anyone can
 * load (an email client, an anonymous visitor). The Media Library original
 * stays PRIVATE: "Use from Media Library" in those editors asks an admin to
 * publish a separate public COPY of that one image —
 * `media-public/{sa}/{assetId}/{uuid}.{ext}` with a Firebase download token
 * (the same public-URL model every existing page/email/course upload
 * already uses). Nothing else about the asset changes:
 *
 *  - Only ready, firebase-stored images that pass a magic-byte check are
 *    publishable. Documents, videos and external media never are.
 *  - Publishing requires a sub-account ADMIN. Any member may reuse an image
 *    that is already public (its URL is public anyway); a collaborator
 *    picking a private image is refused with "ask an admin".
 *  - Using the image in a CRM Resource or elsewhere privately never reads
 *    this copy — private uses keep going through signed URLs.
 *  - One public copy per image, reused by every public consumer (no
 *    duplicate uploads). While it exists, deleting the image is refused
 *    (it's listed as a use); turning the public link off deletes the copy,
 *    which breaks the image wherever it was embedded — the UI says so.
 */

function publicDownloadUrl(bucket: string, key: string, token: string) {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const base = host ? `http://${host}` : "https://firebasestorage.googleapis.com";
  return `${base}/v0/b/${bucket}/o/${encodeURIComponent(key)}?alt=media&token=${token}`;
}

function assertPublishable(a: MediaAsset) {
  if (kindOf(a) !== "image" || classifyUpload(a.storage.mimeType) !== "image") {
    throw new MediaLibraryError("Only images can be made public.", 400);
  }
  if (a.storage.provider !== "firebase" || !a.storage.key) {
    throw new MediaLibraryError("This image isn't stored in the Media Library.", 400);
  }
  if (a.status !== "ready") throw new MediaLibraryError("This image isn't ready yet.", 409);
}

/**
 * Return the public URL for an image, creating the public copy when the
 * caller is an admin. `isAdmin` comes from the route's tenancy check.
 */
export async function ensurePublicImage(
  t: Tenant,
  uid: string,
  assetId: string,
  isAdmin: boolean
): Promise<{ url: string; created: boolean }> {
  const a = await loadTenantAsset(t, assetId);
  assertPublishable(a);
  if (a.publicImage?.url) return { url: a.publicImage.url, created: false };
  if (!isAdmin) {
    throw new MediaLibraryError("This image is private. Ask a sub-account admin to make it public for use on pages and emails.", 403);
  }

  const bucketName = mediaBucketName();
  const bucket = getStorage().bucket(bucketName);
  const [bytes] = await bucket.file(a.storage.key).download();
  if (!looksLikeImage(bytes, a.storage.mimeType)) throw new MediaLibraryError("That file isn't a valid image.", 400);
  const ext = (a.storage.key.split(".").pop() || "img").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "img";
  const key = `media-public/${t.subAccountId}/${a.id}/${randomUUID()}.${ext}`;
  const token = randomUUID();
  await bucket.file(key).save(bytes, {
    resumable: false,
    metadata: {
      contentType: a.storage.mimeType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: { firebaseStorageDownloadTokens: token, subAccountId: t.subAccountId, mediaAssetId: a.id },
    },
  });
  const url = publicDownloadUrl(bucketName, key, token);

  // Two admins publishing at once: first write wins, the loser's copy is removed.
  const ref = mediaCollection(t.subAccountId).doc(a.id);
  const winner = await ref.firestore.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as MediaAsset | undefined;
    if (!fresh || fresh.status === "deleted" || fresh.deletedAt) return { url: null as string | null };
    if (fresh.publicImage?.url) return { url: fresh.publicImage.url };
    tx.update(ref, {
      publicImage: { key, url, publishedAt: FieldValue.serverTimestamp(), publishedByUid: uid },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { url };
  });
  if (winner.url !== url) {
    await bucket.file(key).delete({ ignoreNotFound: true }).catch(() => undefined);
    if (!winner.url) throw new MediaLibraryError("File not found", 404);
    return { url: winner.url, created: false };
  }
  return { url, created: true };
}

/** Admin: turn the public link off — deletes the public copy. The private original is untouched. */
export async function removePublicImage(t: Tenant, assetId: string): Promise<void> {
  const a = await loadTenantAsset(t, assetId);
  const pub = a.publicImage;
  if (!pub?.key) return;
  if (!pub.key.startsWith(`media-public/${t.subAccountId}/${a.id}/`)) {
    throw new MediaLibraryError("Unexpected public image location.", 409);
  }
  await getStorage().bucket(mediaBucketName()).file(pub.key).delete({ ignoreNotFound: true });
  await mediaCollection(t.subAccountId).doc(a.id).update({ publicImage: null, updatedAt: FieldValue.serverTimestamp() });
}
