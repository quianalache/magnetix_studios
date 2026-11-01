"use client";

import { createUsePuck, AutoField, FieldLabel } from "@puckeditor/core";
import { ChartPie, Palette } from "lucide-react";
import { isLightOnWhite, normalizeHex } from "@/lib/brand/brand-colors";
import {
  BrandColorList,
  ColorPickRow,
  Hint,
  NoBrandColorsNotice,
  AddBrandColorsLink,
  useBrandColors,
} from "./color-controls";
import {
  isChartType,
  isPartToWhole,
  isSequential,
  normalizeChartRows,
  type ChartType,
} from "@/lib/pages-funnels/data-metrics/chart";
import {
  CHART_COLOR_MODE_LABEL,
  MAGNETIX_PALETTE_HEX,
  colorModesFor,
  defaultRowColor,
  effectiveColorMode,
  hasLookAlikeNeighbors,
  normalizeChartColors,
  resolveChartColors,
  type ChartColorsSetting,
} from "@/lib/pages-funnels/data-metrics/chart-colors";

/**
 * Chart sidebar fields (Phase B, 2026-10-30; owner color UX correction
 * 2026-11-01). Built from Puck's own `FieldLabel` + `AutoField`, so they look
 * exactly like the fields around them in the 290px sidebar, and from the
 * shared color controls, so every color shows a swatch, a name and its hex.
 */
const useTypedPuck = createUsePuck();

/** Short chart-type names (fit the closed select) + a one-line helper underneath. */
export const CHART_TYPE_SHORT: { value: ChartType; label: string; help: string }[] = [
  { value: "bar", label: "Bar", help: "Compare categories." },
  { value: "horizontalBar", label: "Horizontal bar", help: "Compare categories with longer labels." },
  { value: "line", label: "Line", help: "Show change over time." },
  { value: "area", label: "Area", help: "Show a trend and its volume." },
  { value: "pie", label: "Pie", help: "Show parts of a whole." },
  { value: "donut", label: "Donut", help: "Show parts of a whole with a center value." },
];

export function ChartTypeFieldEditor({ value, onChange }: { value: ChartType; onChange: (v: ChartType) => void }) {
  const current = CHART_TYPE_SHORT.find((t) => t.value === value) ?? CHART_TYPE_SHORT[0];
  return (
    <div>
      <FieldLabel label="Chart type" icon={<ChartPie size={16} />}>
        <AutoField
          field={{ type: "select", options: CHART_TYPE_SHORT.map((t) => ({ label: t.label, value: t.value })) }}
          value={current.value}
          onChange={(v: ChartType) => onChange(v)}
        />
      </FieldLabel>
      <Hint>{current.help}</Hint>
    </div>
  );
}

function Swatches({ colors, kind }: { colors: string[]; kind: "shades" }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-hidden="true" data-chart-color-preview={kind}>
      {colors.slice(0, 12).map((c, i) => (
        <span key={`${c}-${i}`} className="size-4 rounded-full border border-border" style={{ background: c }} />
      ))}
    </div>
  );
}

/**
 * Colors (Bar / Horizontal bar / Pie / Donut) or Line color (Line / Area).
 * Offers Brand colors · Custom · One color (bar) / Shades (pie). The chart's
 * original system colors are never offered; charts that still use them keep
 * rendering unchanged until the customer picks something else.
 */
