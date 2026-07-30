import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared stat/metric card — unifies what used to be independently
 * hand-rolled per page (Dashboard's richer icon/href/loading version and
 * Pipeline's plainer tone-only version). Pass `icon` for the chip
 * treatment; omit it for the plainer look (tone colors the value text
 * directly instead).
 */
export function StatCard({
  href,
  icon,
  label,
  value,
  hint,
  tone,
  iconBg,
  loading,
  className,
}: {
  href?: string;
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Text color utility. Colors the icon chip when `icon` is present, else the value text directly. */
  tone?: string;
  /** Icon chip background utility — only used when `icon` is present. */
  iconBg?: string;
  loading?: boolean;
  className?: string;
}) {
  const content = icon ? (
    <>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          iconBg,
          tone,
        )}
      >
        {icon}
      </span>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <div className="mt-1 h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  ) : (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <div className="mt-1 h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight", tone)}>
          {value}
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  );

  const baseClass = cn(
    "block rounded-2xl border bg-card p-4 transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-[var(--mx-shadow-card,0_1px_2px_rgba(0,0,0,0.06))]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {content}
      </Link>
    );
  }
  return <div className={baseClass}>{content}</div>;
}
