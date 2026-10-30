import type { BrandColor } from "@/types/brand-kit";
import { normalizeHex } from "@/lib/brand/brand-colors";
import { accentColor, accentTrack, type MetricAccent } from "./accent";

/**
 * Progress Bar / Progress Ring color (Phase C, 2026-10-30) — pure and
 * testable. One fill color, from one of three sources:
 *  - Magnetix: the existing named accent (`accent` prop) — unchanged, and
 *    what every block saved before this phase keeps using.
 *  - Brand color: ONE saved workspace Brand color, referenced by its stable
 *    Brand Kit id and resolved live at render time — never copied in, so
 *    edits follow and reorders don't swap it for another color.
 *  - Custom: a one-off hex saved on this block.
 */
export type ProgressColorSource = "magnetix" | "brand" | "custom";

export interface ProgressColorSetting {
  source: ProgressColorSource;
  /** Brand Kit color id (Brand color source). */
  brandColorId?: string;
  /** "#RRGGBB" (Custom source). */
  custom?: string;
}

export const DEFAULT_PROGRESS_COLOR: ProgressColorSetting = { source: "magnetix" };

export const PROGRESS_COLOR_SOURCE_LABEL: Record<ProgressColorSource, string> = {
  magnetix: "Magnetix",
  brand: "Brand color",
  custom: "Custom",
};

/** Hex used when Custom is chosen before any color is picked (Magnetix plum). */
export const PROGRESS_CUSTOM_FALLBACK = "#5E2574";

/** Neutral track behind a Brand or Custom fill (defined on :root, so it resolves on public pages). */
export const PROGRESS_NEUTRAL_TRACK = "color-mix(in srgb, var(--color-ink) 10%, transparent)";

export function normalizeProgressColor(raw: unknown): ProgressColorSetting {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ProgressColorSetting>;
  const source: ProgressColorSource = v.source === "brand" || v.source === "custom" ? v.source : "magnetix";
  const out: ProgressColorSetting = { source };
  if (typeof v.brandColorId === "string" && v.brandColorId) out.brandColorId = v.brandColorId;
  const custom = normalizeHex(v.custom);
  if (custom) out.custom = custom;
  return out;
}

/** Why a Brand color selection is showing the Magnetix color instead (builder-only notice). */
export type ProgressColorNotice = "no-brand-colors" | "brand-color-removed" | null;

export interface ResolvedProgressColor {
  fill: string;
  track: string;
  /** Color for the supporting text; undefined = the normal text color. */
  text: string | undefined;
  /** The hex actually drawn when it is a Brand/Custom color (for light-color hints). */
  hex: string | null;
  notice: ProgressColorNotice;
}

function magnetix(accent: MetricAccent | undefined, notice: ProgressColorNotice): ResolvedProgressColor {
  const a = accent ?? "plum";
  return { fill: accentColor(a), track: accentTrack(a), text: a === "default" ? undefined : accentColor(a), hex: null, notice };
}

/**
 * The fill/track for a progress block. `brandKit` is this page's workspace
 * Brand colors, passed in live. A Brand selection that no longer exists
 * (removed from the kit, or no colors saved) falls back to the block's
 * Magnetix color — never transparent, never another brand color.
 */
export function resolveProgressColor(opts: {
  accent?: MetricAccent;
  color?: unknown;
  brandKit?: readonly Pick<BrandColor, "id" | "hex">[];
}): ResolvedProgressColor {
  const setting = normalizeProgressColor(opts.color);
  if (setting.source === "custom") {
    const hex = setting.custom ?? PROGRESS_CUSTOM_FALLBACK;
    return { fill: hex, track: PROGRESS_NEUTRAL_TRACK, text: hex, hex, notice: null };
  }
  if (setting.source === "brand") {
    const kit = opts.brandKit ?? [];
    if (kit.length === 0) return magnetix(opts.accent, "no-brand-colors");
    const match = kit.find((c) => c.id === setting.brandColorId);
    const hex = normalizeHex(match?.hex);
    if (!hex) return magnetix(opts.accent, "brand-color-removed");
    return { fill: hex, track: PROGRESS_NEUTRAL_TRACK, text: hex, hex, notice: null };
  }
  return magnetix(opts.accent, null);
}

export const PROGRESS_COLOR_NOTICE_TEXT: Record<Exclude<ProgressColorNotice, null>, string> = {
  "no-brand-colors": "No brand colors saved yet, so the Magnetix color is shown. Add brand colors in Settings → Branding.",
  "brand-color-removed": "This brand color is no longer available. Choose another color.",
};
