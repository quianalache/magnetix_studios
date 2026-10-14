import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * StatusPill vs Tag (design-system Phase 1) — two different jobs:
 *
 *   StatusPill = STATE (active, draft, failed, scheduled…). Semantic colors
 *                only, always with a dot.
 *   Tag        = CATEGORY (Guide, Branding, Podcast…). Rotating accent
 *                families, no dot. Never use a tag color to imply state.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "scheduled" | "neutral";

const STATUS: Record<StatusTone, string> = {
  success: "bg-status-success-bg text-status-success-fg before:bg-status-success-dot",
  warning: "bg-status-warning-bg text-status-warning-fg before:bg-status-warning-dot",
  danger: "bg-status-danger-bg text-status-danger-fg before:bg-status-danger-dot",
  info: "bg-status-info-bg text-status-info-fg before:bg-status-info-dot",
  scheduled: "bg-status-scheduled-bg text-status-scheduled-fg before:bg-status-scheduled-dot",
  neutral: "bg-status-neutral-bg text-status-neutral-fg before:bg-status-neutral-dot",
};

/** Common CRM states → tone, so the same word always gets the same color. */
export const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  live: "success",
  published: "success",
  paid: "success",
  won: "success",
  completed: "success",
  draft: "warning",
  pending: "warning",
  "needs attention": "warning",
  failed: "danger",
  error: "danger",
  overdue: "danger",
  lost: "danger",
  canceled: "danger",
  cancelled: "danger",
  scheduled: "scheduled",
  queued: "scheduled",
  sent: "info",
  open: "info",
  archived: "neutral",
  inactive: "neutral",
  paused: "neutral",
};

export function StatusPill({
  tone,
  status,
  children,
  className,
}: {
  /** Explicit tone; otherwise derived from `status` (or the text) via STATUS_TONE, defaulting to neutral. */
  tone?: StatusTone;
  status?: string;
  children?: ReactNode;
  className?: string;
}) {
  const label = children ?? status;
  const key = (status ?? (typeof children === "string" ? children : "")).toLowerCase();
  const resolved = tone ?? STATUS_TONE[key] ?? "neutral";
  return (
    <span
      data-status-tone={resolved}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-caption font-semibold whitespace-nowrap before:size-1.5 before:shrink-0 before:rounded-full before:content-['']",
        STATUS[resolved],
        className,
      )}
    >
      {label}
    </span>
  );
}

export type TagColor = "violet" | "pink" | "aqua" | "gold" | "blue" | "green" | "gray";

const TAG: Record<TagColor, string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
  gray: "bg-tag-gray-bg text-tag-gray-fg",
};

const ROTATION: TagColor[] = ["violet", "pink", "aqua", "gold", "blue", "green"];

/** Stable color for a category label — the same label always gets the same color, and lists rotate families. */
export function tagColorFor(label: string): TagColor {
  let h = 0;
  for (const ch of label.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ROTATION[h % ROTATION.length];
}

export function Tag({ color, children, className }: { color?: TagColor; children: ReactNode; className?: string }) {
  const resolved = color ?? (typeof children === "string" ? tagColorFor(children) : "gray");
  return (
    <span
      data-tag-color={resolved}
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-caption font-medium whitespace-nowrap", TAG[resolved], className)}
    >
      {children}
    </span>
  );
}
