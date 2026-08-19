"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * New primitive (Phase D) — `@base-ui/react/tooltip` was already a
 * dependency (a peer of the other `@base-ui/react/*` parts already wrapped
 * in this folder) but nothing here used it yet. Added specifically for the
 * post composer's action-row icon buttons (Part 5: every icon needs a real
 * tooltip string, not just a `title` attribute, plus keyboard-focus and
 * mobile-accessible-without-hover support) — `title` alone doesn't focus-
 * trigger or work well on touch, which is exactly what this primitive
 * covers. Same shape as this folder's Popover/Dialog/Sheet wrappers:
 * `TooltipTrigger` takes a `render` override so it becomes the actual
 * button element (no nested `<button>`s), matching how `SheetClose`/
 * `DialogClose` already compose with `Button` elsewhere in this codebase.
 *
 * `TooltipProvider` is exported separately, not auto-wrapped into
 * `Tooltip` itself — Base UI's own grouping behavior (adjacent tooltips
 * open instantly once one is already open) only works when a whole row of
 * them shares ONE provider, so a caller with several tooltips in a row
 * (e.g. the composer's action-row icons) wraps the group once, not each
 * icon individually.
 */
function TooltipProvider({
  delay = 200,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: TooltipPrimitive.Popup.Props & {
  sideOffset?: number
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner sideOffset={sideOffset} className="z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "w-fit max-w-64 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
