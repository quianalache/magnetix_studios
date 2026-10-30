import type { ChartType } from "./chart";
import { chartColor, isPartToWhole, isSequential } from "./chart";
import { normalizeHex } from "@/lib/brand/brand-colors";
import { parseHex } from "@/lib/brand/tenant-brand";

/**
 * Chart colors (Phase B, 2026-10-30) — pure, deterministic, testable.
 *
 * Three different sources, never mixed up:
 *  - Magnetix palette: the system chart colors (CSS tokens on :root).
 *  - Brand colors: the workspace's saved Brand colors (Settings → Branding),
 *    passed in LIVE at render time — never copied into the chart.
 *  - Custom: one-off colors saved on each Data row of this chart.
 */
export type ChartColorMode = "palette" | "brand" | "single" | "shades" | "custom";

export interface ChartColorsSetting {
  mode: ChartColorMode;
  /** "One color" / "Shades" base, and the Line/Area color. "" = Magnetix color 1. */
  base?: string;
}

export const DEFAULT_CHART_COLORS: ChartColorsSetting = { mode: "palette", base: "" };

/** Hex equivalents of the Magnetix chart palette (same order as CHART_PALETTE). */
export const MAGNETIX_PALETTE_HEX = ["#5E2574", "#DB4A93", "#C79BD8", "#14A7B4", "#E3A63B", "#5563E0", "#16A34A", "#8E88A8"] as const;

export const CHART_COLOR_MODE_LABEL: Record<ChartColorMode, string> = {
  palette: "Magnetix palette",
  brand: "Brand colors",
  single: "One color",
  shades: "Shades of one color",
  custom: "Custom",
};

/** The Colors choices each chart type offers. Line/Area: none (a single color control instead). */
export function colorModesFor(type: ChartType): ChartColorMode[] {
  if (isSequential(type)) return [];
  if (isPartToWhole(type)) return ["palette", "brand", "shades", "custom"];
  return ["palette", "brand", "single", "custom"];
}

/**
 * The mode that actually applies to this chart type. A setting carried over
 * from another type maps sensibly (One color ↔ Shades); Line/Area always use
 * their single color.
 */
export function effectiveColorMode(type: ChartType, mode: unknown): ChartColorMode {
  if (isSequential(type)) return "single";
  const m = (typeof mode === "string" ? mode : "palette") as ChartColorMode;
  const allowed = colorModesFor(type);
  if (allowed.includes(m)) return m;
  if (m === "single" && allowed.includes("shades")) return "shades";
  if (m === "shades" && allowed.includes("single")) return "single";
  return "palette";
}

export function normalizeChartColors(raw: unknown): ChartColorsSetting {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ChartColorsSetting>;
  const mode = (["palette", "brand", "single", "shades", "custom"] as const).includes(v.mode as ChartColorMode)
    ? (v.mode as ChartColorMode)
    : "palette";
  return { mode, base: normalizeHex(v.base) ?? "" };
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Mix a color toward white (amount > 0) or black (amount < 0); amount in −1..1. */
export function shiftHex(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = amount >= 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(amount));
  return toHex(rgb.map((c) => c + (target - c) * a) as [number, number, number]);
}

function relLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2]);
}

/** Lighter/darker steps used after the saved colors run out (alternating). */
const BRAND_STEPS = [0, 0.38, -0.28, 0.58, -0.45];
/** For colors too light to lighten further / too dark to darken further: one direction only. */
const BRAND_STEPS_DARKEN = [0, -0.2, -0.36, -0.5, -0.62];
const BRAND_STEPS_LIGHTEN = [0, 0.25, 0.42, 0.56, 0.68];
const TOO_LIGHT = 0.7; // relative luminance: too faint on a white page (contrast < ~1.4)
const TOO_DARK = 0.025; // near-black

/** The step table for one brand color, so no variant goes near-white or near-black. */
function brandSteps(hex: string): number[] {
  if (relLuminance(shiftHex(hex, Math.max(...BRAND_STEPS))) > TOO_LIGHT) return BRAND_STEPS_DARKEN;
  if (relLuminance(shiftHex(hex, Math.min(...BRAND_STEPS))) < TOO_DARK) return BRAND_STEPS_LIGHTEN;
  return BRAND_STEPS;
}

/**
 * Colors for `count` rows from the workspace's Brand colors. The saved colors
 * come first, in order; after that, each saved color reappears as a lighter
 * then darker variant (A, B, A-light, B-light, A-dark, …) — so a chart never
 * jumps to Magnetix colors halfway through, and neighbors never repeat.
 */
