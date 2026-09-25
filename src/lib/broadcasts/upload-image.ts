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
 * Path: `broadcasts/{subAccountId}/{draftId}/{kind}-{timestamp}.{ext}` —
 * `draftId` is a `crypto.randomUUID()` generated once when the composer
 * mounts, purely for namespacing (no cleanup job for abandoned drafts'
 * uploads, matching the existing gap for community/course uploads).
 */

export const MAX_BROADCAST_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Discriminated scope for every caller of `uploadBroadcastImage` (Shared
 * Email Builder scope-model hardening, 2026-09-20). Replaces an earlier
 * `saId: string` parameter that meant a real `subAccountId` for Tenant but
 * the literal sentinel string `"agency"` for Agency — a read-only audit
 * traced that sentinel end-to-end and found it harmless (the Agency branch
 * below never builds a `subAccounts/{saId}`-shaped path; it dispatches to a
 * separate Admin-SDK route that re-derives the real agencyId from verified
 * auth claims regardless of what the client sends), but it was still a
 * stringly-typed dispatch flag masquerading as a tenant id.
 *
 * Defined here (the lowest-level consumer, no dependency on any UI
 * component) rather than in a component file, so every layer that needs it
 * — this module, `block-editors.tsx`, `inspector-panel.tsx`,
 * `email-builder.tsx` — can import it without a type-level import cycle.
 * `email-builder.tsx` re-exports it so the public import path for builder
 * consumers stays `@/components/email-authoring/builder/email-builder`.
 *
 * Client-side type safety / dispatch ONLY: `agencyId` here is never trusted
 * for authorization or Storage ownership — `uploadAgencyBroadcastImage`
 * below doesn't even use it; the server route re-derives the real agencyId
 * from verified auth claims independently of anything the client sends.
 */
export type EmailBuilderScope =
  | { kind: "tenant"; subAccountId: string }
  | { kind: "agency"; agencyId: string };

export async function uploadBroadcastImage(
  file: File,
  scope: EmailBuilderScope,
  draftId: string,
  kind: "image" | "video-thumbnail",
): Promise<string> {
  // Agency Communications reuses this exact function (see its callers in
  // block-editors.tsx/email-blocks-editor.tsx) — the Agency branch never
  // touches the direct-client-Storage-write path below at all; it always
  // dispatches to a separate Admin-SDK route instead (the agency owner has
  // no client-writable Storage path here).
  if (scope.kind === "agency") return uploadAgencyBroadcastImage(file, draftId, kind);
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP, or GIF).");
  }
  if (file.size > MAX_BROADCAST_IMAGE_BYTES) {
    throw new Error("Image is too large — keep it under 5 MB.");
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "img";
  const path = `broadcasts/${scope.subAccountId}/${draftId}/${kind}-${Date.now()}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

async function uploadAgencyBroadcastImage(
  file: File,
  draftId: string,
  kind: "image" | "video-thumbnail",
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  form.append("draftId", draftId);
  const res = await fetch("/api/agency/communications/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !data.ok || !data.url) throw new Error(data.error ?? "Upload failed");
  return data.url;
}
