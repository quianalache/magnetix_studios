"use client";

import { useEffect, useMemo, useState } from "react";
import { createUsePuck, AutoField, FieldLabel } from "@puckeditor/core";
import { ChartPie, Palette } from "lucide-react";
import { ColorInput } from "@/components/ui/color-input";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { getTenantBrandColors, isLightOnWhite, normalizeHex } from "@/lib/brand/brand-colors";
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
 * Chart sidebar fields (Phase B, 2026-10-30). Built from Puck's own
 * `FieldLabel` + `AutoField`, so they look exactly like the fields around
 * them in the 290px sidebar.
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

export function Hint({ tone = "muted", children }: { tone?: "muted" | "warning"; children: React.ReactNode }) {
  return (
    <p className={`text-caption mt-1.5 ${tone === "warning" ? "text-status-warning-fg" : "text-muted-foreground"}`}>
      {children}
    </p>
  );
}

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

/** Saved workspace Brand colors (live, this sub-account only) — for previews and quick picks. */
function useBrandHexes(): string[] {
  const sub = useOptionalSubAccount();
  return useMemo(() => getTenantBrandColors(sub?.subAccount).map((c) => c.hex), [sub?.subAccount]);
}

export function quickPicks(brand: string[]) {
  return [
    ...brand.map((hex, i) => ({ label: `Brand color ${i + 1}`, value: hex })),
    ...MAGNETIX_PALETTE_HEX.map((hex, i) => ({ label: `Magnetix color ${i + 1}`, value: hex })),
  ];
}

/** "No brand colors saved yet" + a link to Settings → Branding (new tab). Shared by Chart and Progress. */
export function NoBrandColorsNotice({ shownInstead }: { shownInstead: string }) {
  const sub = useOptionalSubAccount();
  const brandingHref = sub ? sub.saPath("/dashboard/settings?section=branding") : null;
  return (
    <div className="border-border bg-muted/40 text-caption mt-2 rounded-lg border px-3 py-2">
      <p className="font-medium">No brand colors saved yet.</p>
      <p className="text-muted-foreground">
        {shownInstead}{" "}
        {brandingHref ? (
          <a href={brandingHref} target="_blank" rel="noreferrer" className="text-link font-medium underline-offset-2 hover:underline">
            Add brand colors in Settings → Branding
          </a>
        ) : (
          "Add brand colors in Settings → Branding."
        )}
      </p>
    </div>
  );
}

function Swatches({ colors, kind }: { colors: string[]; kind: "palette" | "brand" | "shades" }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-hidden="true" data-chart-color-preview={kind}>
      {colors.slice(0, 12).map((c, i) => (
        <span key={`${c}-${i}`} className="size-4 rounded-full border border-border" style={{ background: c }} />
      ))}
    </div>
  );
}

/**
 * ColorInput with a local draft: the hex box can be typed into one character
 * at a time, and only a complete 6-digit color is saved.
 */
export function ChartColorPicker({ value, onCommit, presets }: { value: string; onCommit: (hex: string) => void; presets: { label: string; value: string }[] }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <ColorInput
      value={draft}
      onChange={(v) => {
        setDraft(v);
        const hex = /^#?[0-9a-f]{6}$/i.test(v.trim()) ? normalizeHex(v) : null;
        if (hex && hex !== value) onCommit(hex);
      }}
      presets={presets}
    />
  );
}

/**
 * Colors (Bar / Horizontal bar / Pie / Donut) or Line color (Line / Area).
 * Reads the selected Chart's type and rows to show the right choices and a
 * live swatch preview. Brand colors are referenced live, never copied in.
 */
export function ChartColorsFieldEditor({
  value,
  onChange,
}: {
  value: ChartColorsSetting | undefined;
  onChange: (v: ChartColorsSetting) => void;
}) {
  const props = useTypedPuck((s) => s.selectedItem?.props as { chartType?: string; rows?: unknown } | undefined);
  const brand = useBrandHexes();
  const setting = normalizeChartColors(value);
  const type: ChartType = isChartType(props?.chartType) ? props!.chartType : "bar";
  const picks = quickPicks(brand);

  if (isSequential(type)) {
    const color = setting.base || MAGNETIX_PALETTE_HEX[0];
    return (
      <FieldLabel label={type === "area" ? "Area color" : "Line color"} icon={<Palette size={16} />} el="div">
        <div className="flex items-center gap-3">
          <ChartColorPicker value={color} onCommit={(hex) => onChange({ ...setting, base: hex })} presets={picks} />
          <span className="text-caption text-muted-foreground">{setting.base ? setting.base : "Magnetix plum"}</span>
        </div>
        {isLightOnWhite(color) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
      </FieldLabel>
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
    brandColors: brand,
  });
  const baseColor = setting.base || MAGNETIX_PALETTE_HEX[0];
  const previewHex = preview.colors.filter((c) => c.startsWith("#"));
  const lookAlike = (mode === "custom" || mode === "brand") && hasLookAlikeNeighbors(previewHex, isPartToWhole(type));
  const light = mode === "single" ? isLightOnWhite(baseColor) : mode === "custom" && previewHex.some((c) => isLightOnWhite(c));
  const basePicker = (
    <div className="mt-2 flex items-center gap-3">
      <ChartColorPicker value={baseColor} onCommit={(hex) => onChange({ ...setting, base: hex })} presets={picks} />
      <span className="text-caption text-muted-foreground">{mode === "single" ? "Bar color" : "Base color"}</span>
    </div>
  );

  return (
    <div>
      {/* The label wraps only the select, so its accessible name is just "Colors". */}
      <FieldLabel label="Colors" icon={<Palette size={16} />}>
        <AutoField
          field={{ type: "select", options: modes.map((m) => ({ label: CHART_COLOR_MODE_LABEL[m], value: m })) }}
          value={mode}
          onChange={(m: ChartColorsSetting["mode"]) => onChange({ ...setting, mode: m })}
        />
      </FieldLabel>
      {/* What each mode means, shown in full — not just the colors the current rows happen to use. */}
      {mode === "palette" ? <Swatches colors={[...MAGNETIX_PALETTE_HEX]} kind="palette" /> : null}
      {mode === "brand" ? (
        preview.brandMissing ? (
          <NoBrandColorsNotice shownInstead="The Magnetix palette shows until you add some." />
        ) : (
          <>
            <Swatches colors={brand} kind="brand" />
            {data.length > brand.length ? (
              <Hint>More rows than brand colors: lighter and darker steps of your colors fill the rest.</Hint>
            ) : null}
          </>
        )
      ) : null}
      {mode === "single" ? basePicker : null}
      {mode === "shades" ? (
        <>
          {basePicker}
          <Swatches colors={preview.colors} kind="shades" />
        </>
      ) : null}
      {mode === "custom" ? <CustomRowColors brand={brand} /> : null}
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
function CustomRowColors({ brand }: { brand: string[] }) {
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

  return (
    <ul className="mt-2 flex flex-col gap-1.5" aria-label="Custom colors" data-chart-custom-colors="">
      {rows.map((r, i) => {
        const color = normalizeHex(r.color) ?? defaultRowColor(i);
        const label = r.label?.trim() || `Row ${i + 1}`;
        return (
          <li key={i} className="flex items-center gap-2.5" data-chart-custom-row={i}>
            <ChartColorPicker value={color} onCommit={(hex) => setRowColor(i, hex)} presets={quickPicks(brand)} />
            <span className="text-body-sm min-w-0 flex-1 truncate">{label}</span>
            <span className="text-caption text-muted-foreground font-mono">{color}</span>
          </li>
        );
      })}
    </ul>
  );
}
