/**
 * Client Portal branding + module visibility — the real build of the
 * "Client Portal — Branding Mockup" artifact she reviewed and approved
 * (2026-08-06/07). Stored directly on the sub-account doc (`portalBranding`
 * field), same convention as `customDomain`/`paypalConfig` — one small
 * nested object rather than a new collection, since it's genuinely
 * settings, not a growing list of records.
 *
 * `resolvePortalBranding()` is the one place defaults get applied — every
 * caller (staff settings page, the real login/home views) goes through it
 * rather than reading raw possibly-undefined fields, so a sub-account that's
 * never touched this settings page still renders a sane portal.
 */

export interface PortalModuleVisibility {
  appointments: boolean;
  courses: boolean;
  projects: boolean;
  readings: boolean;
  sessions: boolean;
  invoices: boolean;
  community: boolean;
}

export type PortalPromotionType = "course" | "booking" | "offer" | "custom";

export interface PortalPromotionConfig {
  id: string;
  type: PortalPromotionType;
  targetId: string | null;
  titleOverride: string | null;
  descriptionOverride: string | null;
  urlOverride: string | null;
  hidden: boolean;
  order: number;
}

export interface PortalBranding {
  /** Null = fall back to the sub-account's own `name` (today's behavior — "Sign in to Main"). */
  portalName: string | null;
  welcomeMessage: string;
  logoUrl: string | null;
  /** Hex, e.g. "#5E2574". */
  accentColor: string;
  /** Powers the "Need help?" line on the sign-in screen. Null hides it. */
  supportEmail: string | null;
  modules: PortalModuleVisibility;
  promotions: PortalPromotionConfig[];
}

export const DEFAULT_PORTAL_MODULES: PortalModuleVisibility = {
  appointments: true,
  courses: true,
  projects: true,
  readings: true,
  sessions: true,
  invoices: true,
  community: false,
};

export const DEFAULT_PORTAL_ACCENT = "#5E2574";

export function resolvePortalBranding(
  raw: Partial<PortalBranding> | null | undefined
): PortalBranding {
  return {
    portalName: raw?.portalName ?? null,
    welcomeMessage:
      raw?.welcomeMessage ??
      "Your courses, readings, and sessions — all in one place.",
    logoUrl: raw?.logoUrl ?? null,
    accentColor: raw?.accentColor || DEFAULT_PORTAL_ACCENT,
    supportEmail: raw?.supportEmail ?? null,
    modules: { ...DEFAULT_PORTAL_MODULES, ...(raw?.modules ?? {}) },
    promotions: Array.isArray(raw?.promotions) ? raw.promotions : [],
  };
}
