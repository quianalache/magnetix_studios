"use client";

import { useEffect } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { lessonBodyToEditorHtml } from "@/lib/community/lesson-html-shared";
import { cn } from "@/lib/utils";
import {
  headingLevelsFromToolbar,
  type RichTextToolbarItem,
} from "./rich-text-toolbar-items";
import {
  CommunityMention,
  CommunityChannelRef,
  mentionSuggestionConfig,
  channelRefSuggestionConfig,
} from "./community-mention-extensions";
import type { MentionSuggestionItem } from "./mention-suggestion";

/**
 * ONE shared TipTap editor setup + extension-registration mechanism.
 * Every current Magnetix rich-text editor (About today; Course/Lesson,
 * Community post/comment configs later) is meant to build its `extensions`
 * array through this hook rather than hand-rolling `useEditor` calls that
 * quietly drift apart, which is what happened with `RichTextEditor` and
 * `AboutRichTextEditor` before this Phase A extraction.
 *
 * Deliberately does NOT know about images, video/embeds, or dictation —
 * those are additive extensions a specific consumer (Lesson editing today)
 * layers on top; keeping them out of the shared core is what lets a config
 * like a future Community post editor exist with zero media capability by
 * simply not asking for it, rather than needing to actively opt out of
 * extensions bundled in by default.
 */
export function useRichTextEditor({
  toolbar,
  value,
  onChange,
  disabled,
  proseClassName,
  minHeightClassName,
  contentPaddingClassName = "px-3 py-2.5",
  mentions,
  channelRefs,
}: {
  /** Drives which StarterKit sub-features are enabled (currently only
   *  heading levels vary this way) and whether the Underline extension is
   *  registered at all — see the Phase A report for why the OTHER
   *  StarterKit-bundled marks/nodes (bold/italic/strike/code/lists/
   *  blockquote) are always left at StarterKit's own default-enabled
   *  state regardless of which toolbar buttons are shown, matching
   *  `AboutRichTextEditor`'s existing (undocumented but real) behavior
   *  exactly — this refactor changes nothing about that. */
  toolbar: RichTextToolbarItem[];
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  proseClassName: string;
  minHeightClassName: string;
  /** Defaults to the padding both existing consumers (About, Lesson) use
   *  inside their own bordered box. A config that wants the editor to sit
   *  flush inside a parent that already has its own padding (Phase B's
   *  Community composer, which blends into its card the way the plain
   *  textarea it replaces did) can override it — added specifically for
   *  that, not a speculative knob. */
  contentPaddingClassName?: string;
  /** Phase D — Community post @ mentions. Omit entirely for every other
   *  consumer (About, Lesson); this is opt-in, not a shared-core default. */
  mentions?: { fetchItems: (query: string) => Promise<MentionSuggestionItem[]> };
  /** Phase D — Community post # channel references. Same opt-in shape as
   *  `mentions`, sharing the suggestion dropdown architecture (see
   *  mention-suggestion.ts) rather than a second autocomplete system. */
  channelRefs?: { fetchItems: (query: string) => Promise<MentionSuggestionItem[]> };
}) {
  const headingLevels = headingLevelsFromToolbar(toolbar);
  const needsUnderline = toolbar.includes("underline");

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: headingLevels.length ? { levels: headingLevels } : false,
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      ...(needsUnderline ? [Underline] : []),
      ...(mentions
        ? [CommunityMention.configure({ suggestion: mentionSuggestionConfig(mentions.fetchItems) })]
        : []),
      ...(channelRefs
        ? [
            CommunityChannelRef.configure({
              suggestion: channelRefSuggestionConfig(channelRefs.fetchItems),
            }),
          ]
        : []),
    ],
    content: lessonBodyToEditorHtml(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(proseClassName, "focus:outline-none", minHeightClassName, contentPaddingClassName),
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Keep the editor in sync with externally-changed `value` (e.g. a
  // Firestore onSnapshot handing back fresh content) without fighting the
  // user's own in-progress edits — only re-sets content when it actually
  // differs from what's already rendered.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(lessonBodyToEditorHtml(value), { emitUpdate: false });
    }
  }, [editor, value]);

  return editor;
}
