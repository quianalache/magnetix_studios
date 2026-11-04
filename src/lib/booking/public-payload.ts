import { resolveBookingLogo } from "@/lib/brand/workspace-logo";
import type { BookingPage } from "@/types/booking";
import type { TenantDisplayFont } from "@/lib/brand/tenant-brand";

/**
 * What the visitor booking experience needs from a Booking Page — the one
 * shape `PublicBookingView` / `BookingExperience` read. Built from the real
 * Booking Page doc by the public booking route and by the Pages & Funnels
 * Booking block, so both always show the same booking (no second copy of
 * any booking setting lives anywhere else).
 */
export type PublicBookingPageData = Pick<
  BookingPage,
  "slug" | "name" | "description" | "timezone" | "durationMinutes" | "payment" | "visibleDays" | "intakeFields"
>;

export interface PublicBookingBranding {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  /** Curated display font key (TENANT_DISPLAY_FONTS); null = system sans. */
  displayFont?: TenantDisplayFont | null;
}

/** The visitor-safe subset of a Booking Page (no hosts, meeting link, reminders, etc.). */
export function publicBookingPageData(page: BookingPage): PublicBookingPageData {
  return {
    slug: page.slug,
    name: page.name,
    description: page.description ?? "",
    timezone: page.timezone,
    durationMinutes: page.durationMinutes,
    payment: page.payment ?? null,
    visibleDays: page.visibleDays,
    intakeFields: Array.isArray(page.intakeFields) ? page.intakeFields : [],
  };
}

/** Branding: per-page overrides win, then the workspace, then a neutral fallback. */
export function publicBookingBranding(page: BookingPage, sub: { name?: string | null; logoUrl?: string | null } | null | undefined): PublicBookingBranding {
  return {
    name: page.brandName || sub?.name || "Schedule a meeting",
    logoUrl: resolveBookingLogo(page, sub),
    accentColor: page.accentColor ?? null,
    displayFont: (page.displayFont as TenantDisplayFont | null | undefined) ?? null,
  };
}

/** One Booking block's resolved source (page-anchored; see lib/server/page-booking-resolver.ts). */
export interface BookingBlockPayload {
  /** The page's own workspace — the booking engine's `/api/booking/{subAccountId}/{slug}/*`. */
  subAccountId: string;
  status: "published" | "draft";
  page: PublicBookingPageData;
  branding: PublicBookingBranding;
  /** The Booking Page's public URL (custom-domain aware) — the canonical `booking` destination. */
  href: string;
}
