import type { FileAttachment } from "@/types/media-attachment";

/**
 * The shared Community post file upload path — member-session
 * authenticated on the server. Mirrors uploadCommunityPostImage's shape
 * exactly.
 */
export async function uploadCommunityPostFile(opts: {
  saId: string;
  file: File;
}): Promise<FileAttachment> {
  const form = new FormData();
  form.append("file", opts.file);

  const res = await fetch(`/api/community/${opts.saId}/community-files`, {
    method: "POST",
    body: form,
  });
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
export async function deleteCommunityPostFile(saId: string, storagePath: string): Promise<void> {
  const res = await fetch(`/api/community/${saId}/community-files`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Couldn't delete file");
  }
}
