import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";

/** Inline image upload for the Content Library's rich-text description
 *  fields. Sibling of the other `uploadXImage` helpers in this codebase
 *  (e.g. src/lib/qr-codes/upload-logo.ts). */

export const MAX_CONTENT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadContentImage(
  file: File,
  saId: string,
  docId: string,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_CONTENT_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `content-library/${saId}/${docId}/image-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