export function ChartColorsFieldEditor({
  value,
  onChange,
}: {
  value: ChartColorsSetting | undefined;
  onChange: (v: ChartColorsSetting) => void;
}) {
  const props = useTypedPuck((s) => s.selectedItem?.props as { chartType?: string; rows?: unknown } | undefined);
  const brand = useBrandColors();
  const brandHex = brand.map((c) => c.hex);
  const setting = normalizeChartColors(value);
  const type: ChartType = isChartType(props?.chartType) ? props!.chartType : "bar";

  if (isSequential(type)) {
    const primary = setting.mode === "brand" && !setting.base ? brand[0] : undefined;
    const color = setting.base || primary?.hex || MAGNETIX_PALETTE_HEX[0];
    return (
      <div>
        <FieldLabel label={type === "area" ? "Area color" : "Line color"} icon={<Palette size={16} />} el="div">
          <ColorPickRow label={type === "area" ? "Area" : "Line"} hex={color} onCommit={(hex) => onChange({ ...setting, base: hex })} brand={brand} testId="series" />
        </FieldLabel>
        {primary ? <Hint>Follows your Primary brand color.</Hint> : null}
        {brand.length === 0 ? <AddBrandColorsLink /> : null}
        {isLightOnWhite(color) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
      </div>
    );
  }

  const modes = colorModesFor(type);
  const mode = effectiveColorMode(type, setting.mode);
  const { data } = normalizeChartRows(props?.rows, type, "original");
  const rows = Array.isArray(props?.rows) ? (props!.rows as { color?: string }[]) : [];
  const preview = resolveChartColors({
    type,
    setting: { ...setting, mode },
    data: data.length ? data.map((d) => ({ index: d.index, color: rows[d.index]?.color })) : [0, 1, 2, 3, 4].map((index) => ({ index })),
    rowCount: Math.max(rows.length, 5),
    brandColors: brandHex,
  });
  const baseColor = setting.base || MAGNETIX_PALETTE_HEX[0];
  const previewHex = preview.colors.filter((c) => c.startsWith("#"));
  const lookAlike = (mode === "custom" || mode === "brand") && hasLookAlikeNeighbors(previewHex, isPartToWhole(type));
  const light = mode === "single" ? isLightOnWhite(baseColor) : mode === "custom" && previewHex.some((c) => isLightOnWhite(c));
  // An existing chart on its original colors: show a neutral prompt, not a named palette.
  const options = [
    ...(mode === "palette" ? [{ label: "Choose colors…", value: "palette" }] : []),
    ...modes.map((m) => ({ label: CHART_COLOR_MODE_LABEL[m], value: m })),
  ];
  const pickMode = (m: ChartColorsSetting["mode"]) => {
    if (m === "palette") return;
    // One color / Shades start from the Primary brand color when there is one.
    const base = (m === "single" || m === "shades") && !setting.base ? (brand[0]?.hex ?? "") : setting.base;
    onChange({ ...setting, mode: m, base });
  };

  return (
    <div>
      {/* The label wraps only the select, so its accessible name is just "Colors". */}
      <FieldLabel label="Colors" icon={<Palette size={16} />}>
        <AutoField field={{ type: "select", options }} value={mode} onChange={pickMode} />
      </FieldLabel>
      {mode === "palette" ? <Hint>This chart still uses its original colors. Choose Brand colors, Custom or {isPartToWhole(type) ? "Shades" : "One color"} to restyle it.</Hint> : null}
      {mode === "brand" ? (
        preview.brandMissing ? (
          <NoBrandColorsNotice onUseCustom={() => pickMode("custom")} />
        ) : (
          <>
            <BrandColorList brand={brand} />
            {data.length > brand.length ? (
              <Hint>More rows than brand colors: lighter and darker steps of your colors fill the rest.</Hint>
            ) : null}
          </>
        )
      ) : null}
      {mode === "single" ? (
        <div className="mt-2">
          <ColorPickRow label="Bar color" hex={baseColor} onCommit={(hex) => onChange({ ...setting, base: hex })} brand={brand} testId="single" />
        </div>
      ) : null}
      {mode === "shades" ? (
        <div className="mt-2">
          <ColorPickRow label="Base color" hex={baseColor} onCommit={(hex) => onChange({ ...setting, base: hex })} brand={brand} testId="shades" />
          <Swatches colors={preview.colors} kind="shades" />
        </div>
      ) : null}
      {mode === "custom" ? <CustomRowColors brand={brand} /> : null}
      {(mode === "single" || mode === "shades" || mode === "custom") && brand.length === 0 ? <AddBrandColorsLink /> : null}
      {light ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
      {lookAlike ? <Hint tone="warning">These colors look very alike.</Hint> : null}
    </div>
  );
}

/**
 * Custom mode: one compact color control per Data row, derived from the rows
 * themselves. Each control edits that row's own `color` — the single source
 * of truth — so rename / add / delete / reorder in Data show up here, and a
 * color always stays with its row.
 */
function CustomRowColors({ brand }: { brand: ReturnType<typeof useBrandColors> }) {
  const item = useTypedPuck((s) => s.selectedItem);
  const selector = useTypedPuck((s) => s.appState.ui.itemSelector);
  const dispatch = useTypedPuck((s) => s.dispatch);
  const rows = Array.isArray(item?.props?.rows) ? (item!.props.rows as { label?: string; color?: string }[]) : [];
  if (rows.length === 0) return <Hint>Add rows under Data to choose their colors.</Hint>;

  const setRowColor = (index: number, hex: string) => {
    if (!item || !selector?.zone) return;
    const next = rows.map((r, i) => (i === index ? { ...r, color: hex } : r));
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...item, props: { ...item.props, rows: next } },
    });
  };
  const brandHex = brand.map((c) => c.hex);

  return (
    <ul className="mt-2 flex flex-col gap-1.5" aria-label="Custom colors" data-chart-custom-colors="">
      {rows.map((r, i) => (
        <li key={i} data-chart-custom-row={i}>
          <ColorPickRow
            label={r.label?.trim() || `Row ${i + 1}`}
            hex={normalizeHex(r.color) ?? defaultRowColor(i, brandHex)}
            onCommit={(hex) => setRowColor(i, hex)}
            brand={brand}
          />
        </li>
      ))}
    </ul>
  );
}
