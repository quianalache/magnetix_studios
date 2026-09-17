import type { FileAttachment } from "@/types/media-attachment";

/**
 * The shared Community post file upload path — member-session
 * authenticated on the server. Mirrors uploadCommunityPostImage's shape
 * exactly.
 */
export async function uploadCommunityPostFile(opts: {
  saId: string;
  agencyGroupId?: string;
  file: File;
}): Promise<FileAttachment> {
  const form = new FormData();
  form.append("file", opts.file);

  const url = opts.agencyGroupId
    ? `/api/agency/community/${opts.agencyGroupId}/post-files`
    : `/api/community/${opts.saId}/community-files`;
  const res = await fetch(url, { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    file?: FileAttachment;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.file) {
    throw new Error(data.error ?? "Upload failed");
  }
  return data.file;
}

/** Deletes the underlying Storage object for a file the caller owns. */
export async function deleteCommunityPostFile(
  saId: string,
  storagePath: string,
  agencyGroupId?: string,
): Promise<void> {
  const url = agencyGroupId
    ? `/api/agency/community/${agencyGroupId}/post-files`
    : `/api/community/${saId}/community-files`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Couldn't delete file");
  }
}
