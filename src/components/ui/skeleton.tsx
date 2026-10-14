import * as React from "react"

import { cn } from "@/lib/utils"

/** Loading placeholder (design-system Phase 1). Size it like the content it stands in for so nothing jumps. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
