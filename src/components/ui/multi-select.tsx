"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Compact multi-select (Popover + checkbox list) — the "Add Products"
 * picker used by the Course Offers create/detail forms to attach several
 * courses to one offer. No combobox/multi-select primitive existed
 * anywhere in this codebase before this pass.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  className,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabels = options
    .filter((o) => value.includes(o.value))
    .map((o) => o.label);

  function toggle(v: string) {
    onChange(
      value.includes(v) ? value.filter((x) => x !== v) : [...value, v],
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-[13px] shadow-sm",
          className,
        )}
      >
        <span
          className={cn(
            "truncate",
            selectedLabels.length === 0 && "text-muted-foreground",
          )}
        >
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="max-h-64 w-72 overflow-y-auto p-1.5">
        {options.length === 0 && (
          <p className="p-2 text-[13px] text-muted-foreground">No options</p>
        )}
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted"
          >
            <Checkbox
              checked={value.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
            />
            <span className="truncate">{opt.label}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Selected-items chip row, shown under the trigger (mirrors the reference's
 *  "CEO Visibility Toolkit ×  Create Your Kollab Co... ×" tag row). */
export function MultiSelectChips({
  options,
  value,
  onChange,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = options.filter((o) => value.includes(o.value));
  if (selected.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {selected.map((opt) => (
        <span
          key={opt.value}
          className="inline-flex items-center gap-1 rounded-md border border-input bg-muted px-2 py-1 text-[12px] font-medium"
        >
          {opt.label}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== opt.value))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
