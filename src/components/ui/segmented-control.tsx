"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Compact segmented filter control (Published/Draft/All, etc.) — Magnetix
 * design-system styling (white container, violet-tint selection). Built from
 * plain buttons rather than a new dependency, matching the density of the
 * GHL reference this pass is piloting (see the course-offers plan).
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedControlOption<T>[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-(--ds-control-sm) shrink-0 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === opt.value
              ? "bg-accent font-semibold text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
