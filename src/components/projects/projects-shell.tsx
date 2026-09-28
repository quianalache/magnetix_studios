"use client";

import Link from "next/link";
import {
  Archive,
  ListChecks,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";

export type ProjectsSection = "overview" | "tasks" | "templates" | "archived";

/**
 * Shared header + section tabs for the Projects module (approved redesign,
 * Sept 2026): Overview · My Tasks · Templates · Archived. Assets is
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
}: {
  active: ProjectsSection;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Template library with its docked preview needs the extra room. */
  wide?: boolean;
}) {
  const { saPath } = useSubAccount();
  return (
    <div
      className={cn(
        "momentum-scope mx-auto w-full space-y-6 rounded-2xl",
        wide ? "max-w-7xl" : "max-w-6xl"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-200 to-violet-300 text-violet-700 shadow-sm dark:from-pink-500/30 dark:to-violet-500/40 dark:text-violet-100"
            aria-hidden
          >
            <FolderKanban className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Plan, manage, and deliver your work — from ideas to
              implementation.
            </p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>

      <nav
        aria-label="Projects sections"
        className="bg-muted/60 flex w-fit max-w-full flex-wrap gap-1 rounded-xl p-1"
      >
        {PROJECTS_SECTIONS.map((s) => {
          const isActive = s.id === active;
          const Icon = s.icon;
          return (
            <Link
              key={s.id}
              href={saPath(s.href)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary shadow-xs"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              )}
            >
              <Icon
                className={cn("h-3.5 w-3.5", !isActive && "opacity-60")}
              />
              {s.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

/** Mockup-style metric tile: tinted icon disc + value + label (+ hint). */
export function ProjectsMetric({
  icon,
  tone,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  /** Utility classes for the icon disc, e.g. "bg-violet-500/10 text-violet-600". */
  tone: string;
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-xs">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          tone
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl leading-tight font-semibold tabular-nums">
          {value}
        </p>
        <p className="text-muted-foreground truncate text-sm">{label}</p>
        {hint && (
          <p className="text-muted-foreground/80 truncate text-xs">{hint}</p>
        )}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  noun,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  // Compact window around the current page so very large lists stay tidy.
  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  for (let p = start; p <= Math.min(pageCount, start + 4); p++) pages.push(p);
  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-muted-foreground text-sm">
        Showing {from}–{to} of {total} {noun}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <PageButton
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            label="Previous page"
          >
            ‹
          </PageButton>
          {pages.map((p) => (
            <PageButton
              key={p}
              active={p === page}
              onClick={() => onPage(p)}
              label={`Page ${p}`}
            >
              {p}
            </PageButton>
          ))}
          <PageButton
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
            label="Next page"
          >
            ›
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({
  children,
  active,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors disabled:opacity-40",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "bg-card hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
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
