"use client";

import type { ReactNode } from "react";
import {
  ChevronRight,
  Crown,
  Ear,
  Eye,
  Flame,
  Hexagon,
  House,
  KeyRound,
  Layers,
  Moon,
  Mountain,
  Orbit,
  ScanEye,
  Sparkles,
  Spline,
  Square,
  Star,
  Telescope,
  Triangle,
  User,
  Users,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { displaySerif } from "@/lib/fonts/display-serif";
import { ENTRY_STATE_LABEL, type ContentEntryState, type ContentSetStatus, type ContentSystem } from "@/lib/energetic-decoder/content-sets";

/**
 * Content Sets — shared visual pieces, matched to the owner-approved
 * mockups (2026-10-07). Colors come from the `.content-sets-scope` tokens
 * in globals.css. Purely presentational: no data, no behavior.
 */

export const CS_SCOPE = "content-sets-scope";
export const displayTitle = cn(displaySerif.className, "tracking-tight text-[var(--cs-ink)]");

export function StatusPill({ status, className }: { status: ContentSetStatus; className?: string }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1 text-[13px] font-medium",
        active ? "bg-[var(--cs-active-bg)] text-[var(--cs-active-fg)]" : "bg-[var(--cs-draft-bg)] text-[var(--cs-draft-fg)]",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", active ? "bg-[var(--cs-active-dot)]" : "bg-[var(--cs-draft-dot)]")} />
      {active ? "Active" : "Draft"}
    </span>
  );
}

const ENTRY_STATE_STYLE: Record<ContentEntryState, { pill: string; dot: string }> = {
  complete: { pill: "bg-[var(--cs-active-bg)] text-[var(--cs-active-fg)]", dot: "bg-[var(--cs-active-dot)]" },
  customized: { pill: "bg-[var(--cs-tint-strong)] text-[var(--cs-draft-fg)]", dot: "border-[1.5px] border-[var(--cs-draft-fg)] bg-transparent" },
  needs_content: { pill: "bg-[var(--cs-needs-bg)] text-[var(--cs-needs-fg)]", dot: "bg-[var(--cs-needs-dot)]" },
  not_started: { pill: "bg-[var(--cs-idle-bg)] text-[var(--cs-idle-fg)]", dot: "bg-[var(--cs-idle-dot)]" },
};

export function EntryStatePill({ state, size = "sm" }: { state: ContentEntryState; size?: "sm" | "md" }) {
  const s = ENTRY_STATE_STYLE[state];
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md font-medium",
        size === "sm" ? "px-2 py-0.5 text-[12px]" : "rounded-lg px-3 py-1.5 text-[13px]",
        s.pill,
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
      {ENTRY_STATE_LABEL[state]}
    </span>
  );
}

export type TileTone = "violet" | "pink" | "teal";
const TONE: Record<TileTone, string> = {
  violet: "bg-[var(--cs-tint)] text-[var(--cs-violet-fg)]",
  pink: "bg-[var(--cs-pink-bg)] text-[var(--cs-pink-fg)]",
  teal: "bg-[var(--cs-teal-bg)] text-[var(--cs-teal-fg)]",
};

export function IconTile({ icon: Icon, tone = "violet", shape = "square", size = "md", className }: { icon: LucideIcon; tone?: TileTone; shape?: "square" | "circle"; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "h-10 w-10" : size === "md" ? "h-12 w-12" : "h-16 w-16";
  const glyph = size === "sm" ? "h-5 w-5" : size === "md" ? "h-6 w-6" : "h-8 w-8";
  return (
    <span className={cn("flex shrink-0 items-center justify-center", shape === "circle" ? "rounded-full" : "rounded-xl", box, TONE[tone], className)}>
      <Icon className={glyph} strokeWidth={1.75} />
    </span>
  );
}

/** Tile for a set in the library. Sets carry no icon field, so: Default = sparkles; custom sets = a content-set glyph in a stable rotating tone. */
export function setTile(set: { id: string; isDefault: boolean }): { icon: LucideIcon; tone: TileTone } {
  if (set.isDefault) return { icon: Sparkles, tone: "violet" };
  let h = 0;
  for (const ch of set.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: Layers, tone: (["pink", "violet", "teal"] as const)[h % 3] };
}

export const SYSTEM_ICON: Record<ContentSystem, LucideIcon> = { hd: User, astro: Sparkles, freq: Spline };
export const SYSTEM_TONE: Record<ContentSystem, TileTone> = { hd: "violet", astro: "violet", freq: "teal" };

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  "hd:type": User,
  "hd:authority": Triangle,
  "hd:line": Users,
  "hd:center": Square,
  "hd:crossAngle": Star,
  "hd:channel": Spline,
  "hd:incarnationCross": Star,
  "hd:digestion": Utensils,
  "hd:sense": Ear,
  "hd:designSense": ScanEye,
  "hd:motivation": Flame,
  "hd:perspective": Telescope,
  "hd:environment": Mountain,
  "astro:sign": Orbit,
  "astro:house": House,
  "astro:aspect": Hexagon,
  "astro:planetSign": Orbit,
  "astro:planetHouse": House,
  "freq:gate": KeyRound,
};

