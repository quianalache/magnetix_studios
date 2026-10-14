import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MetricCard — the approved Visual Direction 2 stat card (proof pages,
 * 2026-10-14): white card, round tinted icon chip on the left, label, value,
 * one quiet hint line. On phones it compacts to the approved 2-up tile
 * (chip above value, hint hidden). Tones come from the tag palette so every metric page
 * draws from the same five accents. Whole card is a link when `href` is set.
 *
 * Shows live values only — no invented trends or sparklines.
 */
export type MetricTone = "violet" | "aqua" | "pink" | "blue" | "gold" | "green";

const CHIP: Record<MetricTone, string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
};

export function MetricCard({
  icon: Icon,
  tone = "violet",
  label,
  value,
  hint,
  href,
  loading,
  className,
}: {
  icon: LucideIcon;
  tone?: MetricTone;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  loading?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full sm:size-11", CHIP[tone])}>
        <Icon className="size-4 sm:size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-caption text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-20" />
        ) : (
          <p className="truncate text-title-md font-semibold tracking-tight text-foreground tabular-nums sm:text-title-lg">{value}</p>
        )}
        {hint ? <p className="truncate text-caption text-ink-tertiary max-sm:hidden">{hint}</p> : null}
      </div>
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-col items-start gap-2 rounded-card border border-border bg-card p-3 shadow-card sm:flex-row sm:items-center sm:gap-3.5 sm:p-4",
    href && "outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/50",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
