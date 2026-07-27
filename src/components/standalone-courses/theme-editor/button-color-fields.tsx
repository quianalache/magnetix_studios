"use client";

import { useState } from "react";
import { ColorInput } from "@/components/ui/color-input";
import { cn } from "@/lib/utils";

const TAB = "flex-1 border-b-2 pb-1.5 text-sm font-medium transition-colors";

/**
 * Regular/Hover tab pair for a button's Fill/Border/Text colors — shared by
 * every button-bearing block (Hero, Custom, Cross Sell, Call To Action) so
 * the same UI isn't hand-rolled 4 times. The underlying data stays 6 flat
 * fields per block (no nested regular/hover object) so existing saved
 * themes stay backward compatible with a plain `?? default` fallback.
 */
export function ButtonColorFields({
  color,
  borderColor,
  textColor,
  colorHover,
  borderColorHover,
  textColorHover,
  onChange,
}: {
  color: string;
  borderColor: string;
  textColor: string;
  colorHover: string;
  borderColorHover: string;
  textColorHover: string;
  onChange: (next: {
    color: string;
    borderColor: string;
    textColor: string;
    colorHover: string;
    borderColorHover: string;
    textColorHover: string;
  }) => void;
}) {
  const [tab, setTab] = useState<"regular" | "hover">("regular");
  const current = { color, borderColor, textColor, colorHover, borderColorHover, textColorHover };

  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b">
        <button
          type="button"
          onClick={() => setTab("regular")}
          className={cn(
            TAB,
            tab === "regular" ? "border-foreground" : "border-transparent text-muted-foreground",
          )}
        >
          Regular
        </button>
        <button
          type="button"
          onClick={() => setTab("hover")}
          className={cn(
            TAB,
            tab === "hover" ? "border-foreground" : "border-transparent text-muted-foreground",
          )}
        >
          Hover
        </button>
      </div>

      {tab === "regular" ? (
        <div className="flex flex-col gap-3">
          <ColorInput
            label="Button Fill"
            value={color}
            onChange={(v) => onChange({ ...current, color: v })}
          />
          <ColorInput
            label="Button Border"
            value={borderColor}
            onChange={(v) => onChange({ ...current, borderColor: v })}
          />
          <ColorInput
            label="Button Text"
            value={textColor}
            onChange={(v) => onChange({ ...current, textColor: v })}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ColorInput
            label="Button Fill"
            value={colorHover}
            onChange={(v) => onChange({ ...current, colorHover: v })}
          />
          <ColorInput
            label="Button Border"
            value={borderColorHover}
            onChange={(v) => onChange({ ...current, borderColorHover: v })}
          />
          <ColorInput
            label="Button Text"
            value={textColorHover}
            onChange={(v) => onChange({ ...current, textColorHover: v })}
          />
        </div>
      )}
    </div>
  );
}
