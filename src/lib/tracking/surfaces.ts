/**
 * Which surfaces may load Magnetix's OWN marketing trackers (the deployment's
 * `NEXT_PUBLIC_META_PIXEL_ID` / `NEXT_PUBLIC_GTM_ID`). Owner decision
 * (Wave 3, 2026-11-04): Magnetix tracking loads only on Magnetix-owned
 * surfaces — the marketing site, auth, Magnetix's own signup/commerce pages
 * and the signed-in product. Tenant / customer-facing experiences hosted on
 * Magnetix (public Pages, Booking, hosted Forms, Quotes, payments, Community,
 * courses, client portal, Readings…) never load it, so Magnetix collects no
 * advertising events about a tenant's visitors or leads.
 *
 * This is an ALLOW-list on purpose: a route nobody classified (a new public
 * surface added later) gets NO Magnetix tracking. `scripts/check-tracking-
 * surfaces.ts` fails when a top-level app route is in neither list, so every
 * new route gets an explicit decision.
 *
 * Host matters too: on a tenant's verified custom domain everything is the
 * tenant's, whatever the path.
 */

/** First path segments that are Magnetix-owned (marketing, auth, product). */
export const MAGNETIX_OWNED_SEGMENTS = [
  // Marketing / legal
  "about",
  "affiliate-program",
  "leadstack-vs-gohighlevel",
  "founderx",
  "buy",
  "terms",
  "privacy",
  "security",
  "api-webhooks",
  "docs",
  // Auth + Magnetix signup / onboarding / thank-you
  "login",
  "signup",
  "gateway",
  "get-started",
  "thank-you",
  // Magnetix's affiliate program portal
  "affiliate",
  // Signed-in CRM / product (sub-account + agency workspaces)
  "agency",
  "sa",
  "me",
  "dashboard",
  "contacts",
  "calendar",
  "conversations",
  "forms",
  "pipeline",
  "reports",
  "tasks",
  "report-builder-review",
] as const;

/** First path segments that are tenant / customer-facing. Listed for the
 *  coverage check and for documentation; the decision itself is the allow-list
 *  above (anything not Magnetix-owned is treated as tenant). */
export const TENANT_SEGMENTS = [
  "p", // public Pages (also on custom domains)
  "b", // Booking (platform URL)
  "booking", // Booking (custom-domain URL)
  "e", // booking event management (reschedule / cancel)
  "f", // hosted Forms
  "q", // Quotes / invoices
  "pay", // payment + checkout links
  "c", // Community (platform URL)
  "communities", // Community (custom-domain mirror)
  "[groupSlug]", // Community entry /{slug}
  "u", // Unsubscribe
  "replay", // video replay links
  "my", // MyMagnetix client portal + Readings
  "portal", // client portal
  "member-password",
  "decoder", // public Reading tools + Reading reports
  "course",
  "courses",
  "offer",
  "webinar",
  "qr",
  "embed", // chat widget iframe
] as const;

/**
 * Agency-owned public commerce under otherwise-tenant segments: the agency of
 * this deployment IS Magnetix, so its own Offers and Courses are Magnetix's
 * own products (`/offer/agency/…`, `/course/agency/…`).
 */
const MAGNETIX_OWNED_PREFIXES = ["/offer/agency/", "/course/agency/"];

const OWNED = new Set<string>(MAGNETIX_OWNED_SEGMENTS);

function hostOf(origin: string | undefined | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin.includes("://") ? origin : `https://${origin}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Hosts that serve Magnetix's own surfaces: the app URL's host, the marketing
 * domain (apex + www), localhost and Vercel deployment hosts. Any other host
 * is a tenant's custom domain.
 */
export function isPlatformHost(host: string, platform: { appUrl?: string | null; primaryDomain?: string | null }): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")) return true;
  const app = hostOf(platform.appUrl);
  if (app && h === app) return true;
  const primary = hostOf(platform.primaryDomain);
  if (primary) {
    const apex = primary.replace(/^www\./, "");
    if (h === apex || h === `www.${apex}`) return true;
  }
  return false;
}

export type TrackingSurface = "magnetix" | "tenant";

export function classifyTrackingSurface(
  pathname: string,
  host: string,
  platform: { appUrl?: string | null; primaryDomain?: string | null }
): TrackingSurface {
  if (!isPlatformHost(host, platform)) return "tenant";
  const path = pathname || "/";
  if (path === "/") return "magnetix";
  if (MAGNETIX_OWNED_PREFIXES.some((prefix) => path.startsWith(prefix))) return "magnetix";
  const first = path.split("/").filter(Boolean)[0] ?? "";
  return OWNED.has(first) ? "magnetix" : "tenant";
}
