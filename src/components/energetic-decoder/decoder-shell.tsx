"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { BookOpen, Home, LayoutTemplate, Palette, ScrollText, Share2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { CS_SCOPE, PageHeader as EditorialHeader } from "@/components/energetic-decoder/content-sets-visuals";
import { TAB_STRIP_CLASS, useActiveTabVisible } from "@/components/energetic-decoder/tab-strip";

/**
 * Energetic Decoder module shell (v2 design proof, owner-approved 2026-10-16).
 *
 * Same structure as every Magnetix module (Projects, Routines, Pipelines):
 * a real page header — icon chip, title, description, actions on the right —
 * with the module's section tabs in the shared pill strip directly under it,
 * at the data width. The module identity is never reduced to an eyebrow.
 *
 *   DecoderIndexPage      operational index pages (Readings, Chart Designs,
 *                         Embeds): the system PageHeader.
 *   DecoderEditorialPage  editorial index pages (Home, Content Sets, Report
 *                         Designs): the approved Content Sets serif header
 *                         with its planet art — one motif per page.
 *
 * Record pages (a reading, a chart design, a report design) don't use the
 * section tabs; they lead with a breadcrumb and their own record header.
 */

export type DecoderTab = "home" | "readings" | "builder" | "content" | "chartDesigns" | "embeds";

export const DECODER_TABS: { key: DecoderTab; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "readings", label: "Readings", icon: ScrollText },
  { key: "builder", label: "Report Builder", icon: LayoutTemplate },
  { key: "content", label: "Content", icon: BookOpen },
  { key: "chartDesigns", label: "Chart Designs", icon: Palette },
  { key: "embeds", label: "Embeds", icon: Share2 },
];

type DecoderNav = { tab: DecoderTab; selectTab: (next: DecoderTab) => void };

const DecoderNavContext = createContext<DecoderNav | null>(null);

export function DecoderNavProvider({ value, children }: { value: DecoderNav; children: ReactNode }) {
  return <DecoderNavContext.Provider value={value}>{children}</DecoderNavContext.Provider>;
}

export function useDecoderNav(): DecoderNav | null {
  return useContext(DecoderNavContext);
}

/**
 * The module's section tabs — the shared pill strip (same look as the
 * Projects section nav). On a phone it scrolls sideways inside itself only
 * (TAB_STRIP_CLASS); the page never scrolls sideways.
 */
export function DecoderSectionNav() {
  const nav = useDecoderNav();
  const tabStripRef = useRef<HTMLDivElement>(null);
  useActiveTabVisible(tabStripRef, nav?.tab);
  if (!nav) return null;
  return (
    <nav aria-label="Energetic Decoder sections" className="-mx-1 min-w-0 px-1">
      <div
        ref={tabStripRef}
        className={`${TAB_STRIP_CLASS} w-fit max-w-full gap-1 rounded-control border border-border bg-card p-1 shadow-card`}
        role="tablist"
        data-module-tabs
      >
        {DECODER_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = nav.tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => nav.selectTab(t.key)}
              className={cn(
                "flex h-(--ds-control-sm) shrink-0 items-center gap-1.5 rounded-lg px-3 text-body-sm font-medium whitespace-nowrap transition-colors",
                isActive ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-3.5", !isActive && "opacity-70")} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Operational index page: system PageHeader → section tabs → content. */
export function DecoderIndexPage({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageShell width="data">
      <PageHeader title={title} description={description} icon={icon} actions={actions} />
      <DecoderSectionNav />
      {children}
    </PageShell>
  );
}

/**
 * Editorial index page: the approved Content Sets serif header (icon tile,
 * serif title, planet art) → section tabs → content. Content Sets, Home and
 * Report Designs share it so they read as one family.
 */
export function DecoderEditorialPage({
  title,
  description,
  icon,
  aside,
  className,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <PageShell width="data" className={cn(CS_SCOPE, className)}>
      <EditorialHeader icon={icon} title={title} description={description} aside={aside} />
      <DecoderSectionNav />
      {children}
    </PageShell>
  );
}
