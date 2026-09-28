"use client";

import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Coffee,
  Dumbbell,
  Heart,
  Laptop,
  Leaf,
  Mail,
  Megaphone,
  Moon,
  PenLine,
  Sparkles,
  Sun,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROUTINE_COLORS,
  type RoutineColorKey,
  type RoutineIconKey,
} from "@/types/routines";

export const ROUTINE_ICONS: Record<RoutineIconKey, { icon: LucideIcon; label: string }> = {
  sun: { icon: Sun, label: "Morning" },
  laptop: { icon: Laptop, label: "Work" },
  chart: { icon: BarChart3, label: "Metrics" },
  dumbbell: { icon: Dumbbell, label: "Fitness" },
  book: { icon: BookOpen, label: "Reading" },
  heart: { icon: Heart, label: "Wellbeing" },
  coffee: { icon: Coffee, label: "Break" },
  target: { icon: Target, label: "Goals" },
  brain: { icon: Brain, label: "Thinking" },
  calendar: { icon: CalendarDays, label: "Planning" },
  mail: { icon: Mail, label: "Inbox" },
  megaphone: { icon: Megaphone, label: "Marketing" },
  moon: { icon: Moon, label: "Evening" },
  pen: { icon: PenLine, label: "Writing" },
  wallet: { icon: Wallet, label: "Finances" },
  sparkles: { icon: Sparkles, label: "General" },
  users: { icon: Users, label: "People" },
  leaf: { icon: Leaf, label: "Self-care" },
};

export function routineHex(color: RoutineColorKey | string | undefined): string {
  return ROUTINE_COLORS[(color as RoutineColorKey) ?? "violet"]?.hex ?? ROUTINE_COLORS.violet.hex;
}

/**
 * Pastel card wash in the routine's colour. color-mix against the theme's
 * card token keeps it soft in light mode and deep (not glowing) in dark.
 */
export function routineTint(color: RoutineColorKey | string, strength = 9): React.CSSProperties {
  const hex = routineHex(color);
  return {
    background: `linear-gradient(135deg, color-mix(in oklab, ${hex} ${strength}%, var(--card)) 0%, color-mix(in oklab, ${hex} ${Math.round(strength / 3)}%, var(--card)) 100%)`,
    borderColor: `color-mix(in oklab, ${hex} 22%, var(--border))`,
  };
}

export function RoutineIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: RoutineIconKey | string;
  color: RoutineColorKey | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = ROUTINE_ICONS[icon as RoutineIconKey]?.icon ?? Sparkles;
  const hex = routineHex(color);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl border shadow-xs",
        size === "sm" && "h-9 w-9 rounded-xl",
        size === "md" && "h-12 w-12",
        size === "lg" && "h-14 w-14",
        className
      )}
      style={{
        background: `color-mix(in oklab, ${hex} 14%, var(--card))`,
        borderColor: `color-mix(in oklab, ${hex} 26%, var(--border))`,
        color: hex,
      }}
    >
      <Icon className={cn(size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-6 w-6")} />
    </span>
  );
}

/** Thin progress bar in the routine's colour. */
export function RoutineProgressBar({
  done,
  total,
  color,
  className,
}: {
  done: number;
  total: number;
  color: RoutineColorKey | string;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const hex = routineHex(color);
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full", className)}
      style={{ background: `color-mix(in oklab, ${hex} 14%, var(--muted))` }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: hex }} />
    </div>
  );
}
