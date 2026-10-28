"use client";

import { Label } from "@/components/ui/label";
import {
  clampLogoHeight,
  LOGO_HEIGHT_DEFAULT,
  LOGO_HEIGHT_MAX,
  LOGO_HEIGHT_MIN,
} from "@/lib/pages-funnels/puck/logo";

const PRESETS = [
  { label: "Small", value: 64 },
  { label: "Medium", value: LOGO_HEIGHT_DEFAULT },
  { label: "Large", value: 128 },
];

export function LogoSizeFieldEditor({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const height = clampLogoHeight(value);
  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold">Logo height</Label>
      <div className="flex items-center gap-3">
        <input
          aria-label="Logo height"
          type="range"
          min={LOGO_HEIGHT_MIN}
          max={LOGO_HEIGHT_MAX}
          step={4}
          value={height}
          onChange={(event) => onChange(clampLogoHeight(Number(event.target.value)))}
          className="accent-primary w-full"
        />
        <span className="text-muted-foreground w-12 text-right text-xs">
          {height}px
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="border-border text-muted-foreground hover:bg-muted rounded-md border px-2 py-1 text-xs"
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-caption">
        Set the visible logo height. Images keep their original proportions.
      </p>
    </div>
  );
}
