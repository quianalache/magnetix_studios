"use client";

import { ChevronDown } from "lucide-react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@/lib/utils";

/**
 * Thin base-ui wrapper matching this repo's existing convention
 * (dialog.tsx, switch.tsx, popover.tsx — `data-slot` + Tailwind classes
 * over an unstyled base-ui primitive, no new dependency). Added for
 * Pages & Funnels System A (the shared Styles field's collapsible
 * Typography/Spacing/Border/Shadow/Responsive/Visibility groups) but
 * generic enough for any future collapsible section elsewhere in the CRM.
 */
function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0",
        className
      )}
      {...props}
    />
  );
}

/**
 * Pre-styled trigger — a full-width row with a label and a chevron that
 * rotates open/closed, matching the density of this Settings panel's other
 * controls (SegmentedControl, ColorInput). Not every consumer needs this
 * exact look, so it's a separate named export rather than baked into
 * `Collapsible` itself.
 */
function CollapsibleGroupTrigger({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-group-trigger"
      className={cn(
        "group text-muted-foreground hover:text-foreground flex w-full items-center justify-between rounded-md py-1.5 text-left text-xs font-semibold transition-colors",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-data-[panel-open]:rotate-180" />
    </CollapsiblePrimitive.Trigger>
  );
}

export { Collapsible, CollapsibleContent, CollapsibleGroupTrigger };
