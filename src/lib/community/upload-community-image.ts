import type { ImageAttachment } from "@/types/media-attachment";

/** Reads a File's pixel dimensions in-browser via a throwaway <img> —
 *  no dependency, no upload round-trip needed just to know this. Best
 *  effort: returns null if decoding fails for any reason (still uploads
 *  fine, just without the aspect-ratio hint). */
function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * The shared Community post image upload path — member-session
 * authenticated on the server (see the route for why: members have no
 * Firebase Auth). Mirrors uploadVoiceNote's shape exactly.
 *
 * Agency Community (2026-09-17) — pass `agencyGroupId` to target the
 * agency-scoped upload route/Storage path instead of the tenant one; same
 * function, same UI, no separate uploader (see
 * /api/agency/community/[groupId]/post-images).
 */
export async function uploadCommunityPostImage(opts: {
  saId: string;
  agencyGroupId?: string;
  file: File;
}): Promise<ImageAttachment> {
  const dims = await readImageDimensions(opts.file);
  const form = new FormData();
  form.append("file", opts.file);
  if (dims) {
    form.append("width", String(dims.width));
    form.append("height", String(dims.height));
  }

  const url = opts.agencyGroupId
    ? `/api/agency/community/${opts.agencyGroupId}/post-images`
    : `/api/community/${opts.saId}/community-images`;
  const res = await fetch(url, { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    image?: ImageAttachment;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.image) {
    throw new Error(data.error ?? "Upload failed");
  }
  return data.image;
}

/** Deletes the underlying Storage object for an image the caller owns
 *  (server re-verifies the storagePath belongs to the requesting
 *  member). Used both for draft-removal (before a post is ever created)
 *  and, indirectly via the server, for post-deletion cleanup. */
export async function deleteCommunityPostImage(
  saId: string,
  storagePath: string,
  agencyGroupId?: string,
): Promise<void> {
  const url = agencyGroupId
    ? `/api/agency/community/${agencyGroupId}/post-images`
    : `/api/community/${saId}/community-images`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Couldn't delete image");
  }
}
