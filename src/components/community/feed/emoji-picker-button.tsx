"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import type { EmojiClickData } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// emoji-picker-react renders its own large emoji grid/search UI — loaded
// lazily so it never inflates the composer's initial bundle for members
// who never open it (the same reasoning as any other rarely-used, large
// UI chunk in this codebase). `ssr: false` because it reads from
// `window`/`navigator` (locale/skin-tone detection) at import time.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

/**
 * Composer-level "insert an emoji at the cursor" action — distinct from
 * the Aa rich-text toolbar (this isn't a formatting command, it's content
 * insertion), matching the Phase D composer action row spec. Needs the
 * live TipTap `Editor` instance from `CommunityPostEditor` (exposed via
 * its `onEditorReady` callback) rather than owning any editor state
 * itself — there is still exactly one editor instance.
 */
export function EmojiPickerButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);

  function insert(data: EmojiClickData) {
    editor?.chain().focus().insertContent(data.emoji).run();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        title="Emoji"
        aria-label="Emoji"
        disabled={!editor}
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124] disabled:opacity-40"
      >
        <Smile className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <EmojiPicker onEmojiClick={insert} height={360} width={320} />
      </PopoverContent>
    </Popover>
  );
}
