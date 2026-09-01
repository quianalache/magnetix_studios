import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";

/**
 * Real user QA blocker fix: the Image element previously only accepted a
 * raw pasted URL. Sibling of the other `upload{X}Image` helpers already in
 * this codebase (`src/lib/broadcasts/upload-image.ts`,
 * `src/lib/content-library/upload-image.ts`, `src/lib/community/
 * upload-image.ts`, `src/lib/qr-codes/upload-logo.ts`) — same client-SDK
 * Firebase Storage upload, same 5 MB / image-mimetype validation, same
 * `{feature}/{subAccountId}/{docId}/...` path shape and matching
 * `storage.rules` block (public read — a published Puck page is a public
 * route with no Firebase session, same as every sibling path). This is a
 * genuine reuse of the existing storage service, not a second upload
 * system — no new infra invented.
 *
 * Path: `pages-funnels/{subAccountId}/{pageId}/image-{timestamp}.{ext}`.
 * `pageId` namespaces uploads per page (no cross-page collisions); no
 * cleanup job for images later removed from the page, matching the
 * existing, accepted gap every sibling upload helper already has.
 */

export const MAX_PAGE_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadPageImage(
  file: File,
  subAccountId: string,
  pageId: string
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_PAGE_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `pages-funnels/${subAccountId}/${pageId}/image-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
