"use client";

import Link from "next/link";
import {
  Archive,
  ListChecks,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Repeat,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { Pagination as SystemPagination } from "@/components/system/pagination";

export type ProjectsSection = "overview" | "tasks" | "routines" | "templates" | "archived";

/**
 * Shared header + section tabs for the Projects module (approved redesign,
 * Sept 2026): Overview · My Tasks · Routines · Templates · Archived. Assets is
 * deliberately NOT a tab here — it is moving to its own top-level module
 * (approved change A). The same four destinations are nested under
 * Projects in the sidebar.
 */
export const PROJECTS_SECTIONS: {
  id: ProjectsSection;
  label: string;
  href: string;
  icon: typeof FolderKanban;
}[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/projects",
    icon: LayoutDashboard,
  },
  { id: "tasks", label: "My Tasks", href: "/projects/tasks", icon: ListChecks },
  { id: "routines", label: "Routines", href: "/projects/routines", icon: Repeat },
  {
    id: "templates",
    label: "Templates",
    href: "/projects/templates",
    icon: LayoutTemplate,
  },
  {
    id: "archived",
    label: "Archived",
    href: "/projects/archived",
    icon: Archive,
  },
];

export function ProjectsShell({
  active,
  actions,
  children,
  wide = false,
  heading = "Projects",
  subheading = "Plan, manage, and deliver your work — from ideas to implementation.",
}: {
  active: ProjectsSection;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Section pages (Routines) may name themselves; defaults to "Projects". */
  heading?: string;
  subheading?: string;
  /** Template library with its docked preview needs the extra room. */
  wide?: boolean;
}) {
  const { saPath } = useSubAccount();
  return (
    <PageShell width={wide ? "wide" : "data"}>
      <PageHeader
        title={heading}
        description={subheading}
        icon={FolderKanban}
        // Overview tracks project progress → the small orbit (Wave 2). The
        // denser sections (tasks, routines, templates, archive) stay quiet.
        accent={active === "overview" ? "orbit" : undefined}
        actions={actions}
      />

      {/* Section nav — approved pill tabs; scrolls sideways inside its own
          strip on phones instead of wrapping or widening the page. */}
      <nav aria-label="Projects sections" className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max gap-1 rounded-control border border-border bg-card p-1 shadow-card">
          {PROJECTS_SECTIONS.map((s) => {
            const isActive = s.id === active;
            const Icon = s.icon;
            return (
              <Link
                key={s.id}
                href={saPath(s.href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-(--ds-control-sm) shrink-0 items-center gap-1.5 rounded-lg px-3 text-body-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className={cn("size-3.5", !isActive && "opacity-70")} aria-hidden="true" />
                {s.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </PageShell>
  );
}

/**
 * Metric tile — same look as the system MetricCard (tinted round icon chip,
 * label, value, hint). Kept as its own component because callers pass a
 * ReactNode icon and a tone class.
 */
export function ProjectsMetric({
  icon,
  tone,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  /** Utility classes for the icon disc, e.g. "bg-tag-violet-bg text-tag-violet-fg". */
  tone: string;
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-card border border-border bg-card p-4 shadow-card sm:gap-4">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full sm:size-11", tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-caption text-muted-foreground">{label}</p>
        <p className="text-title-md leading-tight font-semibold tracking-tight tabular-nums sm:text-title-lg">{value}</p>
        {hint && <p className="truncate text-caption text-ink-tertiary max-sm:hidden">{hint}</p>}
      </div>
    </div>
  );
}

/** Thin adapter over the system Pagination (keeps this module's prop names). */
export function Pagination({
  page,
  total,
  pageSize,
  noun,
  onPage,
}: {
  page: number;
  pageCount?: number;
  total: number;
  pageSize: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return <SystemPagination page={page} pageSize={pageSize} total={total} onPageChange={onPage} itemLabel={noun} />;
}

export function usePaged<T>(items: T[], pageSize: number, page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return {
    pageCount,
    page: safePage,
    rows: items.slice((safePage - 1) * pageSize, safePage * pageSize),
  };
}
