import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Motif } from "@/components/brand/motif";

/**
 * Empty / zero state (design-system Phase 1): an icon chip (or the approved
 * spark-cluster motif for celebratory/first-run moments), a title, one line of
 * help, and at most one primary action.
 */
export function EmptyState({
  icon: Icon,
  sparks = false,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  /** Use the spark-cluster motif instead of an icon (first-run / success moments). */
  sparks?: boolean;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong bg-card text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-12",
        className,
      )}
    >
      {sparks ? (
        <span className="relative block size-16">
          <Motif kind="sparks" size="header" placement="static" />
        </span>
      ) : Icon ? (
        <span className="flex size-11 items-center justify-center rounded-chip bg-tint-violet text-link">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <p className="text-section font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-body-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
