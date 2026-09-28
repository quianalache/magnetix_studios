"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronDown, FolderOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the Assets section (approved 2026-09 designs):
 * header, the four area tabs, stat tiles, filter pills, pagination and
 * small formatting helpers. Colours come from the theme tokens so light and
 * dark both work; accents use Tailwind's violet/pink scale like Projects.
 */

export type AssetsTab = "resources" | "crm" | "media" | "affiliates";

export function AssetsHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-200 to-violet-300 text-violet-700 shadow-sm dark:from-pink-500/30 dark:to-violet-500/40 dark:text-violet-100"
        >
          <FolderOpen className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Organize your resources, CRM materials, media, and affiliate programs in one place.
          </p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function AssetsTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: AssetsTab; label: string; icon: LucideIcon }[];
  active: AssetsTab;
  onChange: (t: AssetsTab) => void;
}) {
  return (
    <nav aria-label="Assets sections" className="bg-muted/60 flex w-fit max-w-full flex-wrap gap-1 rounded-2xl p-1">
      {tabs.map((t) => {
        const on = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
              on ? "bg-primary/10 text-primary shadow-xs" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            <Icon className={cn("h-4 w-4", !on && "opacity-70")} />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

const TONES = {
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-300",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  blue: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
} as const;
export type Tone = keyof typeof TONES;

export function StatTile({
  icon: Icon,
  tone,
  value,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  tone: Tone;
  value: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        "bg-card flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left shadow-xs transition-colors sm:gap-4 sm:p-4",
        onClick && "hover:border-primary/40",
        active && "border-primary/50 ring-primary/20 ring-2"
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12", TONES[tone])}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold tabular-nums sm:text-2xl">{value}</span>
        <span className="text-muted-foreground block text-sm leading-tight">{label}</span>
      </span>
      {onClick && <ChevronRight className="text-muted-foreground hidden h-4 w-4 shrink-0 sm:block" />}
    </Comp>
  );
}

/** Native select styled as the design's filter pill (keeps keyboard + mobile pickers). */
export function FilterSelect({
  id,
  icon: Icon,
  value,
  onChange,
  options,
  label,
}: {
  id: string;
  icon?: LucideIcon;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <label className="bg-card focus-within:ring-ring/40 relative flex h-10 min-w-0 items-center gap-2 rounded-xl border pr-8 pl-3 text-sm focus-within:ring-2">
      {Icon && <Icon className="text-muted-foreground h-4 w-4 shrink-0" />}
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent font-medium outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute right-2.5 h-4 w-4" />
    </label>
  );
}

export function Pager({
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
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => pageCount <= 7 || p === 1 || p === pageCount || Math.abs(p - page) <= 1
  );
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm tabular-nums">
        Showing {from}–{to} of {total} {noun}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" className="bg-card hover:bg-muted flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.map((p, i) => (
            <span key={p} className="flex items-center gap-1.5">
              {i > 0 && pages[i - 1] !== p - 1 && <span className="text-muted-foreground px-1">…</span>}
              <button
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm tabular-nums",
                  p === page ? "border-primary/40 bg-primary/10 text-primary font-semibold" : "bg-card hover:bg-muted"
                )}
              >
                {p}
              </button>
            </span>
          ))}
          <button type="button" className="bg-card hover:bg-muted flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40" disabled={page === pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function EmptyPanel({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bg-card flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
      <span className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: "green" | "amber" | "gray" | "violet"; children: React.ReactNode }) {
  const cls = {
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    gray: "bg-muted text-muted-foreground",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  }[tone];
  const dot = { green: "bg-emerald-500", amber: "bg-amber-500", gray: "bg-muted-foreground/60", violet: "bg-violet-500" }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {children}
    </span>
  );
}

const PILL_TONES = [
  "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
];

/** Stable colour per label (type / area / category pills). */
export function TagPill({ label, className }: { label: string; className?: string }) {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className={cn("inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", PILL_TONES[h % PILL_TONES.length], className)}>
      {label}
    </span>
  );
}

export function Initials({ name }: { name: string | null }) {
  const text = (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold" title={name ?? undefined}>
      {text}
    </span>
  );
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(s: number | null): string {
  if (!s && s !== 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Recognisable name for a resource link's host (Google Drive, Notion, Canva…). */
export function linkSource(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "External link";
  }
  const known: [RegExp, string][] = [
    [/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/, "Google Drive"],
    [/(^|\.)notion\.(so|site)$/, "Notion"],
    [/(^|\.)canva\.com$/, "Canva"],
    [/(^|\.)typeform\.com$/, "Typeform"],
    [/(^|\.)dropbox\.com$/, "Dropbox"],
    [/(^|\.)loom\.com$/, "Loom"],
    [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
    [/(^|\.)figma\.com$/, "Figma"],
    [/(^|\.)airtable\.com$/, "Airtable"],
    [/(^|\.)trello\.com$/, "Trello"],
    [/(^|\.)clickup\.com$/, "ClickUp"],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? host;
}

export function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary hover:underline">
      {children}
    </Link>
  );
}
