"use client";

import type { VideoOwnerScope } from "@/types/media-asset";

/**
 * The existing Bunny Stream hosted-video upload, shared by the course lesson
 * field and the Media Library (moved here unchanged from
 * hosted-video-field.tsx): server upload-init → resumable TUS PATCH chunks
 * straight to Bunny with the server-issued signature → server finalize
 * (status sync). Bunny API keys never reach the browser.
 */
export async function uploadHostedVideo(opts: {
  ownerScope: VideoOwnerScope;
  file: File;
  title: string;
  courseId?: string;
  lessonId?: string;
  onProgress?: (percent: number) => void;
  onXhr?: (xhr: XMLHttpRequest | null) => void;
}): Promise<{ assetId: string }> {
  const { file } = opts;
  const initResponse = await fetch("/api/media/hosted-videos/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerScope: opts.ownerScope,
      title: opts.title,
      filename: file.name,
      mimeType: file.type || "video/mp4",
      sizeBytes: file.size,
      ...(opts.courseId ? { courseId: opts.courseId } : {}),
      ...(opts.lessonId ? { lessonId: opts.lessonId } : {}),
    }),
  });
  if (!initResponse.ok) throw new Error("Unable to start Bunny upload");
  const init = (await initResponse.json()) as {
    assetId: string;
    uploadUrl: string;
    videoGuid: string;
    libraryId: string;
    authorizationSignature: string;
    authorizationExpire: number;
  };
  const tusHeaders = {
    "Tus-Resumable": "1.0.0",
    "Upload-Length": String(file.size),
    AuthorizationSignature: init.authorizationSignature,
    AuthorizationExpire: String(init.authorizationExpire),
    VideoId: init.videoGuid,
    LibraryId: init.libraryId,
  };
  const create = await fetch(init.uploadUrl, {
    method: "POST",
    headers: { ...tusHeaders, "Upload-Metadata": `filename ${btoa(file.name)},filetype ${btoa(file.type || "video/mp4")}` },
  });
  if (!create.ok) throw new Error(`Bunny upload session failed (${create.status})`);
  const location = create.headers.get("Location");
  if (!location) throw new Error("Bunny did not return a resumable upload location");
  const uploadUrl = new URL(location, init.uploadUrl).toString();
  const chunkSize = 5 * 1024 * 1024;
  let offset = 0;
  try {
    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const start = offset;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        opts.onXhr?.(xhr);
        xhr.open("PATCH", uploadUrl);
        xhr.setRequestHeader("Tus-Resumable", "1.0.0");
        xhr.setRequestHeader("Upload-Offset", String(start));
        xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
        xhr.setRequestHeader("AuthorizationSignature", init.authorizationSignature);
        xhr.setRequestHeader("AuthorizationExpire", String(init.authorizationExpire));
        xhr.setRequestHeader("VideoId", init.videoGuid);
        xhr.setRequestHeader("LibraryId", init.libraryId);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) opts.onProgress?.(Math.round(((start + event.loaded) / file.size) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Bunny upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Bunny upload failed"));
        xhr.send(chunk);
      });
      offset += chunk.size;
    }
  } finally {
    opts.onXhr?.(null);
  }
  const finalize = await fetch(`/api/media/hosted-videos/${init.assetId}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerScope: opts.ownerScope }),
  });
  if (!finalize.ok) throw new Error("Upload finished but could not be finalized");
  return { assetId: init.assetId };
}
