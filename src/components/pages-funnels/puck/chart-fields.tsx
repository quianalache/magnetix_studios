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

function Hint({ tone = "muted", children }: { tone?: "muted" | "warning"; children: React.ReactNode }) {
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

function quickPicks(brand: string[]) {
  return [
    ...brand.map((hex, i) => ({ label: `Brand color ${i + 1}`, value: hex })),
    ...MAGNETIX_PALETTE_HEX.map((hex, i) => ({ label: `Magnetix color ${i + 1}`, value: hex })),
  ];
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-hidden="true" data-chart-color-preview="">
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
function ChartColorPicker({ value, onCommit, presets }: { value: string; onCommit: (hex: string) => void; presets: { label: string; value: string }[] }) {
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
  const sub = useOptionalSubAccount();
  const brand = useBrandHexes();
  const setting = normalizeChartColors(value);
  const type: ChartType = isChartType(props?.chartType) ? props!.chartType : "bar";
  const picks = quickPicks(brand);
  const brandingHref = sub ? sub.saPath("/dashboard/settings?section=branding") : null;

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
  const showBase = mode === "single" || mode === "shades";
  const previewHex = preview.colors.filter((c) => c.startsWith("#"));
  const lookAlike = (mode === "custom" || mode === "brand") && hasLookAlikeNeighbors(previewHex, isPartToWhole(type));
  const light = mode === "single" ? isLightOnWhite(baseColor) : mode === "custom" && previewHex.some((c) => isLightOnWhite(c));

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
      {mode === "brand" && preview.brandMissing ? (
        <div className="border-border bg-muted/40 text-caption mt-2 rounded-lg border px-3 py-2">
          <p className="font-medium">No brand colors saved yet.</p>
          <p className="text-muted-foreground">
            The Magnetix palette shows until you add some.{" "}
            {brandingHref ? (
              <a href={brandingHref} target="_blank" rel="noreferrer" className="text-link font-medium underline-offset-2 hover:underline">
                Add brand colors in Settings → Branding
              </a>
            ) : (
              "Add brand colors in Settings → Branding."
            )}
          </p>
        </div>
      ) : (
        <Swatches colors={preview.colors} />
      )}
      {showBase ? (
        <div className="mt-3 flex items-center gap-3">
          <ChartColorPicker value={baseColor} onCommit={(hex) => onChange({ ...setting, base: hex })} presets={picks} />
          <span className="text-caption text-muted-foreground">{mode === "single" ? "Bar color" : "Base color"}</span>
        </div>
      ) : null}
      {mode === "brand" && !preview.brandMissing && data.length > brand.length ? (
        <Hint>More rows than brand colors: lighter and darker steps of your colors fill the rest.</Hint>
      ) : null}
      {mode === "custom" ? <Hint>Set each color in its Data row.</Hint> : null}
      {light ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
      {lookAlike ? <Hint tone="warning">These colors look very alike.</Hint> : null}
    </div>
  );
}

/** Row index from a Puck array sub-field name like "rows[2].color". */
function rowIndexFromName(name: string | undefined): number {
  const m = /\[(\d+)\]/.exec(name ?? "");
  return m ? Number(m[1]) : 0;
}

/** Color inside each Data row (Custom mode). Saved on the row, so reorder/delete keep it with its row. */
export function ChartRowColorFieldEditor({
  value,
  name,
  onChange,
}: {
  value: string | undefined;
  name?: string;
  onChange: (v: string) => void;
}) {
  const brand = useBrandHexes();
  const color = normalizeHex(value) ?? defaultRowColor(rowIndexFromName(name));
  return (
    <FieldLabel label="Color" icon={<Palette size={16} />} el="div">
      <div className="flex items-center gap-3">
        <ChartColorPicker value={color} onCommit={onChange} presets={quickPicks(brand)} />
        <span className="text-caption text-muted-foreground font-mono">{color}</span>
      </div>
      {isLightOnWhite(color) ? <Hint tone="warning">Light colors can be hard to see on white.</Hint> : null}
    </FieldLabel>
  );
}

