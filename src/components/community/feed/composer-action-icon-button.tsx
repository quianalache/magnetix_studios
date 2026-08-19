"use client";

import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * ONE visible, always-shown action-row icon button — the replacement for
 * the old consolidated "+" Popover (Part 5: "no more mystery Aa/+
 * drawers"). Every post-composer action (photo/video/voice/file/GIF/
 * mention/channel-ref/poll) renders through this exact component so they
 * share one look, one a11y contract (real `aria-label` + a base-ui
 * `Tooltip` that responds to keyboard focus, not just hover — a plain
 * `title` attribute doesn't reliably show on focus, which is why this
 * exists instead of just adding `title` to each button) and one disabled/
 * active visual language. `onMouseDown` preventDefault matches the same
 * fix `ToolbarBtn` (rich-text-toolbar-items.tsx) already established, for
 * the same reason: a click on this button must never blur/collapse the
 * editor's selection before its own handler runs.
 */
export function ComposerActionIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: LucideIcon;
  /** Both the tooltip text AND the aria-label — one string, one source of
   *  truth, never two labels that could drift apart. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124] disabled:cursor-not-allowed disabled:opacity-40",
              active && "bg-[#F0F0F0] text-[#202124]",
            )}
          />
        }
      >
        <Icon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
