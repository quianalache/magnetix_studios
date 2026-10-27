"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageFieldEditor } from "@/components/pages-funnels/puck/image-field";
import type {
  GalleryImage,
  LogoItem,
} from "@/components/pages-funnels/puck/parity-blocks";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { uploadPageImage } from "@/lib/pages-funnels/puck/upload-image";
import { MediaLibraryImagesButton } from "@/components/assets/media-library-image-button";
import type { MediaLibraryItem } from "@/types/media-library";

function ImageList({
  value,
  onChange,
  label,
}: {
  value: (GalleryImage | LogoItem)[] | undefined;
  onChange: (value: (GalleryImage | LogoItem)[]) => void;
  label: string;
}) {
  const items = value ?? [];
  const sub = useOptionalSubAccount();
  const params = useParams<{ pageId?: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function uploadMany(files: FileList | null) {
    if (!files || !sub?.subAccountId || !params?.pageId) return;
    setBusy(true);
    try {
      const urls = await Promise.all(
        Array.from(files).map((file) =>
          uploadPageImage(file, sub.subAccountId, params.pageId!)
        )
      );
      onChange([...items, ...urls.map((src) => ({ src, alt: "" }))]);
    } finally {
      setBusy(false);
    }
  }
  function addLibraryImages(selected: MediaLibraryItem[]) {
    onChange([
      ...items,
      ...selected
        .filter((item) => item.publicUrl)
        .map((item) => ({ src: item.publicUrl!, alt: item.title })),
    ]);
  }
  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold">{label}</Label>
      {items.map((item, index) => (
        <div
          key={index}
          className="border-border space-y-2 rounded-md border p-3"
        >
          <ImageFieldEditor
            value={item.src}
            onChange={(src) =>
              onChange(
                items.map((current, i) =>
                  i === index ? { ...current, src } : current
                )
              )
            }
          />
          <Input
            aria-label={`${label} ${index + 1} alt text`}
            value={item.alt}
            placeholder="Alt text"
            onChange={(event) =>
              onChange(
                items.map((current, i) =>
                  i === index
                    ? { ...current, alt: event.target.value }
                    : current
                )
              )
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      {sub?.subAccountId && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => void uploadMany(event.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Upload images
            </Button>
            <MediaLibraryImagesButton
              subAccountId={sub.subAccountId}
              onPick={addLibraryImages}
            />
          </div>
        </>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, { src: "", alt: "" }])}
      >
        Add image
      </Button>
    </div>
  );
}

export function GalleryImagesField({
  value,
  onChange,
}: {
  value: GalleryImage[] | undefined;
  onChange: (value: GalleryImage[]) => void;
}) {
  return (
    <ImageList
      value={value}
      onChange={(next) => onChange(next as GalleryImage[])}
      label="Gallery images"
    />
  );
}
export function LogoItemsField({
  value,
  onChange,
}: {
  value: LogoItem[] | undefined;
  onChange: (value: LogoItem[]) => void;
}) {
  return (
    <ImageList
      value={value}
      onChange={(next) => onChange(next as LogoItem[])}
      label="Logos"
    />
  );
}
