import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Motif, MotifFrame, type MotifKind } from "@/components/brand/motif";

/**
 * MomentHero — the approved moment-page hero band (Dashboard, proof pages
 * 2026-10-14): soft lavender/blush wash, a DM Serif Display line, a quiet
 * subtitle, and the page's ONE motif on the right (hidden on phones so it
 * never crowds the text). Clipped frame, so the motif can't escape the card.
 * Approved moment pages only — operational pages never use it.
 */
export function MomentHero({
  eyebrow,
  title,
  description,
  aside,
  motif = "planet",
  className,
}: {
  eyebrow?: ReactNode;
  /** Rendered as an h2 in the display serif — the page's h1 is the PageHeader. */
  title: ReactNode;
  description?: ReactNode;
  /** Optional right-side content (e.g. an action) — sits beside the motif from md up. */
  aside?: ReactNode;
  motif?: MotifKind;
  className?: string;
}) {
  return (
    <MotifFrame className={cn("mx-hero-wash rounded-card border p-4.5 sm:px-8 sm:py-7", className)}>
      <Motif kind={motif} size="hero" placement="static" hideBelow="sm" className="absolute right-6 top-1/2 -translate-y-1/2 lg:right-16" />
      <div className="relative z-10 flex flex-col gap-4 sm:pr-44 md:flex-row md:items-end md:justify-between lg:pr-56">
        <div className="min-w-0 max-w-xl">
          {eyebrow ? <p className="text-caption font-medium text-muted-foreground">{eyebrow}</p> : null}
          <h2 className="mt-1.5 font-display text-[1.75rem] leading-[1.05] font-normal tracking-tight text-foreground text-balance sm:text-display-md lg:text-display-lg">{title}</h2>
          {description ? <p className="mt-1.5 text-body-sm text-muted-foreground sm:mt-2 sm:text-sm">{description}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </MotifFrame>
  );
}
