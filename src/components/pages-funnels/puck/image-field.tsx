"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, ImageUp, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { uploadPageImage } from "@/lib/pages-funnels/puck/upload-image";
import { cn } from "@/lib/utils";

/**
 * Image element's Settings field editor (real user QA blocker — the Image
 * element previously exposed only a raw "Image URL" text field, "a normal
 * customer should be able to upload/select an image" per that task). A
 * Puck `custom` field bound to the Image component's existing `src: string`
 * prop — persisted shape is unchanged (still a flat URL string, so every
 * already-persisted page with an Image element keeps working with zero
 * migration); this only changes how it's edited.
 *
 * Upload goes through `uploadPageImage` (real Firebase Storage, the exact
 * same client-SDK pattern every sibling upload feature in this codebase
 * already uses — see that helper's own doc comment) and stores the
 * resulting DURABLE download URL — never a temporary/local `blob:`/
 * `object:` URL, so it survives Save/leave/return and renders identically
 * in the editor canvas, Preview, and the published page, all of which
 * already just read `src` as a plain string.
 *
 * Content Library / "Choose from Library" (browsing previously-uploaded
 * images across pages) is NOT implemented here — inspected first (task's
 * explicit instruction) and genuinely doesn't yet expose a reusable picker
 * component; implementing the smallest proper Upload flow instead and
 * reporting library-selection as a separate, real gap, per the task's own
 * explicit permission to do exactly that rather than force a raw-URL
 * fallback "because it's easier."
 *
 * SUB-ACCOUNT / PAGE SCOPE: same reasoning as `form-field.tsx` — Puck's
 * `CustomFieldRender` doesn't carry `puck.metadata`, so this reads
 * `useOptionalSubAccount()` (subAccountId) and `useParams()` (pageId, the
 * current route's own dynamic segment — this field mounts inside the same
 * `.../pages-funnels/[pageId]/new-builder` route tree) rather than
 * threading new props through Puck's controlled `config`. Falls back to
 * manual-URL-only when either is unavailable (the unauthenticated QA
 * harness has neither) instead of crashing or silently no-op'ing.
 */
export function ImageFieldEditor({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const sub = useOptionalSubAccount();
  const params = useParams<{ pageId?: string }>();
  const pageId = params?.pageId;
  const canUpload = !!sub?.subAccountId && !!pageId;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(!canUpload && !value);

  const src = value ?? "";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !sub?.subAccountId || !pageId) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadPageImage(file, sub.subAccountId, pageId);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Image</Label>

      {src && (
        <div className="border-border bg-muted flex items-center gap-2 overflow-hidden rounded-md border p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded/pasted URL preview, same as the canvas ImageRender. */}
          <img
            src={src}
            alt=""
            className="h-10 w-10 shrink-0 rounded object-cover"
          />
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {filenameFromUrl(src)}
          </span>
        </div>
      )}

      {canUpload ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageUp className="h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading…" : src ? "Replace Image" : "Upload Image"}
          </Button>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </>
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed p-2.5 text-xs">
          Upload isn&apos;t available in this preview context — use the manual
          URL below.
        </p>
      )}

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            advancedOpen && "rotate-180"
          )}
        />
        Advanced: Image URL
      </button>
      {advancedOpen && (
        <Input
          value={src}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
          className="text-xs"
        />
      )}
    </div>
  );
}

/** Firebase Storage download URLs encode the ENTIRE storage path
 *  (slashes included, as `%2F`) into one path segment
 *  (`/v0/b/{bucket}/o/pages-funnels%2F{saId}%2F{pageId}%2Fimage-…jpg`) — so
 *  the raw last `pathname` segment must be percent-decoded FIRST, and only
 *  THEN split again, or the real slashes hidden inside that decoded string
 *  are missed and the "filename" shown is the whole encoded storage path. */
function filenameFromUrl(url: string): string {
  try {
    const rawLastSegment = new URL(url).pathname.split("/").pop() ?? "";
    const decodedParts = decodeURIComponent(rawLastSegment).split("/");
    return decodedParts.pop() || url;
  } catch {
    return url;
  }
}
