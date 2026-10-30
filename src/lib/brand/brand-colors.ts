import type { BrandColor, BrandColorRole, BrandKit } from "@/types/brand-kit";
import { contrastRatio } from "./tenant-brand";

/**
 * Brand colors model helpers (pure, client- and server-safe). One sub-account
 * owns up to six colors; order gives the role (Primary, Secondary, Accent).
 */
export const BRAND_COLORS_MAX = 6;
export const BRAND_COLOR_NAME_MAX = 40;
/** Example shown in "Enter a hex color like …" messages. */
export const BRAND_HEX_EXAMPLE = "#2F5D50";
/** What a swatch shows while its hex is mid-edit and not yet valid. */
export const BRAND_SWATCH_FALLBACK = "#000000";

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** "#abc" / "abc123" / "#AbC123" → "#AABBCC"; null when it isn't a hex color. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

export function brandColorRole(index: number): BrandColorRole {
  return index === 0 ? "primary" : index === 1 ? "secondary" : "accent";
}

export const BRAND_COLOR_ROLE_LABEL: Record<BrandColorRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
};

/** True when a color is hard to see on white (graphics/text contrast under 3:1). */
export function isLightOnWhite(hex: string): boolean {
  const n = normalizeHex(hex);
  return !!n && contrastRatio(n, "#FFFFFF") < 3;
}

export function newBrandColorId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `bc_${rand}`;
}

export type BrandColorsValidation =
  | { ok: true; colors: BrandColor[] }
  | { ok: false; error: string };

/**
 * Strict validation for SAVING (the API route and the editor): every row
 * needs a valid hex; too many colors or a bad row is refused with a plain
 * message rather than silently dropped. Names are trimmed and capped; ids
 * are kept when valid and unique, otherwise replaced.
 */
export function validateBrandColors(input: unknown): BrandColorsValidation {
  if (!Array.isArray(input)) return { ok: false, error: "Brand colors must be a list." };
  if (input.length > BRAND_COLORS_MAX)
    return { ok: false, error: `You can save up to ${BRAND_COLORS_MAX} brand colors.` };
  const seen = new Set<string>();
  const colors: BrandColor[] = [];
  for (let i = 0; i < input.length; i++) {
    const row = input[i] as Partial<BrandColor> | null;
    const hex = normalizeHex(row?.hex);
    if (!hex) return { ok: false, error: `Color ${i + 1} needs a hex value like ${BRAND_HEX_EXAMPLE}.` };
    let id = typeof row?.id === "string" && ID_RE.test(row.id) ? row.id : newBrandColorId();
    if (seen.has(id)) id = newBrandColorId();
    seen.add(id);
    const name = typeof row?.name === "string" ? row.name.trim().slice(0, BRAND_COLOR_NAME_MAX) : "";
    colors.push(name ? { id, hex, name } : { id, hex });
  }
  return { ok: true, colors };
}

/**
 * Lenient read of whatever is stored: invalid rows are skipped, the list is
 * capped at six. Never throws — legacy/absent data reads as no colors.
 */
export function readBrandColors(kit: BrandKit | null | undefined): BrandColor[] {
  const raw = Array.isArray(kit?.colors) ? kit!.colors : [];
  const valid = raw.filter((c) => !!normalizeHex(c?.hex)).slice(0, BRAND_COLORS_MAX);
  const result = validateBrandColors(valid);
  return result.ok ? result.colors : [];
}

export interface ResolvedBrandColor extends BrandColor {
  role: BrandColorRole;
}

/**
 * The read path future consumers (charts, progress blocks, builder color
 * quick-picks…) will use: a workspace's brand colors in order, each with its
 * derived role. Tenant-safe by construction — it only reads the one
 * sub-account doc it is handed.
 */
export function getTenantBrandColors(sub: { brandKit?: BrandKit | null } | null | undefined): ResolvedBrandColor[] {
  return readBrandColors(sub?.brandKit).map((c, i) => ({ ...c, role: brandColorRole(i) }));
}
