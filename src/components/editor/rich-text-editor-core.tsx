"use client";

import { EditorContent } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { useRichTextEditor } from "./use-rich-text-editor";
import { RichTextToolbar, type RichTextToolbarItem } from "./rich-text-toolbar-items";

/**
 * The shared, configurable Magnetix rich-text editor. One TipTap setup +
 * one toolbar system, context-specific only via `toolbar` (which buttons
 * render, in order) and the layout/sizing props below — no product surface
 * should hand-roll its own `useEditor`/toolbar pair anymore. See Phase A
 * report for the full rationale and for why media (image/video/dictation)
 * isn't part of this core yet.
 */
export function RichTextEditorCore({
  value,
  onChange,
  disabled,
  toolbar,
  titles,
  containerClassName,
  proseClassName,
  minHeightClassName,
  loadingClassName,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  toolbar: RichTextToolbarItem[];
  /** Per-item label overrides, e.g. About's "Heading"/"Subheading". */
  titles?: Partial<Record<RichTextToolbarItem, string>>;
  /** Outer border/rounding wrapper — varies per consumer today (e.g.
   *  `rounded-md` for About vs `rounded-lg` for Lesson). */
  containerClassName: string;
  proseClassName: string;
  minHeightClassName: string;
  /** Pre-mount skeleton shown while the editor is still initializing. */
  loadingClassName: string;
}) {
  const editor = useRichTextEditor({
    toolbar,
    value,
    onChange,
    disabled,
    proseClassName,
    minHeightClassName,
  });

  if (!editor) {
    return <div className={loadingClassName} />;
  }

  return (
    <div className={cn("overflow-hidden bg-background", containerClassName)}>
      <RichTextToolbar editor={editor} items={toolbar} titles={titles} />
      <EditorContent editor={editor} />
    </div>
  );
}