export function brandColorSequence(brand: string[], count: number): string[] {
  const colors = brand.map((h) => normalizeHex(h)).filter((h): h is string => !!h);
  if (colors.length === 0 || count <= 0) return [];
  const tables = colors.map(brandSteps);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % colors.length;
    const table = tables[c];
    const round = Math.floor(i / colors.length);
    // Past the table (very long charts): the in-between steps, so neighbors still differ.
    const step = round < table.length ? table[round] : table[1 + ((round - table.length) % (table.length - 1))] * 0.55;
    out.push(step === 0 ? colors[c] : shiftHex(colors[c], step));
  }
  return out;
}

/** A readable dark-to-light ramp of one base color (Pie/Donut "Shades of one color"). */
export function shadesRamp(base: string, count: number): string[] {
  const hex = normalizeHex(base) ?? MAGNETIX_PALETTE_HEX[0];
  if (count <= 0) return [];
  if (count === 1) return [hex];
  const lum = relLuminance(hex);
  // Keep the light end visible on white and the dark end off pure black.
  const darkest = lum < 0.08 ? -0.1 : -0.5;
  const lightest = lum > 0.5 ? 0.35 : 0.72;
  // Eased spacing: bigger steps at the dark end, where a shift reads as smaller.
  return Array.from({ length: count }, (_, i) => shiftHex(hex, darkest + (lightest - darkest) * (i / (count - 1)) ** 0.8));
}

export interface ChartColorInput {
  /** The row's position in the customer's list. */
  index: number;
  /** Custom color saved on the row, if any. */
  color?: string;
}

export interface ResolvedChartColors {
  /** One color per datum, in the order the data is drawn. */
  colors: string[];
  mode: ChartColorMode;
  /** Brand colors chosen but none saved — the chart shows the Magnetix palette until some are. */
  brandMissing: boolean;
}

/**
 * The color for every datum. `data` is in draw order (after sorting);
 * `rowCount` is the customer's full row count, so a row keeps its color when
 * the chart is re-sorted.
 */
export function resolveChartColors(opts: {
  type: ChartType;
  setting: ChartColorsSetting;
  data: ChartColorInput[];
  rowCount: number;
  brandColors?: string[];
}): ResolvedChartColors {
  const mode = effectiveColorMode(opts.type, opts.setting.mode);
  const base = normalizeHex(opts.setting.base) ?? "";
  const palette = (i: number) => chartColor(i);
  if (isSequential(opts.type)) {
    return { mode, brandMissing: false, colors: opts.data.map(() => base || palette(0)) };
  }
  switch (mode) {
    case "brand": {
      const seq = brandColorSequence(opts.brandColors ?? [], Math.max(opts.rowCount, ...opts.data.map((d) => d.index + 1)));
      if (seq.length === 0) return { mode, brandMissing: true, colors: opts.data.map((d) => palette(d.index)) };
      return { mode, brandMissing: false, colors: opts.data.map((d) => seq[d.index]) };
    }
    case "single":
      return { mode, brandMissing: false, colors: opts.data.map(() => base || MAGNETIX_PALETTE_HEX[0]) };
    case "shades": {
      const ramp = shadesRamp(base || MAGNETIX_PALETTE_HEX[0], opts.data.length);
      return { mode, brandMissing: false, colors: ramp };
    }
    case "custom":
      return {
        mode,
        brandMissing: false,
        colors: opts.data.map((d) => normalizeHex(d.color) ?? MAGNETIX_PALETTE_HEX[d.index % MAGNETIX_PALETTE_HEX.length]),
      };
    default:
      return { mode: "palette", brandMissing: false, colors: opts.data.map((d) => palette(d.index)) };
  }
}

/** The default color a new Custom row gets: the next Magnetix palette color, never black. */
export function defaultRowColor(index: number): string {
  return MAGNETIX_PALETTE_HEX[((index % MAGNETIX_PALETTE_HEX.length) + MAGNETIX_PALETTE_HEX.length) % MAGNETIX_PALETTE_HEX.length];
}

/** Perceptual-ish RGB distance ("redmean"); 0 = identical, ~765 = black vs white. */
export function colorDistance(a: string, b: string): number {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return Infinity;
  const rm = (pa[0] + pb[0]) / 2;
  const dr = pa[0] - pb[0];
  const dg = pa[1] - pb[1];
  const db = pa[2] - pb[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export const TOO_SIMILAR_DISTANCE = 60;

/** True when two neighbors (and, for Pie/Donut, last↔first) look very alike. */
export function hasLookAlikeNeighbors(colors: string[], wrap = false): boolean {
  const hex = colors.map((c) => normalizeHex(c)).filter((c): c is string => !!c);
  for (let i = 1; i < hex.length; i++) if (colorDistance(hex[i - 1], hex[i]) < TOO_SIMILAR_DISTANCE) return true;
  return wrap && hex.length > 2 && colorDistance(hex[hex.length - 1], hex[0]) < TOO_SIMILAR_DISTANCE;
}
