"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchGoogleFonts, getGoogleFont } from "@/lib/fonts/google-fonts";
import type { CourseThemeFontChoice } from "@/types/course-theme";

const SELECT =
  "h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * A simple type-to-filter font picker over the Google Fonts catalog
 * (~1,580 families) — an inline filtered list rather than a floating
 * popover/combobox, since no combobox primitive is used anywhere else in
 * this codebase yet and this keeps the interaction trivial to reason about.
 */
export function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CourseThemeFontChoice;
  onChange: (next: CourseThemeFontChoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = open ? searchGoogleFonts(query, 8) : [];
  const weights = getGoogleFont(value.family)?.weights ?? ["400"];

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={open ? query : value.family}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search fonts…"
          />
          {open && matches.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-input bg-background shadow-md">
              {matches.map((f) => (
                <button
                  key={f.family}
                  type="button"
                  className="block w-full truncate px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ family: f.family, weight: "400" });
                    setOpen(false);
                  }}
                >
                  {f.family}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {f.category}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          value={value.weight}
          onChange={(e) => onChange({ ...value, weight: e.target.value })}
          className={SELECT}
        >
          {weights.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
