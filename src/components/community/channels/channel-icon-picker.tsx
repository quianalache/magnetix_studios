"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MoreHorizontal } from "lucide-react";
import type { EmojiClickData } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Same lazy-load pattern as emoji-picker-button.tsx — the full picker's
// large emoji grid/search UI only loads once someone actually opens
// "more," never inflating the Create Channel/Section modal's own bundle.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

/** A small, curated quick-pick row — the approved mock-up's own "sparkle,
 *  speech-bubble, mic, fire, plant, target, …(more)" row. Not exhaustive
 *  on purpose (that's what "more" is for). */
const QUICK_PICKS = ["✨", "💬", "🎙️", "🔥", "🌱", "🎯", "📚", "💡", "🎉", "❤️", "📢", "☕"];

/**
 * The ONE icon-selection pattern Create Channel and Create Section both
 * use (Part "Icon Picker — Consistency Requirement") — currently-selected
 * icon shown clearly, a curated quick-pick row, and a "browse more" trigger
 * into the full `emoji-picker-react` grid this codebase already uses
 * elsewhere (EmojiPickerButton). Always emits a plain emoji string, never
 * a component/icon name — the value this stores IS what gets rendered
 * directly as text everywhere a Channel/Section icon appears.
 */
export function ChannelIconPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (emoji: string) => void;
  label?: React.ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  function pick(emoji: string) {
    onChange(emoji);
    setMoreOpen(false);
  }

  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium text-[#202124]">{label}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 text-lg"
          style={{ borderColor: "#7C3AED" }}
          aria-label="Selected icon"
        >
          {value || "🙂"}
        </div>
        <span className="mx-1 h-6 w-px bg-[#E4E4E4]" />
        {QUICK_PICKS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => pick(emoji)}
            title={emoji}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-[#F5F4F2]",
              value === emoji && "bg-[#F0F0F0]",
            )}
          >
            {emoji}
          </button>
        ))}
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger
            type="button"
            title="More icons"
            aria-label="More icons"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#909090] hover:bg-[#F5F4F2] hover:text-[#202124]"
          >
            <MoreHorizontal className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <EmojiPicker
              onEmojiClick={(data: EmojiClickData) => pick(data.emoji)}
              height={360}
              width={320}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
