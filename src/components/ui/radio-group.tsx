"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "@/lib/utils"

/**
 * Magnetix RadioGroup (design-system Phase 1) on Base UI. Pair each item with
 * a <Label> (wrap both in the label, or use htmlFor) so the text is clickable.
 *
 *   <RadioGroup value={mode} onValueChange={setMode} aria-label="Send mode">
 *     <label className="flex items-center gap-2"><RadioGroupItem value="now" /> Send now</label>
 *     <label className="flex items-center gap-2"><RadioGroupItem value="later" /> Schedule</label>
 *   </RadioGroup>
 */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn("grid gap-2.5", className)} {...props} />
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-card transition-colors outline-none after:absolute after:-inset-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-checked:border-primary data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="size-1.5 rounded-full bg-primary-foreground" />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
