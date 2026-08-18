"use client";

import { RichTextEditorCore } from "@/components/editor/rich-text-editor-core";
import type { RichTextToolbarItem } from "@/components/editor/rich-text-toolbar-items";

/**
 * Community "About" editor — Phase A migration onto the shared
 * `RichTextEditorCore`. This is a pure configuration wrapper now (toolbar
 * items + sizing only); the actual TipTap setup/toolbar rendering lives in
 * `src/components/editor/`, shared with every other rich-text surface.
 * Intentionally zero behavior/visual change from the previous hand-rolled
 * implementation — see the Phase A report for how that was verified.
 */
const TOOLBAR: RichTextToolbarItem[] = [
  "h2",
  "h3",
  "divider",
  "bold",
  "italic",
  "underline",
  "divider",
  "bulletList",
  "orderedList",
  "divider",
  "link",
];

export function AboutRichTextEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  return (
    <RichTextEditorCore
      value={value}
      onChange={onChange}
      disabled={disabled}
      toolbar={TOOLBAR}
      titles={{ h2: "Heading", h3: "Subheading" }}
      containerClassName="rounded-md border"
      proseClassName="prose prose-sm max-w-none"
      minHeightClassName="min-h-40"
      loadingClassName="min-h-52 rounded-md border bg-muted/20"
    />
  );
}
