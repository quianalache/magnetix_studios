import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Toolbar row above a table or list (design-system Phase 1): search on the
 * left, filters after it, trailing actions (view toggle, export) on the right.
 * Wraps on narrow screens instead of overflowing.
 */
export function FilterBar({
  search,
  filters,
  actions,
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {search ? <div className="min-w-[12rem] flex-1 sm:max-w-sm">{search}</div> : null}
      {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
