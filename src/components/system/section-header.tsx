import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Heading for a section or card inside a page (h2 by default) — title, optional description, right-side action. */
export function SectionHeader({
  title,
  description,
  action,
  icon: Icon,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    // Wraps: when a wide action (two buttons, a week picker) doesn't fit beside
    // the title on a narrow screen, it drops below instead of crushing it.
    <div className={cn("flex flex-wrap items-start gap-x-3 gap-y-2", className)}>
      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-link">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-48 flex-1">
        <Heading className="text-section font-semibold text-foreground">{title}</Heading>
        {description ? <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
