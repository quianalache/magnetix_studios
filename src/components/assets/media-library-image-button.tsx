"use client";

import { useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assetsCall } from "@/lib/client/assets-api";
import type { MediaLibraryItem } from "@/types/media-library";
import { MediaPickerDialog } from "./media-picker-dialog";

/**
 * "Choose from Media Library" for PUBLIC image fields — page images,
 * broadcast email images, course / offer thumbnails (Assets corrections,
 * 2026-09-29). Reuses an uploaded image instead of uploading it again.
 *
 * Library images are private. Picking one that isn't public yet asks for
 * explicit confirmation, then the server makes a separate public copy
 * (admins only — collaborators are told to ask an admin). The field
 * receives that public URL, exactly the kind of URL it already stores, so
 * nothing downstream changes. Images already public are reused as-is.
 */
export function MediaLibraryImageButton({
  subAccountId,
  onPick,
  label = "Choose from Media Library",
  size = "sm",
  className,
  disabled,
}: {
  subAccountId: string;
  onPick: (url: string) => void;
  label?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<MediaLibraryItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function publish(item: MediaLibraryItem) {
    setBusy(true);
    try {
      const r = await assetsCall<{ url: string }>(`/api/sub-accounts/${subAccountId}/media-library/${item.id}/public-image`, {
        method: "POST",
        json: {},
      });
      onPick(r.url);
      setPending(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} disabled={disabled || busy} onClick={() => setPickerOpen(true)}>
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="mr-1 h-3.5 w-3.5" />}
        {label}
      </Button>
      <MediaPickerDialog
        subAccountId={subAccountId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="image"
        title="Choose an image"
        description="Reuse an image from your Media Library."
        onSelect={(item) => {
          if (item.publicUrl) onPick(item.publicUrl);
          else setPending(item);
        }}
      />
      <Dialog open={!!pending} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Make this image public?</DialogTitle>
            <DialogDescription>
              “{pending?.title}” is private. Using it here creates a public copy that anyone with the link can view — needed for pages, emails and
              course images. The original in your Media Library stays private, and nothing else in your library changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => pending && void publish(pending)}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Make public &amp; use
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
