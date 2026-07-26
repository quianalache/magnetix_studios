"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Compact pill-style filter control (Published/Draft/All, etc.) — built from
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
    <div className={cn("inline-flex items-center gap-1", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
            value === opt.value
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
