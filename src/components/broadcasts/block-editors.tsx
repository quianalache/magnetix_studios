"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { uploadBroadcastImage } from "@/lib/broadcasts/upload-image";
import type {
  ImageBlock,
  VideoBlock,
  ButtonBlock,
  ColumnsBlock,
  EmailBlockNonColumn,
  EmailBlockAlign,
} from "@/types/broadcast-content";

const ALIGNS: EmailBlockAlign[] = ["left", "center", "right"];

function AlignPicker({
  value,
  onChange,
}: {
  value: EmailBlockAlign | undefined;
  onChange: (v: EmailBlockAlign) => void;
}) {
  return (
    <div className="flex gap-1">
      {ALIGNS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className={`rounded border px-2 py-1 text-xs capitalize ${
            (value ?? "left") === a
              ? "border-primary bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

export function ImageBlockEditor({
  block,
  saId,
  draftId,
  onChange,
}: {
  block: ImageBlock;
  saId: string;
  draftId: string;
  onChange: (next: ImageBlock) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadBroadcastImage(file, saId, draftId, "image");
      onChange({ ...block, src: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {block.src ? (
        <img
          src={block.src}
          alt={block.alt}
          className="max-h-40 rounded-md border object-contain"
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="mr-1 h-3.5 w-3.5" />
        )}
        {block.src ? "Replace image" : "Upload image"}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Input
        placeholder="Alt text (required)"
        value={block.alt}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
      />
      <Input
        placeholder="Link URL (optional — click-through)"
        value={block.href ?? ""}
        onChange={(e) => onChange({ ...block, href: e.target.value || undefined })}
      />
      <AlignPicker value={block.align} onChange={(align) => onChange({ ...block, align })} />
    </div>
  );
}

export function VideoBlockEditor({
  block,
  saId,
  draftId,
  onChange,
}: {
  block: VideoBlock;
  saId: string;
  draftId: string;
  onChange: (next: VideoBlock) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadBroadcastImage(file, saId, draftId, "video-thumbnail");
      onChange({ ...block, thumbnailSrc: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Renders as a thumbnail that opens the video in a new tab — no email
        client plays video inline, so this is the standard approach.
      </p>
      {block.thumbnailSrc ? (
        <img
          src={block.thumbnailSrc}
          alt={block.alt}
          className="max-h-40 rounded-md border object-contain"
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="mr-1 h-3.5 w-3.5" />
        )}
        {block.thumbnailSrc ? "Replace thumbnail" : "Upload thumbnail"}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Input
        placeholder="Video URL (YouTube, Vimeo, Loom, etc.)"
        value={block.videoUrl}
        onChange={(e) => onChange({ ...block, videoUrl: e.target.value })}
      />
      <Input
        placeholder="Alt text (required)"
        value={block.alt}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
      />
    </div>
  );
}

export function ButtonBlockEditor({
  block,
  onChange,
}: {
  block: ButtonBlock;
  onChange: (next: ButtonBlock) => void;
}) {
  return (
    <div className="space-y-2">
      <Input
        placeholder="Button label"
        value={block.label}
        onChange={(e) => onChange({ ...block, label: e.target.value })}
      />
      <Input
        placeholder="https://…"
        value={block.href}
        onChange={(e) => onChange({ ...block, href: e.target.value })}
      />
      <AlignPicker value={block.align} onChange={(align) => onChange({ ...block, align })} />
    </div>
  );
}

let idCounter = 0;
export function newBlockId(): string {
  idCounter += 1;
  return `blk_${Date.now()}_${idCounter}`;
}

export function newColumnBlock(): EmailBlockNonColumn {
  return { id: newBlockId(), type: "text", html: "<p></p>" };
}

/** Fixed 2-column layout — each column is a small ordered stack of simple
 *  blocks (Text/Image/Button). Not independently drag-reorderable (only
 *  top-level blocks are); add/remove is enough for a columns block's
 *  actual use case (a text+image side-by-side). */
export function ColumnsBlockEditor({
  block,
  onChange,
}: {
  block: ColumnsBlock;
  onChange: (next: ColumnsBlock) => void;
}) {
  function updateColumn(colIdx: number, items: EmailBlockNonColumn[]) {
    const columns = block.columns.map((c, i) => (i === colIdx ? items : c));
    onChange({ ...block, columns });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {block.columns.map((col, colIdx) => (
        <div key={colIdx} className="space-y-2 rounded-md border p-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            Column {colIdx + 1}
          </div>
          {col.map((item, itemIdx) => (
            <div key={item.id} className="rounded border bg-muted/30 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] capitalize text-muted-foreground">
                  {item.type}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateColumn(colIdx, col.filter((_, i) => i !== itemIdx))
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {item.type === "text" && (
                <textarea
                  className="w-full rounded border bg-background p-1.5 text-xs"
                  rows={2}
                  value={item.html.replace(/<[^>]+>/g, "")}
                  onChange={(e) => {
                    const next = [...col];
                    next[itemIdx] = { ...item, html: `<p>${e.target.value}</p>` };
                    updateColumn(colIdx, next);
                  }}
                />
              )}
              {item.type === "image" && (
                <Input
                  placeholder="Image URL"
                  value={item.src}
                  onChange={(e) => {
                    const next = [...col];
                    next[itemIdx] = { ...item, src: e.target.value, alt: item.alt || "Image" };
                    updateColumn(colIdx, next);
                  }}
                />
              )}
              {item.type === "button" && (
                <div className="space-y-1">
                  <Input
                    placeholder="Label"
                    value={item.label}
                    onChange={(e) => {
                      const next = [...col];
                      next[itemIdx] = { ...item, label: e.target.value };
                      updateColumn(colIdx, next);
                    }}
                  />
                  <Input
                    placeholder="URL"
                    value={item.href}
                    onChange={(e) => {
                      const next = [...col];
                      next[itemIdx] = { ...item, href: e.target.value };
                      updateColumn(colIdx, next);
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-1">
            <button
              type="button"
              className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              onClick={() => updateColumn(colIdx, [...col, newColumnBlock()])}
            >
              <Plus className="h-3 w-3" /> Text
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              onClick={() =>
                updateColumn(colIdx, [
                  ...col,
                  { id: newBlockId(), type: "image", src: "", alt: "" },
                ])
              }
            >
              <Plus className="h-3 w-3" /> Image
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              onClick={() =>
                updateColumn(colIdx, [
                  ...col,
                  { id: newBlockId(), type: "button", label: "Click here", href: "" },
                ])
              }
            >
              <Plus className="h-3 w-3" /> Button
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
