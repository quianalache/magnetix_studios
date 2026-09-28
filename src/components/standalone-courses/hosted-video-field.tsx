"use client";

import { useRef, useState } from "react";
import { FolderOpen, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPickerDialog } from "@/components/assets/media-picker-dialog";
import { uploadHostedVideo } from "@/lib/client/bunny-upload";
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

  const [pickerOpen, setPickerOpen] = useState(false);

  async function upload(file: File) {
    setMode("hosted"); setState("uploading"); setProgress(0); setError(null);
    try {
      // Same Bunny flow as before, now shared with the Media Library.
      const { assetId } = await uploadHostedVideo({
        ownerScope: props.ownerScope, file, title: props.title, courseId: props.courseId, lessonId: props.lessonId,
        onProgress: setProgress, onXhr: (xhr) => { xhrRef.current = xhr; },
      });
      setState("processing");
      props.onHostedVideoChange(assetId); setState("processing");
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
      {state === "idle" || state === "failed" ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm"><Upload className="h-4 w-4" /> Choose video<input type="file" accept="video/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
        {/* Reuse an existing hosted video instead of uploading it again (sub-account courses). */}
        {props.ownerScope.kind === "tenant" ? <button type="button" onClick={() => setPickerOpen(true)} className="flex items-center gap-2 text-sm hover:underline"><FolderOpen className="h-4 w-4" /> Choose from Media Library</button> : null}
      </div> : null}
      {state === "uploading" ? <div className="text-sm">Uploading {progress}%</div> : null}
      {state === "processing" ? <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Processing — save the lesson, then refresh when Bunny reports Ready.</div> : null}
      {state === "ready" ? <div className="text-sm text-emerald-600">Ready</div> : null}
      {error ? <div className="text-destructive text-xs">{error}</div> : null}
      {props.hostedVideoId ? <Button type="button" size="sm" variant="ghost" onClick={() => { props.onHostedVideoChange(null); setState("idle"); }}><X className="mr-1 h-4 w-4" /> Remove from lesson</Button> : null}
    </div> : <input className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm" value={props.externalUrl} onChange={(event) => props.onExternalUrlChange(event.target.value)} placeholder="https://youtube.com/watch?v=…" />}
    {props.ownerScope.kind === "tenant" ? (
      <MediaPickerDialog
        subAccountId={props.ownerScope.subAccountId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="video"
        title="Choose a video"
        description="Use a video you've already uploaded — no second copy is stored. Access still follows this course."
        onSelect={(item) => { setMode("hosted"); props.onHostedVideoChange(item.id); setState("ready"); setError(null); }}
      />
    ) : null}
  </div>;
}
