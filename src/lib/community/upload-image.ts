import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";

/**
 * Upload a community image (group cover / logo) to Firebase Storage and return
 * its public download URL. Client-side: staff are Firebase-authed, so the
 * Storage rules (authenticated write to `community/**`, public read) apply.
 * Members never upload — they have no Firebase auth.
 *
 * Path: `community/{saId}/{groupId}/{kind}-{timestamp}.{ext}` — the timestamp
 * busts the old image from CDN caches when an admin replaces it.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadCommunityImage(
  file: File,
  saId: string,
  groupId: string,
  kind: "cover" | "card" | "logo" | "course",
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `community/${saId}/${groupId}/${kind}-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

/**
 * Standalone-course sibling of `uploadCommunityImage` — same validation +
 * behavior, different Storage path (`standalone-courses/{saId}/{courseId}/
 * {kind}-{timestamp}.{ext}`) since standalone courses have no groupId.
 */
export async function uploadStandaloneCourseImage(
  file: File,
  saId: string,
  courseId: string,
  kind: "cover" | "lesson",
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `standalone-courses/${saId}/${courseId}/${kind}-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

/**
 * Course-theme sibling — Hero background, block images (image/custom
 * blocks), Progress promo image, Instructor headshot. Same Storage path
 * prefix as `uploadStandaloneCourseImage` (already permitted by
 * `storage.rules`), just a distinct `kind` label per theme surface.
 */
/**
 * Course Offer thumbnail — same validation + behavior, independent Storage
 * path (`course-offers/{saId}/{offerId}/thumbnail-{timestamp}.{ext}`).
 */
export async function uploadCourseOfferImage(
  file: File,
  saId: string,
  offerId: string,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `course-offers/${saId}/${offerId}/thumbnail-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

export async function uploadCourseThemeImage(
  file: File,
  saId: string,
  courseId: string,
  kind: "hero" | "block" | "progress-promo" | "instructor-headshot",
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `standalone-courses/${saId}/${courseId}/theme-${kind}-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
