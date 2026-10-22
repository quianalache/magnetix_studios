import { cn } from "@/lib/utils";

/**
 * The frame every Reading block shares: an optional heading, then the
 * content. Kept plain so the block sits naturally inside whatever section,
 * background and column the page around it provides.
 */
export function BlockSection({
  kind,
  heading,
  intro,
  children,
  className,
}: {
  /** data-reading-block value — handy for QA and analytics. */
  kind: string;
  heading?: string;
  intro?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-reading-block={kind} className={cn("w-full min-w-0 space-y-3", className)}>
      {(heading || intro) && (
        <div className="space-y-1">
          {heading && <h2 className="text-lg font-semibold tracking-tight text-pretty text-foreground sm:text-xl">{heading}</h2>}
          {intro && <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export const CARD = "rounded-2xl border bg-card p-4 sm:p-5";
