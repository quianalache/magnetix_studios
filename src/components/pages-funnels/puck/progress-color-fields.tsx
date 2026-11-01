"use client";

import { AutoField, FieldLabel, createUsePuck } from "@puckeditor/core";
import { Palette } from "lucide-react";
import { isLightOnWhite } from "@/lib/brand/brand-colors";
import { ACCENT_HEX, METRIC_ACCENT_OPTIONS, type MetricAccent } from "@/lib/pages-funnels/data-metrics/accent";
import {
  PROGRESS_COLOR_CHOICES,
  PROGRESS_CUSTOM_FALLBACK,
  normalizeProgressColor,
  type ProgressColorSetting,
  type ProgressColorSource,
} from "@/lib/pages-funnels/data-metrics/progress-color";
import { AddBrandColorsLink, BrandColorPicker, ColorPickRow, Hint, NoBrandColorsNotice, useBrandColors } from "./color-controls";

const useTypedPuck = createUsePuck();

/**
 * Progress Bar / Ring color (owner color UX correction 2026-11-01).
 * With brand colors saved: Brand color · Custom. With none: Custom, plus a
 * small "Add brand colors" link. A Brand color is saved by its stable Brand
 * Kit id (a new block follows the Primary brand color), so it stays live.
 * Older blocks on a named system color keep it — shown by name, never as a
 * choice — until the customer picks something else.
 */
export function ProgressColorFieldEditor({
  value,
  onChange,
  field,
}: {
  value: ProgressColorSetting | undefined;
  onChange: (v: ProgressColorSetting) => void;
  field?: { label?: string };
}) {
  const accent = useTypedPuck((s) => (s.selectedItem?.props as { accent?: MetricAccent } | undefined)?.accent) ?? "plum";
  const brand = useBrandColors();
  const setting = normalizeProgressColor(value);
  const label = field?.label ?? "Color";
  const fieldLabel = label.replace(/ color$/, "");

  // What the block draws right now when it isn't on a Brand/Custom color.
  const systemHex = accent === "default" ? null : ACCENT_HEX[accent];
  const systemName = METRIC_ACCENT_OPTIONS.find((o) => o.value === accent)?.label ?? "Plum";
  const legacy = setting.source === "magnetix";
  const picked = setting.source === "brand" ? (setting.brandColorId ? brand.find((c) => c.id === setting.brandColorId) : brand[0]) : undefined;
  const customHex = setting.custom ?? PROGRESS_CUSTOM_FALLBACK;
  const toCustom = (hex: string) => onChange({ ...setting, source: "custom", custom: hex });

  const currentRow = (
    <ColorPickRow
      label={legacy ? `Current: ${systemName}` : fieldLabel}
      hex={systemHex ?? PROGRESS_CUSTOM_FALLBACK}
      onCommit={toCustom}
      brand={brand}
      testId="current"
    />
  );

  // No brand colors saved: Custom is the only choice.
  if (brand.length === 0) {
    const showsSystem = legacy || setting.source === "brand";
    const hex = showsSystem ? (systemHex ?? PROGRESS_CUSTOM_FALLBACK) : customHex;
    return (
      <div>
        <FieldLabel label={label} icon={<Palette size={16} />} el="div">
          {showsSystem ? currentRow : <ColorPickRow label={fieldLabel} hex={customHex} onCommit={toCustom} brand={brand} testId="custom" />}
        </FieldLabel>
        {setting.source === "brand" && setting.brandColorId ? <NoBrandColorsNotice /> : <AddBrandColorsLink />}
        {isLightOnWhite(hex) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
      </div>
    );
  }

  const options = [
    ...(legacy ? [{ label: "Choose a color…", value: "magnetix" }] : []),
    ...PROGRESS_COLOR_CHOICES,
  ];
  const pickSource = (source: ProgressColorSource) => {
    if (source === "brand") {
      const keep = brand.some((c) => c.id === setting.brandColorId) ? setting.brandColorId : brand[0]?.id;
      onChange({ source, ...(keep ? { brandColorId: keep } : {}) });
    } else if (source === "custom") {
      onChange({ ...setting, source, custom: setting.custom ?? picked?.hex ?? systemHex ?? PROGRESS_CUSTOM_FALLBACK });
    }
  };

  return (
    <div>
      {/* The label wraps only the select, so its accessible name is just the field label. */}
      <FieldLabel label={label} icon={<Palette size={16} />}>
        <AutoField field={{ type: "select", options }} value={setting.source} onChange={pickSource} />
      </FieldLabel>
      {legacy ? (
        <div className="mt-2">
          {currentRow}
          <Hint>Choose Brand color or Custom to change it.</Hint>
        </div>
      ) : null}
      {setting.source === "brand" ? (
        <>
          <BrandColorPicker
            brand={brand}
            selectedId={picked?.id}
            onSelect={(id) => onChange({ source: "brand", brandColorId: id })}
          />
          {!picked ? <Hint tone="warning">This brand color is no longer available. Choose another color.</Hint> : null}
          {picked && !setting.brandColorId ? <Hint>Follows your Primary brand color.</Hint> : null}
          {picked && isLightOnWhite(picked.hex) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
        </>
      ) : null}
      {setting.source === "custom" ? (
        <>
          <div className="mt-2">
            <ColorPickRow label="Custom" hex={customHex} onCommit={toCustom} brand={brand} testId="custom" />
          </div>
          {isLightOnWhite(customHex) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
        </>
      ) : null}
    </div>
  );
}
