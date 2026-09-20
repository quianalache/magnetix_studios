"use client";

import Image from "next/image";
import { ImageIcon, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextBlockEditor } from "@/components/broadcasts/text-block-editor";
import {
  isBlockIncomplete,
  ALIGN_TO_FLEX,
  IncompleteBadge,
  BlockDeleteButton,
} from "./canvas";
import type {
  EmailBlock,
  EmailBlockNonColumn,
} from "@/types/broadcast-content";

/**
 * Renders ONE block's real visual representation inside the canvas — the
 * "actual email" the owner sees IS the editing surface (task instruction 4),
 * not a config card. Text blocks are directly editable in place
 * (instruction 5) via the exact same TipTap TextBlockEditor the old
 * composer used, so there is still only one text-editing implementation in
 * the app. Every other block type shows real markup (an <img>, a
 * button-styled <a>, an <hr>, real blank space) rather than a description
 * of settings.
 *
 * `isBlockIncomplete` only ever ADDS a badge/placeholder here — it never
 * removes the block from the tree, which is what makes the "incomplete
 * Image + valid hello Text" regression structurally impossible: this
 * function is called once per block, independently, with no shared
 * try/catch or early-return that could take a sibling down with it.
 */

export function CanvasBlock({
  block,
  onChange,
  onDelete,
}: {
  block: EmailBlock;
  onChange: (next: EmailBlock) => void;
  onDelete: () => void;
}) {
  if (block.type === "columns") {
    return (
      <div className="relative grid grid-cols-2 gap-3">
        <BlockDeleteButton onDelete={onDelete} />
        {block.columns.map((column, colIndex) => (
          <div
            key={colIndex}
            className="space-y-2 rounded-md border border-dashed p-2"
          >
            {column.blocks.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-xs">
                Empty column
              </p>
            )}
            {column.blocks.map((child, childIndex) => (
              <div key={child.id} className="relative">
                {isBlockIncomplete(child) && <IncompleteBadge />}
                <LeafBlockContent
                  block={child}
                  onChange={(next) => {
                    const columns = block.columns.map((c, i) =>
                      i === colIndex
                        ? {
                            blocks: c.blocks.map((b, j) =>
                              j === childIndex ? next : b
                            ),
                          }
                        : c
                    );
                    onChange({ ...block, columns });
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const incomplete = isBlockIncomplete(block);
  return (
    <div className="relative">
      {incomplete && <IncompleteBadge />}
      <BlockDeleteButton onDelete={onDelete} />
      <LeafBlockContent
        block={block}
        onChange={onChange as (next: EmailBlockNonColumn) => void}
      />
    </div>
  );
}

function LeafBlockContent({
  block,
  onChange,
}: {
  block: EmailBlockNonColumn;
  onChange: (next: EmailBlockNonColumn) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <div
          className={cn("min-h-[1.5em]", ALIGN_TO_FLEX[block.align ?? "left"])}
        >
          <TextBlockEditor
            value={block.html}
            onChange={(html) => onChange({ ...block, html })}
          />
        </div>
      );
    case "image":
      return (
        <div
          className={cn("flex py-1", ALIGN_TO_FLEX[block.align ?? "center"])}
        >
          {block.src ? (
            <Image
              src={block.src}
              alt={block.alt || ""}
              width={block.widthPx ?? 480}
              height={Math.round((block.widthPx ?? 480) * 0.5625)}
              className="h-auto max-w-full rounded-sm object-cover"
              unoptimized
            />
          ) : (
            <div className="bg-muted/40 text-muted-foreground flex h-32 w-full max-w-sm flex-col items-center justify-center gap-1 rounded-md border border-dashed">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">No image selected</span>
            </div>
          )}
        </div>
      );
    case "video":
      return (
        <div className="flex justify-center py-1">
          <div className="bg-muted/40 relative flex h-32 w-full max-w-sm items-center justify-center rounded-md border">
            {block.thumbnailSrc ? (
              <Image
                src={block.thumbnailSrc}
                alt={block.alt || ""}
                fill
                className="rounded-md object-cover"
                unoptimized
              />
            ) : null}
            <PlayCircle className="relative z-10 h-10 w-10 text-white drop-shadow" />
          </div>
        </div>
      );
    case "button":
      return (
        <div
          className={cn("flex py-2", ALIGN_TO_FLEX[block.align ?? "center"])}
        >
          <span
            className="inline-block rounded-md px-5 py-2.5 text-sm font-medium text-white"
            style={{
              backgroundColor: block.bgColor || "#7c3aed",
              color: block.textColor || "#ffffff",
            }}
          >
            {block.label || "Button"}
          </span>
        </div>
      );
    case "divider":
      return <hr className="border-border my-2 border-t" />;
    case "spacer":
      return (
        <div style={{ height: `${block.heightPx ?? 24}px` }} aria-hidden />
      );
  }
}
