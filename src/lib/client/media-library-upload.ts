"use client";

import { ref, uploadBytesResumable } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";
import type { MediaLibraryItem } from "@/types/media-library";

/**
 * Upload an image or document to the Media Library (Assets corrections,
 * 2026-09-29). The bytes go browser → Firebase Storage directly (resumable,
 * the same client SDK every other staff upload uses), so files larger than
 * the app server's ~4.5 MB request cap work: the server only issues the
 * intake (validated type + size) and then validates + stores the result.
 *
 * Fallback: if Storage refuses the write (e.g. the storage rules for the
 * intake folder aren't deployed yet) a file small enough for the app server
 * is sent through the original multipart route instead.
 */

const SERVER_ROUTE_MAX_BYTES = 4 * 1024 * 1024;

async function json<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

async function viaServerRoute(subAccountId: string, file: File, title?: string): Promise<MediaLibraryItem> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const res = await fetch(`/api/sub-accounts/${subAccountId}/media-library`, { method: "POST", body: form });
  const body = await json<{ item?: MediaLibraryItem }>(res);
  if (!res.ok || !body.item) throw new Error(body.error ?? `Couldn't upload ${file.name}`);
  return body.item;
}

export async function uploadToMediaLibrary(
  subAccountId: string,
  file: File,
  opts: { title?: string; onProgress?: (fraction: number) => void } = {}
): Promise<MediaLibraryItem> {
  const base = `/api/sub-accounts/${subAccountId}/media-library/uploads`;
  const startRes = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, title: opts.title }),
  });
  const intake = await json<{ intakeId?: string; objectKey?: string }>(startRes);
  if (!startRes.ok || !intake.intakeId || !intake.objectKey) throw new Error(intake.error ?? `Couldn't upload ${file.name}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(ref(getFirebaseStorage(), intake.objectKey!), file, { contentType: file.type });
      task.on(
        "state_changed",
        (s) => opts.onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
        reject,
        () => resolve()
      );
    });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "storage/unauthorized" && file.size <= SERVER_ROUTE_MAX_BYTES) {
      return viaServerRoute(subAccountId, file, opts.title);
    }
    throw new Error(code === "storage/unauthorized" ? "Large uploads aren't enabled on this deployment yet (storage rules)." : `Couldn't upload ${file.name}`);
  }

  const doneRes = await fetch(`${base}/${intake.intakeId}/complete`, { method: "POST" });
  const done = await json<{ item?: MediaLibraryItem }>(doneRes);
  if (!doneRes.ok || !done.item) throw new Error(done.error ?? `Couldn't upload ${file.name}`);
  return done.item;
}
