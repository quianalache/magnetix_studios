"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { clampFocalPoint } from "@/lib/pages-funnels/puck/background";
import type { FocalPoint } from "@/types/pages-funnels-puck";

const PRESETS: { label: string; point: FocalPoint }[] = [
  { label: "Top left", point: { x: 0, y: 0 } },
  { label: "Top center", point: { x: 50, y: 0 } },
  { label: "Top right", point: { x: 100, y: 0 } },
  { label: "Center left", point: { x: 0, y: 50 } },
  { label: "Center", point: { x: 50, y: 50 } },
  { label: "Center right", point: { x: 100, y: 50 } },
  { label: "Bottom left", point: { x: 0, y: 100 } },
  { label: "Bottom center", point: { x: 50, y: 100 } },
  { label: "Bottom right", point: { x: 100, y: 100 } },
];

/**
 * Focal point / position picker (Wave 3) — ONE control for every image that
 * can be cropped: background images and the Image block. Click the spot that
 * must stay visible on the preview, or pick one of nine positions. The value
 * is a percentage point, used directly as CSS `background-position` /
 * `object-position`, so the canvas, Preview and live page all crop the same.
 */
export function FocalPointField({
  label = "Position",
  imageUrl,
  value,
  onChange,
}: {
  label?: string;
  imageUrl?: string;
  value: FocalPoint | undefined;
  onChange: (point: FocalPoint) => void;
}) {
  const point = clampFocalPoint(value);
  return (
    <div className="space-y-2" data-focal-point-field="">
      <Label className="text-xs font-semibold">{label}</Label>
      {imageUrl ? (
        <button
          type="button"
          className="border-border relative block aspect-video w-full overflow-hidden rounded-md border"
          aria-label="Click the part of the image that should stay visible"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onChange(clampFocalPoint({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 }));
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- preview of the chosen public image */}
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          <span
            aria-hidden
            className="ring-primary absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 ring-2"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          />
        </button>
      ) : null}
      <div className="grid w-24 grid-cols-3 gap-1" role="radiogroup" aria-label={label}>
        {PRESETS.map((preset) => {
          const active = preset.point.x === point.x && preset.point.y === point.y;
          return (
            <button
              key={preset.label}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => onChange(preset.point)}
              className={cn(
                "border-border hover:bg-muted flex h-7 items-center justify-center rounded border",
                active && "border-primary bg-primary/10"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-primary" : "bg-muted-foreground/50")} />
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-caption">
        {imageUrl ? "Click the image or pick a position. " : ""}
        {point.x}% · {point.y}%
      </p>
    </div>
  );
}
