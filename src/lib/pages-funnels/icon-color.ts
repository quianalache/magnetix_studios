import { resolveNavColor, type NavColorSetting } from "@/lib/pages-funnels/navigation";

/**
 * Icon block colors (Wave 3): Default / Brand color / Custom, the shared
 * color model. Older Icon blocks stored a free-text CSS color string; that
 * still renders exactly as before. Pure + server-safe.
 */
export type IconColorValue = string | NavColorSetting | null | undefined;

export function toIconColorSetting(value: IconColorValue): NavColorSetting {
  if (value && typeof value === "object") return value;
  const legacy = typeof value === "string" ? value.trim() : "";
  return legacy ? { source: "custom", custom: legacy } : { source: "default" };
}

/** The CSS color to paint, or "" for the block default. */
export function resolveIconColor(value: IconColorValue, brandKit?: readonly { id: string; hex: string }[]): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return resolveNavColor(value, brandKit) ?? "";
}
