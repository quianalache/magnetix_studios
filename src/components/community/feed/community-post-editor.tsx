"use client";

import { useEffect } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { useRichTextEditor } from "@/components/editor/use-rich-text-editor";
import { RichTextToolbar, type RichTextToolbarItem } from "@/components/editor/rich-text-toolbar-items";
import type { MentionSuggestionItem } from "@/components/editor/mention-suggestion";
import {
  communityPostLinkColorStyle,
  communityPostTypographyClasses,
} from "@/components/community/feed/community-post-typography";
import { cn } from "@/lib/utils";

/**
 * Community post composer body — a text-formatting-only configuration of
 * the Phase A shared rich-text core, plus (Phase D) opt-in @ mention / #
 * channel-reference suggestions. No headings, no images, no code blocks,
 * no arbitrary embeds — media/GIF/file/video attachments remain the
 * composer's own attachment tray below the editor, never inline nodes
 * inside it (see the Phase D report for why).
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
  brand,
  mentions,
  channelRefs,
  onEditorReady,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Controlled by the parent composer's "Aa" button — see feed-view.tsx.
   *  Collapsing this does NOT remove any formatting already applied to
   *  the text; it only hides the button row. */
  toolbarOpen: boolean;
  /** Same tenant brand color CommunityPostBody renders published links
   *  with — see communityPostLinkColorStyle. */
  brand: string;
  /** Phase D — @ mention autocomplete data source. Omit to disable
   *  mentions entirely (kept optional so a future non-Community consumer
   *  of this component, if one ever exists, doesn't inherit it for free). */
  mentions?: { fetchItems: (query: string) => Promise<MentionSuggestionItem[]> };
  /** Phase D — # channel-reference autocomplete data source. */
  channelRefs?: { fetchItems: (query: string) => Promise<MentionSuggestionItem[]> };
  /** Phase D — hands the live TipTap editor instance up to the parent
   *  composer, which needs it for the Emoji action (insert-at-cursor is a
   *  content operation, not something the composer can do without a
   *  reference to the SAME editor instance this component owns). */
  onEditorReady?: (editor: Editor | null) => void;
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
    proseClassName: cn("text-sm text-[#3a3a44]", communityPostTypographyClasses()),
    minHeightClassName: "min-h-[84px]",
    contentPaddingClassName: "px-0 py-0",
    mentions,
    channelRefs,
  });

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    // Also clear the reference on unmount, so a stale editor instance is
    // never handed back to a still-mounted parent (e.g. Cancel closing
    // this editor while the composer chrome remains).
    return () => onEditorReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) {
    return <div className="min-h-[84px]" />;
  }

  return (
    <div style={communityPostLinkColorStyle(brand)}>
      {toolbarOpen && (
        <div className="mb-2 overflow-x-auto rounded-lg border border-[#E4E4E4]">
          <RichTextToolbar editor={editor} items={COMMUNITY_POST_TOOLBAR} />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
