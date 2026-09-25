"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared shell for the contact's related-record cards (Deals, Tasks,
 * Projects, Submitted Forms, Purchases & Access, Quotes) — Contacts
 * redesign, 2026-09-25. Renders the same card look those components already
 * had; with `collapsible` (the profile's right panel) the header gains a
 * chevron and the body can be folded away, remembered per section in
 * localStorage (a per-viewer convenience only).
 */

const STORAGE_PREFIX = "ls:contact-related:";

function useCollapsed(key: string | null): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!key) return;
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_PREFIX + key) === "1");
    } catch {
      // storage unavailable — stay expanded
    }
  }, [key]);
  function set(v: boolean) {
    setCollapsed(v);
    if (!key) return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, v ? "1" : "0");
    } catch {
      // ignore
    }
  }
  return [collapsed, set];
}

export interface RelatedCardProps {
  title: string;
  /** One-line summary under the title ("2 open", "3 submissions", …). */
  summary?: ReactNode;
  icon?: ReactNode;
  /** Header action (e.g. "+ Add deal"). Hidden while collapsed. */
  action?: ReactNode;
  /** Enables the fold toggle; the value is the localStorage key. */
  collapsible?: string | null;
  className?: string;
  children: ReactNode;
}

export function RelatedCard({
  title,
  summary,
  icon,
  action,
  collapsible = null,
  className,
  children,
}: RelatedCardProps) {
  const [collapsed, setCollapsed] = useCollapsed(collapsible);
  const bodyId = collapsible ? `related-${collapsible}` : undefined;

  const heading = (
    <div className="flex min-w-0 items-center gap-2">
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      <div className="min-w-0 text-left">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {summary !== undefined && (
          <p className="mt-0.5 truncate text-sm font-semibold">{summary}</p>
        )}
      </div>
    </div>
  );

  return (
    <section className={cn("rounded-xl border bg-card p-4", className)} aria-label={title}>
      <div className={cn("flex items-center justify-between gap-2", !collapsed && "mb-3")}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                collapsed && "-rotate-90",
              )}
            />
            {heading}
          </button>
        ) : (
          heading
        )}
        {!collapsed && action && <div className="shrink-0">{action}</div>}
      </div>
      {!collapsed && <div id={bodyId}>{children}</div>}
    </section>
  );
}
