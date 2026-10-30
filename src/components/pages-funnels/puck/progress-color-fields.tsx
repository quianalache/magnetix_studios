"use client";

import { useMemo } from "react";
import { AutoField, FieldLabel } from "@puckeditor/core";
import { Check, Palette } from "lucide-react";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { BRAND_COLOR_ROLE_LABEL, getTenantBrandColors, isLightOnWhite } from "@/lib/brand/brand-colors";
import { cn } from "@/lib/utils";
import {
  PROGRESS_COLOR_SOURCE_LABEL,
  PROGRESS_CUSTOM_FALLBACK,
  normalizeProgressColor,
  type ProgressColorSetting,
  type ProgressColorSource,
} from "@/lib/pages-funnels/data-metrics/progress-color";
import { ChartColorPicker, Hint, NoBrandColorsNotice, quickPicks } from "./chart-fields";

/**
 * Progress Bar / Ring color (Phase C, 2026-10-30): Magnetix · Brand color ·
 * Custom. Magnetix keeps the block's existing named color (the "Magnetix
 * color" field shown right below this one). A Brand color is saved by its
 * stable Brand Kit id, so it stays live: edits follow, reorders don't swap it.
 */
const SOURCES: ProgressColorSource[] = ["magnetix", "brand", "custom"];

export function ProgressColorFieldEditor({
  value,
  onChange,
  field,
}: {
  value: ProgressColorSetting | undefined;
  onChange: (v: ProgressColorSetting) => void;
  field?: { label?: string };
}) {
  const sub = useOptionalSubAccount();
  const brand = useMemo(() => getTenantBrandColors(sub?.subAccount), [sub?.subAccount]);
  const setting = normalizeProgressColor(value);
  const selected = setting.source === "brand" ? brand.find((c) => c.id === setting.brandColorId) : undefined;
  const customHex = setting.custom ?? PROGRESS_CUSTOM_FALLBACK;

  const pickSource = (source: ProgressColorSource) => {
    if (source === "brand") {
      // Keep a still-valid pick; otherwise start on the first saved Brand color.
      const keep = brand.some((c) => c.id === setting.brandColorId) ? setting.brandColorId : brand[0]?.id;
      onChange({ ...setting, source, ...(keep ? { brandColorId: keep } : {}) });
    } else if (source === "custom") {
      onChange({ ...setting, source, custom: setting.custom ?? selected?.hex ?? PROGRESS_CUSTOM_FALLBACK });
    } else {
      onChange({ ...setting, source });
    }
  };

  return (
    <div>
      {/* The label wraps only the select, so its accessible name is just the field label. */}
      <FieldLabel label={field?.label ?? "Color"} icon={<Palette size={16} />}>
        <AutoField
          field={{ type: "select", options: SOURCES.map((s) => ({ label: PROGRESS_COLOR_SOURCE_LABEL[s], value: s })) }}
          value={setting.source}
          onChange={(s: ProgressColorSource) => pickSource(s)}
        />
      </FieldLabel>

      {setting.source === "brand" ? (
        brand.length === 0 ? (
          <NoBrandColorsNotice shownInstead="The Magnetix color shows until you add some." />
        ) : (
          <>
            <div role="radiogroup" aria-label="Brand color" className="mt-2 flex flex-col gap-1" data-progress-brand-picker="">
              {brand.map((c) => {
                const on = c.id === setting.brandColorId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ ...setting, source: "brand", brandColorId: c.id })}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left",
                      on ? "border-primary bg-muted/50" : "border-border hover:bg-muted/40",
                    )}
                    data-brand-color-id={c.id}
                  >
                    <span className="border-border size-5 shrink-0 rounded-full border" style={{ background: c.hex }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="text-body-sm block truncate font-medium">{c.name || c.hex}</span>
                      <span className="text-caption text-muted-foreground block">
                        {BRAND_COLOR_ROLE_LABEL[c.role]}
                        {c.name ? ` · ${c.hex}` : ""}
                      </span>
                    </span>
                    {on ? <Check size={16} className="text-primary shrink-0" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            {!selected ? <Hint tone="warning">This brand color is no longer available. Choose another color.</Hint> : null}
            {selected && isLightOnWhite(selected.hex) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
          </>
        )
      ) : null}

      {setting.source === "custom" ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <ChartColorPicker
              value={customHex}
              onCommit={(hex) => onChange({ ...setting, source: "custom", custom: hex })}
              presets={quickPicks(brand.map((c) => c.hex))}
            />
            <span className="text-caption text-muted-foreground font-mono">{customHex}</span>
          </div>
          {isLightOnWhite(customHex) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
        </>
      ) : null}
    </div>
  );
}
