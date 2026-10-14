import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type RecordTone = "violet" | "aqua" | "pink" | "blue" | "gold" | "green";
const CHIP: Record<RecordTone, string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
};

/**
 * RecordCard — one item in a card-grid index (forms, QR codes, templates…):
 * white system card, a tinted icon chip (never a gradient tile), title,
 * one or two quiet meta lines, an optional state pill top-right, and an
 * actions row. Visual only — every action is passed in.
 */
export function RecordCard({
  icon: Icon,
  tone = "violet",
  title,
  meta,
  status,
  actions,
  media,
  className,
}: {
  icon?: LucideIcon;
  tone?: RecordTone;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  /** Optional preview (thumbnail, QR image) shown above the title. */
  media?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-card border border-border bg-card p-5 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop",
        className,
      )}
    >
      {media}
      <div className="flex items-start justify-between gap-2">
        {Icon ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-chip", CHIP[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      <h3 className="mt-3 truncate text-section font-semibold text-foreground">{title}</h3>
      {meta ? <div className="mt-0.5 text-caption text-muted-foreground">{meta}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
