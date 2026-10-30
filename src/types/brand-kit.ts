/**
 * Workspace Brand colors (Phase A, 2026-10-30) — a sub-account's own saved
 * brand colors, edited in Settings → Workspace → Branding. Stored on the
 * sub-account doc as `brandKit` (additive; absent = no brand colors yet).
 *
 * Roles are NOT stored: the 1st color is Primary, the 2nd Secondary, the
 * rest Accent — derived from order (`brandColorRole`), so reordering can
 * never leave a stale role behind.
 *
 * Nothing applies these automatically yet. Charts, progress blocks, builder
 * color quick-picks and other surfaces will read them through
 * `getTenantBrandColors` in later phases.
 */
export interface BrandColor {
  /** Stable id so reorders and edits keep their identity. */
  id: string;
  /** "#RRGGBB", upper case. */
  hex: string;
  /** Optional customer label, e.g. "Forest". */
  name?: string;
}

export type BrandColorRole = "primary" | "secondary" | "accent";

export interface BrandKit {
  colors: BrandColor[];
  updatedAt?: unknown;
}
