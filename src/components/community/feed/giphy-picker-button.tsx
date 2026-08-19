"use client";

import { useState } from "react";
import { Sticker } from "lucide-react";
import type { IGif } from "@giphy/js-types";
import { GiphyPicker } from "@/components/community/feed/giphy-picker";
import { ComposerActionIconButton } from "@/components/community/feed/composer-action-icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-media-query";

/**
 * The "Add GIF" action-row entry — Part 9's "desktop popover/panel, mobile
 * sheet" chrome around the shared, chrome-agnostic `GiphyPicker`. Neither
 * this file nor `giphy-picker.tsx` import anything from `PostComposer` —
 * used identically by the post composer and the comment composer today,
 * and the intended drop-in for a future Chat GIF button (Part 12) without
 * any changes here.
 */
export function GiphyPickerButton({
  onSelect,
  disabled,
  label = "Add GIF",
}: {
  onSelect: (gif: IGif) => void;
  disabled?: boolean;
  label?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  function pick(gif: IGif) {
    onSelect(gif);
    setOpen(false);
  }

  if (isMobile) {
    return (
      <>
        <ComposerActionIconButton icon={Sticker} label={label} disabled={disabled} onClick={() => setOpen(true)} />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[80vh]">
            <SheetHeader>
              <SheetTitle>{label}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-4 pb-4">
              <GiphyPicker onSelect={pick} className="w-full sm:w-full" gridWidth={320} />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              type="button"
              aria-label={label}
              disabled={disabled}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124] disabled:opacity-40"
            />
          }
        >
          <Sticker className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-2">
        <GiphyPicker onSelect={pick} />
      </PopoverContent>
    </Popover>
  );
}
