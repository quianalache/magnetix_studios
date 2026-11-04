"use client";

import { useRef, useState } from "react";
import { AudioLines, Film, FolderOpen, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/system/confirm-dialog";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { MediaPickerDialog } from "@/components/assets/media-picker-dialog";
import { assetsCall } from "@/lib/client/assets-api";
import { uploadToMediaLibrary } from "@/lib/client/media-library-upload";
import { normalizeMediaVideo, type MediaVideoRef } from "@/lib/pages-funnels/puck/media-video";
import { AUDIO_MIME_TYPES, safeAudioSrc } from "@/lib/pages-funnels/audio";
import type { MediaLibraryItem } from "@/types/media-library";

/**
 * Video block → "Media Library video" (Wave 3). Picking a hosted video asks
 * for confirmation, because a protected video becomes watchable by anyone
 * who opens the published page. The block stores the asset id; playback URLs
 * are minted per visit. Clearing it falls back to the block's link.
 */
export function MediaVideoField({ value, onChange }: { value: unknown; onChange: (v: MediaVideoRef | null) => void }) {
  const sub = useOptionalSubAccount();
  const [open, setOpen] = useState(false);
  const { confirm, dialog } = useConfirm();
  const current = normalizeMediaVideo(value);
  return (
    <div className="space-y-2" data-media-video-field="">
      <Label className="text-xs font-semibold">Media Library video</Label>
      {current ? (
        <div className="border-border bg-muted flex items-center gap-2 rounded-md border p-1.5">
          <Film className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs">{current.title || "Hosted video"}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button>
        </div>
      ) : null}
      <Button type="button" variant="outline" size="sm" className="w-full" disabled={!sub?.subAccountId} onClick={() => setOpen(true)}>
        <FolderOpen className="h-3.5 w-3.5" /> {current ? "Choose a different video" : "Choose from Media Library"}
      </Button>
      <p className="text-muted-foreground text-caption">A Media Library video replaces the Video URL above. Upload videos in Assets → Media Library.</p>
      {sub?.subAccountId ? (
        <MediaPickerDialog
          subAccountId={sub.subAccountId}
          open={open}
          onOpenChange={setOpen}
          kind="video"
          title="Choose a video"
          description="Ready hosted videos from your Media Library."
          onSelect={async (item) => {
            setOpen(false);
            const ok = await confirm({
              title: "Show this video on your page?",
              description: "Your Media Library videos are private. Once this page is published, anyone who opens it can watch this video.",
              confirmLabel: "Use video",
            });
            if (ok) onChange({ assetId: item.id, title: item.title });
          }}
        />
      ) : null}
      {dialog}
    </div>
  );
}

/**
 * Audio block source (Wave 3): upload an audio file to the Media Library, or
 * pick one there; either way the file gets ONE explicit public copy (the
 * same "make public" step images use) whose URL the block plays. A direct
 * https link to an audio file also works (Advanced).
 */
export function AudioSourceField({
  value,
  onChange,
}: {
  value: { src?: string; mediaAssetId?: string } | undefined;
  onChange: (v: { src: string; mediaAssetId: string }) => void;
}) {
  const sub = useOptionalSubAccount();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const { confirm, dialog } = useConfirm();
  const src = value?.src ?? "";
  const subAccountId = sub?.subAccountId;

  async function makePublic(item: MediaLibraryItem) {
    if (!subAccountId) return;
    if (item.publicUrl) {
      onChange({ src: item.publicUrl, mediaAssetId: item.id });
      return;
    }
    const ok = await confirm({
      title: "Make this audio file public?",
      description: "Audio on a page has to be public: anyone with the link can play it. The original in your Media Library stays private.",
      confirmLabel: "Make public",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await assetsCall<{ url: string }>(`/api/sub-accounts/${subAccountId}/media-library/${item.id}/public-image`, { method: "POST", json: {} });
      onChange({ src: r.url, mediaAssetId: item.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file || !subAccountId) return;
    if (!(AUDIO_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Use an MP3, M4A, AAC, WAV, OGG or WebM audio file.");
      return;
    }
    setBusy(true);
    try {
      const item = await uploadToMediaLibrary(subAccountId, file);
      setBusy(false);
      await makePublic(item);
    } catch (e) {
      toast.error((e as Error).message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2" data-audio-source-field="">
      <Label className="text-xs font-semibold">Audio file</Label>
      {src ? (
        <div className="border-border bg-muted flex items-center gap-2 rounded-md border p-1.5">
          <AudioLines className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs">{fileName(src)}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ src: "", mediaAssetId: "" })}>Remove</Button>
        </div>
      ) : null}
      <input ref={fileRef} type="file" accept={AUDIO_MIME_TYPES.join(",")} className="sr-only" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="grid gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!subAccountId || busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {src ? "Upload a different file" : "Upload audio"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!subAccountId || busy} onClick={() => setOpen(true)}>
          <FolderOpen className="h-3.5 w-3.5" /> Choose from Media Library
        </Button>
      </div>
      <p className="text-muted-foreground text-caption">MP3, M4A, WAV or OGG, up to 15 MB.</p>
      <button type="button" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => setAdvanced((v) => !v)}>
        Advanced: audio file link
      </button>
      {advanced ? <AudioLinkInput value={value?.mediaAssetId ? "" : src} onCommit={(link) => onChange({ src: link, mediaAssetId: "" })} /> : null}
      {subAccountId ? (
        <MediaPickerDialog
          subAccountId={subAccountId}
          open={open}
          onOpenChange={setOpen}
          kind="audio"
          title="Choose an audio file"
          description="Audio files from your Media Library."
          onSelect={(item) => {
            setOpen(false);
            void makePublic(item);
          }}
        />
      ) : null}
      {dialog}
    </div>
  );
}

/** Commits on blur / Enter, so a half-typed link never reaches the draft. */
function AudioLinkInput({ value, onCommit }: { value: string; onCommit: (link: string) => void }) {
  const [draft, setDraft] = useState(value);
  const invalid = !!draft.trim() && !safeAudioSrc(draft);
  const commit = () => {
    if (!invalid && draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <div className="space-y-1">
      <Input
        value={draft}
        placeholder="https://…/episode.mp3"
        className="text-xs"
        aria-invalid={invalid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      {invalid ? <p className="text-destructive text-xs">Use a public https link to an audio file.</p> : null}
    </div>
  );
}

function fileName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").split("/").pop() || url;
  } catch {
    return url;
  }
}
