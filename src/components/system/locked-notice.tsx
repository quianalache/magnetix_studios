import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Locked by your agency" state (proof pages, 2026-10-14) — one look for every
 * agency-gated feature: a neutral lock chip, a short title, and what to do
 * next. Purely presentational; the gate itself is enforced server-side.
 */
export function LockedNotice({
  title = "Locked by your agency",
  children,
  action,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-locked-notice=""
      className={cn("flex items-start gap-3 rounded-control border border-border bg-surface-sunken/60 p-4", className)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-tag-gray-bg text-tag-gray-fg">
        <Lock className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold text-foreground">{title}</p>
        {children ? <div className="mt-0.5 text-caption text-muted-foreground">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
