"use client";

import {
  AlignLeft,
  Columns2,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  Plus,
  Video,
} from "lucide-react";
import { TextBlockEditor } from "@/components/broadcasts/text-block-editor";
import {
  ButtonBlockEditor,
  ColumnsBlockEditor,
  ImageBlockEditor,
  VideoBlockEditor,
  newBlockId,
} from "@/components/broadcasts/block-editors";
import type { EmailBlock } from "@/types/broadcast-content";

/**
 * Shared block-authoring shell — extracted so Workflow Design Email (Shared
 * Email Foundation Phase 3, 2026-09-09) reuses the exact same,
 * production-proven per-block editors Broadcasts do: TextBlockEditor (with
 * its TipTap Placeholder fix), ImageBlockEditor, VideoBlockEditor,
 * ButtonBlockEditor, ColumnsBlockEditor (with its Firestore-safe
 * `{ blocks: [...] }` column shape) — all imported verbatim from
 * @/components/broadcasts/block-editors, never copy-pasted.
 *
 * Deliberately does NOT reuse broadcast-composer.tsx's own drag-to-reorder
 * block list (@dnd-kit) — extracting that too would mean touching
 * broadcast-composer.tsx's proven list-rendering code in the same pass that
 * introduces a brand-new consumer, which is exactly the kind of change that
 * could regress production Broadcasts. This shell supports add/edit/remove
 * only; reordering is deferred, documented future work, matching the
 * "smallest safe" instruction for this phase.
 */

const BLOCK_LABELS: Record<
  EmailBlock["type"],
  { label: string; icon: typeof AlignLeft }
> = {
  text: { label: "Text", icon: AlignLeft },
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Video },
  button: { label: "Button", icon: MousePointerClick },
  divider: { label: "Divider", icon: Minus },
  columns: { label: "Columns", icon: Columns2 },
};

const BLOCK_ORDER: EmailBlock["type"][] = [
  "text",
  "image",
  "video",
  "button",
  "divider",
  "columns",
];

function newBlock(type: EmailBlock["type"]): EmailBlock {
  switch (type) {
    case "text":
      // Genuinely empty — TextBlockEditor's Placeholder extension shows
      // "Write something…" visually without it ever being stored content
      // (see src/components/broadcasts/text-block-editor.tsx).
      return { id: newBlockId(), type: "text", html: "<p></p>" };
    case "image":
      return { id: newBlockId(), type: "image", src: "", alt: "" };
    case "video":
      return {
        id: newBlockId(),
        type: "video",
        videoUrl: "",
        thumbnailSrc: "",
        alt: "",
      };
    case "button":
      return { id: newBlockId(), type: "button", label: "Click here", href: "" };
    case "divider":
      return { id: newBlockId(), type: "divider" };
    case "columns":
      return {
        id: newBlockId(),
        type: "columns",
        columns: [
          { blocks: [{ id: newBlockId(), type: "text", html: "<p></p>" }] },
          { blocks: [{ id: newBlockId(), type: "text", html: "<p></p>" }] },
        ],
      };
  }
}

export function EmailBlocksEditor({
  blocks,
  onChange,
  saId,
  draftId,
}: {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  /** Sub-account id — scopes uploaded image/video-thumbnail storage paths. */
  saId: string;
  /** Stable id (the emailDocumentId) — scopes uploaded storage paths. */
  draftId: string;
}) {
  function addBlock(type: EmailBlock["type"]) {
    onChange([...blocks, newBlock(type)]);
  }
  function updateBlock(id: string, next: EmailBlock) {
    onChange(blocks.map((b) => (b.id === id ? next : b)));
  }
  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Add your first block below.
        </div>
      )}
      {blocks.map((block) => {
        const { label, icon: Icon } = BLOCK_LABELS[block.type];
        return (
          <div key={block.id} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
              <button
                type="button"
                onClick={() => removeBlock(block.id)}
                className="text-muted-foreground hover:text-destructive text-xs"
              >
                Remove
              </button>
            </div>
            {block.type === "text" && (
              <TextBlockEditor
                value={block.html}
                onChange={(html) => updateBlock(block.id, { ...block, html })}
              />
            )}
            {block.type === "image" && (
              <ImageBlockEditor
                block={block}
                saId={saId}
                draftId={draftId}
                onChange={(next) => updateBlock(block.id, next)}
              />
            )}
            {block.type === "video" && (
              <VideoBlockEditor
                block={block}
                saId={saId}
                draftId={draftId}
                onChange={(next) => updateBlock(block.id, next)}
              />
            )}
            {block.type === "button" && (
              <ButtonBlockEditor
                block={block}
                onChange={(next) => updateBlock(block.id, next)}
              />
            )}
            {block.type === "divider" && (
              <div className="text-muted-foreground border-t py-2 text-center text-xs">
                A horizontal divider — no settings.
              </div>
            )}
            {block.type === "columns" && (
              <ColumnsBlockEditor
                block={block}
                onChange={(next) => updateBlock(block.id, next)}
              />
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {BLOCK_ORDER.map((type) => {
          const { label, icon: Icon } = BLOCK_LABELS[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(type)}
              className="text-muted-foreground hover:bg-muted flex items-center gap-1 rounded border px-2 py-1.5 text-xs"
            >
              <Plus className="h-3 w-3" />
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
