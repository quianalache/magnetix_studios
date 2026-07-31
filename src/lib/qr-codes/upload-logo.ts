import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";

/**
 * Upload an optional logo for a QR code's center. Sibling of
 * `uploadBroadcastImage` (src/lib/broadcasts/upload-image.ts) — same
 * validation, independent path.
 */

export const MAX_QR_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB — small, centered image

export async function uploadQrLogo(
  file: File,
  saId: string,
  qrId: string,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_QR_LOGO_BYTES) {
    throw new Error("Logo is too large — keep it under 2 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `qr-codes/${saId}/${qrId}/logo-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
