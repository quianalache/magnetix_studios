"use client";

import { useEffect, type RefObject } from "react";

/**
 * Energetic Decoder tab strips (2026-10-07 mobile pass). A strip that can't
 * fit its tabs scrolls sideways inside itself only:
 *   - `touch-pan-x` — touch drags on the strip pan it horizontally; a
 *     vertical swipe is left to the page instead of nudging the strip
 *   - `overscroll-x-contain` — reaching the strip's end never drags the page
 *   - `overflow-y-hidden` — the strip can't be moved vertically at all
 *   - the scrollbar is hidden (the tabs themselves show there's more)
 */
export const TAB_STRIP_CLASS =
  "flex min-w-0 touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden data-[more=true]:[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)]";

/**
 * Keeps the active tab (`aria-selected="true"`) in view by scrolling the
 * strip itself — never the page — and marks `data-more="true"` while tabs
 * are hidden past the right edge (the strip fades out there as the cue).
 */
export function useActiveTabVisible(stripRef: RefObject<HTMLElement | null>, activeKey: string | null | undefined) {
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => {
      strip.dataset.more = String(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2);
    };
    update();
    strip.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(strip);
    return () => {
      strip.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [stripRef]);

  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !active) return;
    const left = active.offsetLeft - strip.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = Math.max(0, left - 16);
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth + 16;
  }, [stripRef, activeKey]);
}
