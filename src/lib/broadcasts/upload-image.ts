import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";

/**
 * Upload a broadcast composer image (Image block or Video block thumbnail)
 * to Firebase Storage and return its public download URL. Sibling of
 * `uploadCommunityImage` (src/lib/community/upload-image.ts) — same
 * validation, independent path.
 *
 * Path: `broadcasts/{saId}/{draftId}/{kind}-{timestamp}.{ext}` — `draftId`
 * is a `crypto.randomUUID()` generated once when the composer mounts, purely
 * for namespacing (no cleanup job for abandoned drafts' uploads, matching
 * the existing gap for community/course uploads).
 */

export const MAX_BROADCAST_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadBroadcastImage(
  file: File,
  saId: string,
  draftId: string,
  kind: "image" | "video-thumbnail",
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_BROADCAST_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `broadcasts/${saId}/${draftId}/${kind}-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
