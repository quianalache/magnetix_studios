import type { BrandColor } from "@/types/brand-kit";
import { normalizeHex } from "@/lib/brand/brand-colors";
import { accentColor, accentTrack, type MetricAccent } from "./accent";

/**
 * Progress Bar / Progress Ring color (Phase C, 2026-10-30) — pure and
 * testable. One fill color. Customers choose (owner decision 2026-11-01):
 *  - Brand color: ONE saved workspace Brand color, referenced by its stable
 *    Brand Kit id and resolved live at render time — never copied in, so
 *    edits follow and reorders don't swap it for another color. With no id
 *    (a new block) it follows the Primary brand color.
 *  - Custom: a one-off hex saved on this block.
 * "magnetix" is LEGACY ONLY — never offered. Blocks saved with it (or with no
 * color setting at all) keep rendering their named `accent` exactly as before.
 */
export type ProgressColorSource = "magnetix" | "brand" | "custom";

export interface ProgressColorSetting {
  source: ProgressColorSource;
  /** Brand Kit color id (Brand color source). */
  brandColorId?: string;
  /** "#RRGGBB" (Custom source). */
  custom?: string;
}

/**
 * The Progress blocks' `defaultProps` value. Puck fills a saved block's
 * MISSING props from defaultProps, so this must stay legacy — blocks saved
 * before color sources existed keep their named color.
 */
export const DEFAULT_PROGRESS_COLOR: ProgressColorSetting = { source: "magnetix" };

/**
 * What a Progress block gets when it is INSERTED (owner decision
 * 2026-11-01): the workspace's Primary brand color, live. With none saved,
 * the internal plum fallback. Applied by resolveData on "insert".
 */
export const NEW_PROGRESS_COLOR: ProgressColorSetting = { source: "brand" };

/** The choices customers are offered — "magnetix" is legacy only and never listed. */
export const PROGRESS_COLOR_CHOICES: { value: Exclude<ProgressColorSource, "magnetix">; label: string }[] = [
  { value: "brand", label: "Brand color" },
  { value: "custom", label: "Custom" },
];

/** Hex used when a Custom block has no color saved (unchanged since Phase C, so no existing block shifts). */
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
    // A new block (no specific pick) with no brand colors saved: the internal fallback, quietly.
    if (kit.length === 0) return magnetix(opts.accent, setting.brandColorId ? "no-brand-colors" : null);
    const match = setting.brandColorId ? kit.find((c) => c.id === setting.brandColorId) : kit[0];
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
