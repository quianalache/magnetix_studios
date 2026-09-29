"use client";

import { MediaPickerDialog } from "@/components/assets/media-picker-dialog";
import type { MediaLibraryItem } from "@/types/media-library";

export function MediaLibraryPicker({ open, onOpenChange, subAccountId, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; subAccountId: string; onSelect: (media: { url: string; name: string }) => void }) {
  function select(item: MediaLibraryItem) {
    if (!item.publicUrl) return;
    onSelect({ url: item.publicUrl, name: item.title });
  }

  return (
    <MediaPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      subAccountId={subAccountId}
      kind="image"
      publicOnly
      title="Choose approved image"
      description="Only ready images with an administrator-approved public delivery URL can be published."
      onSelect={select}
    />
  );
}
