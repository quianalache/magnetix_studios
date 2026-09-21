"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoOwnerScope } from "@/types/media-asset";

type UploadState = "idle" | "uploading" | "processing" | "ready" | "failed";

export function HostedVideoField(props: {
  ownerScope: VideoOwnerScope;
  title: string;
  courseId: string;
  lessonId: string;
  hostedVideoId: string | null;
  onHostedVideoChange: (id: string | null) => void;
  externalUrl: string;
  onExternalUrlChange: (url: string) => void;
}) {
  const [mode, setMode] = useState<"hosted" | "external">(props.hostedVideoId ? "hosted" : "external");
  const [state, setState] = useState<UploadState>(props.hostedVideoId ? "ready" : "idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  function chooseMode(next: "hosted" | "external") {
    setMode(next);
    setError(null);
    if (next === "external") props.onHostedVideoChange(null);
  }

  async function upload(file: File) {
    setMode("hosted"); setState("uploading"); setProgress(0); setError(null);
    try {
      const initResponse = await fetch("/api/media/hosted-videos/upload-init", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerScope: props.ownerScope, title: props.title, filename: file.name, mimeType: file.type || "video/mp4", sizeBytes: file.size, courseId: props.courseId, lessonId: props.lessonId }),
      });
      if (!initResponse.ok) throw new Error("Unable to start Bunny upload");
      const init = await initResponse.json() as { assetId: string; uploadUrl: string; videoGuid: string; libraryId: string; authorizationSignature: string; authorizationExpire: number };
      const tusHeaders = { "Tus-Resumable": "1.0.0", "Upload-Length": String(file.size), AuthorizationSignature: init.authorizationSignature, AuthorizationExpire: String(init.authorizationExpire), VideoId: init.videoGuid, LibraryId: init.libraryId };
      const create = await fetch(init.uploadUrl, { method: "POST", headers: { ...tusHeaders, "Upload-Metadata": `filename ${btoa(file.name)},filetype ${btoa(file.type || "video/mp4")}` } });
      if (!create.ok) throw new Error(`Bunny upload session failed (${create.status})`);
      const location = create.headers.get("Location");
      if (!location) throw new Error("Bunny did not return a resumable upload location");
      const uploadUrl = new URL(location, init.uploadUrl).toString();
      const chunkSize = 5 * 1024 * 1024;
      let offset = 0;
      while (offset < file.size) {
        const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
        const start = offset;
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest(); xhrRef.current = xhr;
          xhr.open("PATCH", uploadUrl);
          xhr.setRequestHeader("Tus-Resumable", "1.0.0"); xhr.setRequestHeader("Upload-Offset", String(start)); xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
          xhr.setRequestHeader("AuthorizationSignature", init.authorizationSignature); xhr.setRequestHeader("AuthorizationExpire", String(init.authorizationExpire)); xhr.setRequestHeader("VideoId", init.videoGuid); xhr.setRequestHeader("LibraryId", init.libraryId);
          xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(((start + event.loaded) / file.size) * 100)); };
          xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Bunny upload failed (${xhr.status})`)); xhr.onerror = () => reject(new Error("Bunny upload failed")); xhr.send(chunk);
        });
        offset += chunk.size;
      }
      setState("processing");
      const finalize = await fetch(`/api/media/hosted-videos/${init.assetId}/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerScope: props.ownerScope }) });
      if (!finalize.ok) throw new Error("Upload finished but could not be finalized");
      props.onHostedVideoChange(init.assetId); setState("processing");
    } catch (uploadError) {
      setState("failed"); setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally { xhrRef.current = null; }
  }

  return <div className="space-y-3 rounded-lg border p-3">
    <div className="text-sm font-medium">Video source</div>
    <div className="flex gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" checked={mode === "hosted"} onChange={() => chooseMode("hosted")} /> Upload to Magnetix</label>
      <label className="flex items-center gap-2"><input type="radio" checked={mode === "external"} onChange={() => chooseMode("external")} /> External video URL</label>
    </div>
    {mode === "hosted" ? <div className="space-y-2">
      {state === "idle" || state === "failed" ? <label className="flex cursor-pointer items-center gap-2 text-sm"><Upload className="h-4 w-4" /> Choose video<input type="file" accept="video/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label> : null}
      {state === "uploading" ? <div className="text-sm">Uploading {progress}%</div> : null}
      {state === "processing" ? <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Processing — save the lesson, then refresh when Bunny reports Ready.</div> : null}
      {state === "ready" ? <div className="text-sm text-emerald-600">Ready</div> : null}
      {error ? <div className="text-destructive text-xs">{error}</div> : null}
      {props.hostedVideoId ? <Button type="button" size="sm" variant="ghost" onClick={() => { props.onHostedVideoChange(null); setState("idle"); }}><X className="mr-1 h-4 w-4" /> Remove from lesson</Button> : null}
    </div> : <input className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm" value={props.externalUrl} onChange={(event) => props.onExternalUrlChange(event.target.value)} placeholder="https://youtube.com/watch?v=…" />}
  </div>;
}
