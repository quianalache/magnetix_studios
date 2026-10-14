import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * PageShell — the one page container for CRM pages (design-system Phase 1).
 *
 * Widths (formalizes CLAUDE.md "Page width convention"):
 *   form — forms, settings, editors, chat, feeds (48rem)
 *   data — tables, dashboards, calendars, reports (64rem)
 *   wide — Contacts list/profile (80rem)
 *   full — Pipeline, builders (no max width)
 *
 * Gutters: it lives inside the CRM <main>, which already supplies 16px on
 * phones and 24px from tablet up; PageShell tops desktop up to 28px. Vertical
 * rhythm is a 24px gap between top-level sections.
 *
 * Use the SAME width for every return of a page — loading, empty, locked,
 * not-found — so the width never jumps (`<PageShellLoading width=…>`).
 */
export type PageShellWidth = "form" | "data" | "wide" | "full";

const WIDTH: Record<PageShellWidth, string> = {
  form: "max-w-page-form",
  data: "max-w-page-data",
  wide: "max-w-page-wide",
  full: "max-w-none",
};

export function PageShell({
  width = "data",
  className,
  children,
}: {
  width?: PageShellWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-page-shell={width} className={cn("mx-auto flex w-full min-w-0 flex-col gap-6 lg:px-1", WIDTH[width], className)}>
      {children}
    </div>
  );
}

/** Loading state at the page's own width: a header placeholder plus content blocks. */
export function PageShellLoading({ width = "data", blocks = 2 }: { width?: PageShellWidth; blocks?: number }) {
  return (
    <PageShell width={width}>
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {Array.from({ length: blocks }, (_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-card" />
      ))}
    </PageShell>
  );
}
