import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordTone } from "@/components/system/record-card";

const CHIP: Record<RecordTone, string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
};

/**
 * NavCard — a hub tile that links to a section (Email → Broadcasts /
 * Templates, Agency → Communications, …): white card, tinted icon chip,
 * title, one line of description and a quiet "Go to …" link line.
 */
export function NavCard({
  href,
  icon: Icon,
  tone = "violet",
  title,
  description,
  actionLabel,
  className,
}: {
  href: string;
  icon: LucideIcon;
  tone?: RecordTone;
  title: ReactNode;
  description?: ReactNode;
  actionLabel?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-card border border-border bg-card p-5 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-chip", CHIP[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-section font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actionLabel ? (
        <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-link">
          {actionLabel}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      ) : null}
    </Link>
  );
}
