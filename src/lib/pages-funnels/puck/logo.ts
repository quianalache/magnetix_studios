export type LogoSize = "small" | "medium" | "large";

export const LOGO_HEIGHT_MIN = 48;
export const LOGO_HEIGHT_MAX = 240;
export const LOGO_HEIGHT_DEFAULT = 96;

export const LOGO_SIZE_LIMITS: Record<LogoSize, { maxHeight: number; maxWidth: number }> = {
  small: { maxHeight: 40, maxWidth: 144 },
  medium: { maxHeight: 64, maxWidth: 208 },
  large: { maxHeight: 80, maxWidth: 256 },
};

export function logoSizeLimits(size: LogoSize | undefined) {
  return LOGO_SIZE_LIMITS[size ?? "medium"];
}

export function clampLogoHeight(value: number | undefined) {
  const next = Number.isFinite(value) ? Number(value) : LOGO_HEIGHT_DEFAULT;
  return Math.min(LOGO_HEIGHT_MAX, Math.max(LOGO_HEIGHT_MIN, next));
}

export function logoHeightForLegacySize(size: LogoSize | undefined) {
  return size === "small" ? 64 : size === "large" ? 128 : LOGO_HEIGHT_DEFAULT;
}

export function hasLogoSource(logos: { src: string }[]) {
  return logos.some((logo) => logo.src.trim().length > 0);
}
