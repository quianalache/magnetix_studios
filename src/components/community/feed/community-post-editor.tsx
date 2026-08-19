"use client";

import { useEffect } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { useRichTextEditor } from "@/components/editor/use-rich-text-editor";
import type { RichTextToolbarItem } from "@/components/editor/rich-text-toolbar-items";
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
 * Composed directly from `useRichTextEditor` (the same shared core
 * `RichTextEditorCore` is built from) rather than mounting
 * `RichTextEditorCore` itself — Community wants the editor to sit flush
 * inside its own card (no boxed/bordered editor, matching the plain
 * textarea it replaces). Formatting-menu UX refinement (2026-08-20): the
 * toolbar used to render INSIDE this component, directly above
 * `EditorContent` — which sat near the TOP of the composer card while the
 * "Aa" toggle that revealed it lived in the action row at the BOTTOM,
 * so tapping it made a new control strip appear far from where the member
 * was actually looking/tapping ("teleporting," per the explicit product
 * complaint). The toolbar now renders in `PostComposer` itself, inside a
 * `Popover` anchored to the SAME "Aa" button that toggles it — this
 * component only owns the editor content area and hands its `editor`
 * instance up via `onEditorReady`, same as it already did for the Emoji
 * button. `COMMUNITY_POST_TOOLBAR` is exported so `PostComposer` builds
 * its `RichTextToolbar` from the exact same item list, not a second one
 * that could quietly drift out of sync.
 */
export const COMMUNITY_POST_TOOLBAR: RichTextToolbarItem[] = [
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
  brand,
  mentions,
  channelRefs,
  onEditorReady,
}: {
  value: string;
  onChange: (html: string) => void;
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
      <EditorContent editor={editor} />
    </div>
  );
}