const TYPE_ICON: Record<string, { icon: LucideIcon; tone: TileTone; className?: string }> = {
  Generator: { icon: User, tone: "violet" },
  "Manifesting Generator": { icon: Zap, tone: "violet" },
  Manifestor: { icon: Crown, tone: "violet", className: "bg-[var(--cs-needs-bg)] text-[var(--cs-gold)]" },
  Projector: { icon: Eye, tone: "violet" },
  Reflector: { icon: Moon, tone: "violet" },
};

export function entryTile(categoryId: string, key: string): { icon: LucideIcon; tone: TileTone; className?: string } {
  if (categoryId === "hd:type" && TYPE_ICON[key]) return TYPE_ICON[key];
  return { icon: CATEGORY_ICON[categoryId] ?? Sparkles, tone: categoryId.startsWith("freq") ? "teal" : "violet" };
}

/** Progress ring for the editor's system cards. */
export function ProgressRing({ done, total, size = 30 }: { done: number; total: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cs-violet-fg)" strokeWidth={3} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />}
    </svg>
  );
}

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[var(--cs-body)]">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[var(--cs-subtle)]" />}
          {it.onClick ? (
            <button type="button" onClick={it.onClick} className="hover:text-[var(--cs-link)] hover:underline">
              {it.label}
            </button>
          ) : (
            <span aria-current={i === items.length - 1 ? "page" : undefined}>{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** The mockups' soft celestial corner art (planet, ring, sparkles) — decorative only, hidden on phones. */
export function CelestialDecoration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 220" aria-hidden className={cn("pointer-events-none select-none", className)}>
      <defs>
        <radialGradient id="cs-glow" cx="70%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#f3d9f2" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fdf8fb" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cs-planet" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f7eefe" />
          <stop offset="60%" stopColor="#d9c2f5" />
          <stop offset="100%" stopColor="#b694e6" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="320" height="220" fill="url(#cs-glow)" />
      <circle cx="232" cy="100" r="58" fill="url(#cs-planet)" opacity="0.85" />
      <ellipse cx="232" cy="104" rx="108" ry="26" fill="none" stroke="#c9a6ee" strokeWidth="1.5" transform="rotate(-18 232 104)" opacity="0.8" />
      <ellipse cx="232" cy="104" rx="92" ry="20" fill="none" stroke="#e7b552" strokeWidth="1" transform="rotate(-18 232 104)" opacity="0.6" />
      {[
        [96, 62, 13],
        [62, 150, 9],
        [150, 176, 7],
        [300, 30, 6],
        [36, 92, 4],
      ].map(([x, y, s], i) => (
        <path key={i} d={`M${x} ${y - s}L${x + s * 0.22} ${y - s * 0.22}L${x + s} ${y}L${x + s * 0.22} ${y + s * 0.22}L${x} ${y + s}L${x - s * 0.22} ${y + s * 0.22}L${x - s} ${y}L${x - s * 0.22} ${y - s * 0.22}Z`} fill="#e7b552" opacity="0.85" />
      ))}
      {[
        [120, 30],
        [188, 196],
        [20, 40],
        [292, 180],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#e7b552" opacity="0.7" />
      ))}
    </svg>
  );
}

export function PageHeader({ icon, iconTone = "violet", title, description, breadcrumb, aside }: { icon: Parameters<typeof IconTile>[0]["icon"]; iconTone?: TileTone; title: string; description?: string; breadcrumb: ReactNode; aside?: ReactNode }) {
  return (
    <div className="relative">
      <CelestialDecoration className="absolute -right-2 -top-4 hidden h-[200px] w-[300px] md:block" />
      <div className="relative space-y-4">
        {breadcrumb}
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-4">
              <IconTile icon={icon} tone={iconTone} shape="circle" size="lg" className="max-sm:h-12 max-sm:w-12" />
              <h2 className={cn(displayTitle, "min-w-0 break-words text-[34px] leading-[1.05] sm:text-[48px]")}>{title}</h2>
            </div>
            {description && <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--cs-body)] sm:text-base">{description}</p>}
          </div>
          {aside}
        </div>
      </div>
    </div>
  );
}
