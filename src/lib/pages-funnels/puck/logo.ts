export type LogoSize = "small" | "medium" | "large";

export const LOGO_SIZE_LIMITS: Record<LogoSize, { maxHeight: number; maxWidth: number }> = {
  small: { maxHeight: 40, maxWidth: 144 },
  medium: { maxHeight: 64, maxWidth: 208 },
  large: { maxHeight: 80, maxWidth: 256 },
};

export function logoSizeLimits(size: LogoSize | undefined) {
  return LOGO_SIZE_LIMITS[size ?? "medium"];
}

export function hasLogoSource(logos: { src: string }[]) {
  return logos.some((logo) => logo.src.trim().length > 0);
}
