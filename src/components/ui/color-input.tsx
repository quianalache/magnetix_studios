"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A compact swatch that opens a small popover with a native color input +
 * manual hex entry (and optional quick-pick presets) — mirrors the
 * click-to-open swatch pattern used throughout GHL's course-theme editor,
 * rather than an always-visible color-picker row.
 */
export function ColorInput({
  label,
  value,
  onChange,
  presets,
  className,
}: {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  presets?: { label: string; value: string }[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        </div>
      )}
      <Popover>
        <PopoverTrigger
          className="h-8 w-8 rounded-lg border border-border shadow-sm transition-transform hover:scale-105"
          style={{ backgroundColor: value }}
          aria-label={label ? `Pick ${label} color` : "Pick color"}
        />
        <PopoverContent className="w-56 space-y-3">
          {presets && presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChange(p.value)}
                  title={p.label}
                  className={cn(
                    "h-6 w-6 rounded-full border transition-transform hover:scale-110",
                    value.toLowerCase() === p.value.toLowerCase()
                      ? "border-foreground ring-2 ring-ring ring-offset-1"
                      : "border-input",
                  )}
                  style={{ backgroundColor: p.value }}
                >
                  <span className="sr-only">{p.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent"
              aria-label={label ? `Pick ${label} color` : "Pick color"}
            />
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#000000"
              className="flex-1 font-mono text-xs"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
