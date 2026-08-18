"use client";

import { EditorContent } from "@tiptap/react";
import { useRichTextEditor } from "@/components/editor/use-rich-text-editor";
import { RichTextToolbar, type RichTextToolbarItem } from "@/components/editor/rich-text-toolbar-items";
import { communityPostTypographyClasses } from "@/components/community/feed/community-post-typography";
import { cn } from "@/lib/utils";

/**
 * Community post composer body — a text-formatting-only configuration of
 * the Phase A shared rich-text core. No headings, no images, no video, no
 * code blocks, no arbitrary embeds — deliberately smaller than either
 * existing configuration (About, Lesson), matching what a social post
 * composer actually needs per the Composer Capability Gap Analysis.
 *
 * Composed directly from `useRichTextEditor` + `RichTextToolbar` (the same
 * shared pieces `RichTextEditorCore` is built from) rather than mounting
 * `RichTextEditorCore` itself — Community wants the editor to sit flush
 * inside its own card (no boxed/bordered editor, matching the plain
 * textarea it replaces) with the toolbar's visibility externally
 * controlled by the composer's "Aa" toggle, which `RichTextEditorCore`'s
 * always-visible-toolbar design doesn't support. Still zero duplicated
 * TipTap setup or toolbar-rendering logic — both come from Phase A as-is.
 */
const COMMUNITY_POST_TOOLBAR: RichTextToolbarItem[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "divider",
  "bulletList",
  "orderedList",
  "blockquote",
  "divider",
  "link",
  "clearFormatting",
];

export function CommunityPostEditor({
  value,
  onChange,
  toolbarOpen,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Controlled by the parent composer's "Aa" button — see feed-view.tsx.
   *  Collapsing this does NOT remove any formatting already applied to
   *  the text; it only hides the button row. */
  toolbarOpen: boolean;
}) {
  const editor = useRichTextEditor({
    toolbar: COMMUNITY_POST_TOOLBAR,
    value,
    onChange,
    // Same typography classes CommunityPostBody renders the published
    // post with (see community-post-typography.ts) — this is the actual
    // fix: without them, list markers are structurally real but visually
    // suppressed by Tailwind's Preflight reset while composing, only
    // appearing once the published renderer (which already had these
    // overrides) takes over.
    proseClassName: cn("text-sm text-[#3a3a44]", communityPostTypographyClasses("#2563eb")),
    minHeightClassName: "min-h-[84px]",
    contentPaddingClassName: "px-0 py-0",
  });

  if (!editor) {
    return <div className="min-h-[84px]" />;
  }

  return (
    <div>
      {toolbarOpen && (
        <div className="mb-2 overflow-x-auto rounded-lg border border-[#E4E4E4]">
          <RichTextToolbar editor={editor} items={COMMUNITY_POST_TOOLBAR} />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
