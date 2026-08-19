"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Row-style image field for Community Settings → General's "Community
 * Image & Logo" section (Logo / Favicon / Cover Image, per the approved
 * mock-up) — preview thumbnail, label + description, Change/Remove
 * actions, and recommended-size guidance, all in one row.
 *
 * Deliberately a NEW, purpose-built shell rather than a new prop on the
 * existing `ImageUpload` (the dashed-box-with-hover-X component used
 * elsewhere, e.g. Standalone Course settings) — that component's own
 * consumers keep their exact current look; this one exists because the
 * approved mock-up's row layout doesn't match it. Both delegate to the
 * SAME upload contract (`onUpload(file) => Promise<string>`), so there's
 * still only ONE upload architecture underneath — this is a different
 * shell around it, not a second upload system.
 */
export function SettingsImageRow({
  label,
  description,
  guidance,
  value,
  onChange,
  onUploadingChange,
  onUpload,
  shape = "square",
}: {
  label: string;
  description: string;
  /** e.g. "Recommended: 512x512px" / "PNG or JPG up to 2MB" — shown as-is,
   *  informational only (see the upload route's own comment on why this
   *  copy doesn't imply a stricter enforced limit than the existing one). */
  guidance: string[];
  value: string | null;
  onChange: (url: string | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onUpload: (file: File) => Promise<string>;
  /** "square" = Logo, "tiny" = Favicon, "wide" = Cover. */
  shape?: "square" | "tiny" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const url = await onUpload(file);
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const previewBox =
    shape === "tiny" ? "h-10 w-10" : shape === "wide" ? "h-14 w-24" : "h-16 w-16";

  return (
    <div className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-[#E4E4E4] bg-[#FAFAFA]",
            previewBox,
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#909090]" />
          ) : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] text-[#b4b4b4]">None</span>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#202124]">{label}</p>
          <p className="text-xs text-[#909090]">{description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : value ? `Change ${label.replace("Community ", "")}` : `Upload ${label.replace("Community ", "")}`}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => onChange(null)}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
          )}
        </div>
        <div className="hidden text-right text-xs text-[#909090] sm:block">
          {guidance.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>

      {/* Guidance repeats, visible-only-on-mobile, below the row where the
          desktop-only column above would otherwise disappear entirely. */}
      <div className="text-xs text-[#909090] sm:hidden">
        {guidance.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}
