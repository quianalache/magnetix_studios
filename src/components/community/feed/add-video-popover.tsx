"use client";

import { useState } from "react";
import { Check, Video } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseVideoUrl } from "@/lib/community/video-embed";
import type { VideoLinkAttachment } from "@/types/media-attachment";

/**
 * Composer "Add video/media" action — paste a YouTube/Vimeo/Loom/Descript
 * URL, `parseVideoUrl` identifies the provider client-side (the same
 * function the server re-runs to validate before ever storing it — see
 * normalize-post-attachments.ts), a small inline preview confirms it was
 * recognized, then it's added as a draft `video-link` attachment. No
 * generic iframe/embed-code fallback — only a supported-provider URL ever
 * produces an attachment here.
 */
export function AddVideoPopover({
  authorMemberId,
  onAdd,
  disabled,
}: {
  authorMemberId: string;
  onAdd: (video: VideoLinkAttachment) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsed = url.trim() ? parseVideoUrl(url) : null;

  function add() {
    const result = parseVideoUrl(url);
    if (!result) {
      setError("That link isn't from a supported provider (YouTube, Vimeo, Loom, or Descript).");
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      originalUrl: url.trim(),
      provider: result.provider,
      providerId: result.id,
      embedUrl: result.embedUrl,
      authorMemberId,
      createdAt: Date.now(),
    });
    setUrl("");
    setError(null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        title="Add video"
        aria-label="Add video"
        disabled={disabled}
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124] disabled:opacity-40"
      >
        <Video className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2.5">
        <p className="text-xs font-medium text-foreground">Add video or media</p>
        <input
          autoFocus
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Paste a YouTube, Vimeo, Loom, or Descript link"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        {parsed && (
          <p className="flex items-center gap-1 text-xs text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Recognized as {parsed.provider}
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={add}
            disabled={!url.trim()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
