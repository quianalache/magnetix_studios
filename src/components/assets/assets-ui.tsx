"use client";

import Link from "next/link";
import { ChevronRight, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/system/page-header";
import { Pagination } from "@/components/system/pagination";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill as SystemStatusPill, Tag } from "@/components/system/status-pill";

/**
 * Shared building blocks for the Assets section (approved 2026-09 designs,
 * moved onto the Magnetix design system 2026-10-14): header, the four area
 * tabs, stat tiles, filter chips, pagination and small formatting helpers.
 * Each wraps a system composite (PageHeader, Pagination, EmptyState,
 * StatusPill, Tag) so Assets reads like every other index page.
 */

export type AssetsTab = "resources" | "crm" | "media" | "affiliates";

/** Index-page header (approved Visual Direction 2): display-serif title + the restrained crescent motif. */
export function AssetsHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <PageHeader
      variant="moment"
      motif="crescent"
      title="Assets"
      description="Organize your resources, CRM materials, media, and affiliate programs in one place."
      actions={actions}
    />
  );
}

/**
 * The four Assets areas as one segmented control (white, bordered, violet-tint
 * selection — same treatment as <SegmentedControl>, plus icons). Scrolls
 * sideways on phones instead of wrapping to two rows. Optional trailing
 * `actions` (the create button) share the row from sm up.
 */
export function AssetsTabs({
  tabs,
  active,
  onChange,
  actions,
}: {
  tabs: { id: AssetsTab; label: string; icon: LucideIcon }[];
  active: AssetsTab;
  onChange: (t: AssetsTab) => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav
        aria-label="Assets sections"
        className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1 [scrollbar-width:none]"
      >
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
                "flex h-(--ds-control-md) shrink-0 items-center gap-2 rounded-lg px-3 text-body-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                on
                  ? "bg-accent font-semibold text-accent-foreground shadow-[inset_0_0_0_1px_var(--color-violet-ds-100)]"
                  : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", !on && "opacity-70")} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </nav>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  teal: "bg-tag-aqua-bg text-tag-aqua-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  amber: "bg-tag-gold-bg text-tag-gold-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
} as const;
export type Tone = keyof typeof TONES;

/** Compact index stat (approved Index design): square tinted chip, value over label. Clickable tiles filter the list. */
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
        "flex min-w-0 items-center gap-3 rounded-card border border-border bg-card px-3.5 py-3 text-left shadow-card transition-[border-color,box-shadow]",
        onClick && "outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-violet-ds-300 bg-tint-violet",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-chip", TONES[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-title-md font-semibold tracking-tight tabular-nums text-foreground">{value}</span>
        <span className="block truncate text-caption text-muted-foreground">{label}</span>
      </span>
      {onClick && <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />}
    </Comp>
  );
}

/** Native select styled as a filter chip (keeps keyboard + mobile pickers). */
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
    <label className="relative flex h-(--ds-control-md) min-w-0 items-center gap-2 rounded-control border border-input bg-background pr-8 pl-3 text-body-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent font-medium text-foreground outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" aria-hidden="true" />
    </label>
  );
}

/** List pagination — the shared system <Pagination>, hidden when the list is empty. */
export function Pager({
  page,
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
  return <Pagination page={page} pageSize={pageSize} total={total} itemLabel={noun} onPageChange={onPage} />;
}

export function EmptyPanel({ icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return <EmptyState icon={icon} title={title} description={body} action={action} />;
}

const STATUS_TONES = { green: "success", amber: "warning", gray: "neutral", violet: "scheduled" } as const;

/** State pill — the shared system StatusPill (semantic colors + dot). */
export function StatusPill({ tone, children }: { tone: "green" | "amber" | "gray" | "violet"; children: React.ReactNode }) {
  return <SystemStatusPill tone={STATUS_TONES[tone]}>{children}</SystemStatusPill>;
}

/** Category pill — the shared system Tag (stable colour per label, no dot). */
export function TagPill({ label, className }: { label: string; className?: string }) {
  return <Tag className={cn("max-w-full truncate", className)}>{label}</Tag>;
}

export function Initials({ name }: { name: string | null }) {
  const text = (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-caption font-semibold text-tag-violet-fg" title={name ?? undefined}>
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
    <Link href={href} className="text-link hover:underline">
      {children}
    </Link>
  );
}
