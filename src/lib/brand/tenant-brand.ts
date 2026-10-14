/**
 * Tenant-brand boundary helpers (design-system Phase 0, 2026-10-13).
 *
 * Tenant/public surfaces (booking, hosted forms, quotes, Community/course
 * public pages, portal, public Decoder readings, web chat…) may carry the
 * tenant's brand; the internal CRM never does. A surface opts in by rendering
 * `<div className="tenant-surface" style={tenantBrandStyle(brand)}>` — see
 * src/styles/magnetix/tenant.css. Nothing adopts it in Phase 0; adapters from
 * each surface's existing brand fields (booking accentColor, form appearance
 * accent, Community presets, course theme, Decoder theme) arrive with those
 * surfaces' migrations — no data migration.
 *
 * Magnetix keeps control of readability: the on-primary text color is
 * computed, and a primary color too light to read as text gets a darkened
 * `--brand-primary-text` variant (WCAG AA 4.5:1 on white).
 */
import type { CSSProperties } from "react";

export type TenantButtonShape = "square" | "rounded" | "pill";

/** Display fonts a tenant may choose — a curated, safe short list (body text stays the system sans). */
export const TENANT_DISPLAY_FONTS = {
  system: "var(--font-sans)",
  serif: 'Georgia, "Times New Roman", serif',
  "dm-serif-display": 'var(--font-dm-serif-display, "DM Serif Display"), Georgia, serif',
} as const;
export type TenantDisplayFont = keyof typeof TENANT_DISPLAY_FONTS;

/** Quick-pick accents for tenant appearance editors — any hex is allowed; these are just starting points. */
export const TENANT_ACCENT_SWATCHES = [
  { name: "Plum", hex: "#3D1652" },
  { name: "Forest", hex: "#2F5D50" },
  { name: "Clay", hex: "#A9472B" },
  { name: "Ocean", hex: "#1D5F8A" },
  { name: "Rose", hex: "#B83268" },
  { name: "Ink", hex: "#1F2937" },
] as const;
/** What a native colour picker shows before any accent is chosen. */
export const TENANT_ACCENT_PICKER_DEFAULT = "#5B5BD6";

export interface TenantBrand {
  name: string;
  logoUrl?: string | null;
  /** Main brand color, "#rrggbb". Absent = the neutral default (today's public look). */
  primary?: string | null;
  secondary?: string | null;
  displayFont?: TenantDisplayFont | null;
  buttonShape?: TenantButtonShape | null;
}

const RADIUS: Record<TenantButtonShape, string> = { square: "0.25rem", rounded: "0.625rem", pill: "9999px" };
const DARK_TEXT = "#111827";
const LIGHT_TEXT = "#ffffff";

/** Parses "#rgb" / "#rrggbb"; null when it isn't a hex color. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return 1;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black — whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, LIGHT_TEXT) >= contrastRatio(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** Darkens `color` until it reaches `min` contrast against `on` (for brand-colored text and links). */
export function ensureContrast(color: string, on = "#ffffff", min = 4.5): string {
  let rgb = parseHex(color);
  if (!rgb) return DARK_TEXT;
  for (let i = 0; i < 40 && contrastRatio(toHex(rgb), on) < min; i++) {
    rgb = rgb.map((v) => Math.max(0, Math.round(v * 0.92))) as [number, number, number];
  }
  return toHex(rgb);
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Inline style for a `.tenant-surface` root. Only set keys are emitted, so unset ones keep tenant.css defaults. */
export function tenantBrandStyle(brand: TenantBrand): CSSProperties {
  const vars: Record<string, string> = {};
  const primary = brand.primary && parseHex(brand.primary) ? brand.primary : null;
  if (primary) {
    vars["--brand-primary"] = primary;
    vars["--brand-on-primary"] = readableOn(primary);
    vars["--brand-primary-text"] = ensureContrast(primary);
    vars["--brand-wash"] = `color-mix(in srgb, ${primary} 6%, white)`;
  }
  const secondary = brand.secondary && parseHex(brand.secondary) ? brand.secondary : null;
  if (secondary) {
    vars["--brand-secondary"] = secondary;
    vars["--brand-on-secondary"] = readableOn(secondary);
  }
  if (brand.displayFont && brand.displayFont in TENANT_DISPLAY_FONTS) {
    vars["--brand-display-font"] = TENANT_DISPLAY_FONTS[brand.displayFont];
    // The serif display faces ship a single regular weight; the sans title is semibold.
    vars["--brand-display-weight"] = brand.displayFont === "system" ? "600" : "400";
  }
  if (brand.buttonShape) vars["--brand-radius"] = RADIUS[brand.buttonShape];
  return vars as CSSProperties;
}
