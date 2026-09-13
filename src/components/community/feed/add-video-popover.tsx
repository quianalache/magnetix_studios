"use client";

import { useState } from "react";
import { Check, Video } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseVideoUrl } from "@/lib/community/video-embed";
import type {
  VideoLinkAttachment,
  VideoProviderName,
} from "@/types/media-attachment";

// Post video attachments still only accept the original four providers —
// see normalize-post-attachments.ts's own guard (the real, server-side
// boundary this mirrors for UX only) for why.
const POST_VIDEO_PROVIDERS: readonly VideoProviderName[] = [
  "youtube",
  "vimeo",
  "loom",
  "descript",
];
function isPostVideoProvider(provider: string): provider is VideoProviderName {
  return (POST_VIDEO_PROVIDERS as readonly string[]).includes(provider);
}

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
  renderTrigger,
}: {
  authorMemberId: string;
  onAdd: (video: VideoLinkAttachment) => void;
  disabled?: boolean;
  /** Optional custom trigger content — see `LinkPopover`'s identical prop.
   *  Composer UX refinement (2026-08-20): lets "Add video" become a `+`
   *  menu row instead of its own always-visible toolbar icon, same
   *  consolidation the comment composer's `+` menu already established for
   *  "Add link." Omitted = unchanged default icon-button look. */
  renderTrigger?: (active: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rawParsed = url.trim() ? parseVideoUrl(url) : null;
  const parsed =
    rawParsed && isPostVideoProvider(rawParsed.provider) ? rawParsed : null;

  function add() {
    const result = parseVideoUrl(url);
    if (!result || !isPostVideoProvider(result.provider)) {
      setError(
        "That link isn't from a supported provider (YouTube, Vimeo, Loom, or Descript)."
      );
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
        className={
          renderTrigger
            ? undefined
            : "flex h-8 w-8 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124] disabled:opacity-40"
        }
      >
        {renderTrigger ? renderTrigger(open) : <Video className="h-4 w-4" />}
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2.5">
        <p className="text-foreground text-xs font-medium">
          Add video or media
        </p>
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
          className="border-border bg-background focus:border-primary w-full rounded-md border px-2 py-1.5 text-sm outline-none"
        />
        {parsed && (
          <p className="flex items-center gap-1 text-xs text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Recognized as {parsed.provider}
          </p>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={add}
            disabled={!url.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
