import type { ContactAttribution } from "@/types/contacts";
import { classifyReferrerSource } from "@/lib/attribution-source";

/**
 * Whitelisted raw fields a caller may forward from the browser — everything
 * BEFORE server-side derivation (`referrerSource` is never accepted from a
 * client; `normalizeAttribution` derives it itself so it can't be spoofed).
 */
const ATTRIBUTION_KEYS: (keyof Omit<ContactAttribution, "referrerSource">)[] = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "fbclid",
  "gclid",
  "landingPage",
  "referrer",
];

/**
 * Normalizes a caller-supplied attribution payload (from a form/booking/
 * offer POST body) into a clean `ContactAttribution` — whitelists the raw
 * fields, trims + truncates each to 500 chars, and derives `referrerSource`
 * server-side from `referrer` (a referrer-based fallback channel label,
 * ONLY when the caller didn't already supply `utmSource` — explicit UTM
 * tagging always wins). Returns null when nothing survives.
 *
 * Server-safe (no browser globals) — call this from any API route.
 */
export function normalizeAttribution(
  input: Partial<ContactAttribution> | null | undefined,
): ContactAttribution | null {
  if (!input || typeof input !== "object") return null;
  const out: ContactAttribution = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    fbclid: null,
    gclid: null,
    landingPage: null,
    referrer: null,
    referrerSource: null,
  };
  let touched = false;
  for (const key of ATTRIBUTION_KEYS) {
    const raw = input[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      out[key] = raw.trim().slice(0, 500);
      touched = true;
    }
  }
  if (!out.utmSource && out.referrer) {
    const guess = classifyReferrerSource(out.referrer);
    if (guess) {
      out.referrerSource = guess.key;
      touched = true;
    }
  }
  return touched ? out : null;
}

/**
 * Reads marketing attribution from the current page's URL params + document
 * referrer. Used by the hosted form page (/f/[id]), the booking page, and
 * course-offer checkout to forward attribution data with the submission so
 * the resulting contact/booking/purchase carries its source. Returns only
 * the raw fields — `referrerSource` is always null here and gets derived
 * server-side by `normalizeAttribution`, never computed client-side.
 *
 * Note for iframe embeds: this reads the IFRAME'S URL, not the host page's.
 * If the agency embeds the form via iframe and wants host-page attribution
 * to flow through, they must encode the UTMs in the iframe src — e.g.
 * `<iframe src="/f/abc123?utm_source=meta&utm_campaign=spring"></iframe>`.
 * Cross-origin iframes can't read window.parent.location.
 */
export function readAttributionFromBrowser(): ContactAttribution | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const pick = (key: string): string | null => {
    const v = params.get(key);
    return v && v.trim().length > 0 ? v.trim().slice(0, 500) : null;
  };

  const referrer =
    document.referrer && document.referrer.length > 0
      ? document.referrer.slice(0, 500)
      : null;
  const landingPage = window.location.href.slice(0, 500);

  const utmSource = pick("utm_source");
  const utmMedium = pick("utm_medium");
  const utmCampaign = pick("utm_campaign");
  const utmContent = pick("utm_content");
  const utmTerm = pick("utm_term");
  const fbclid = pick("fbclid");
  const gclid = pick("gclid");

  const hasAnyTracking =
    utmSource ||
    utmMedium ||
    utmCampaign ||
    utmContent ||
    utmTerm ||
    fbclid ||
    gclid ||
    referrer;

  if (!hasAnyTracking) return null;

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    fbclid,
    gclid,
    landingPage,
    referrer,
    referrerSource: null,
  };
}

type FbqArgs =
  | [event: "init", pixelId: string]
  | [event: "track", eventName: string, params?: Record<string, unknown>];

interface FbqFn {
  (...args: FbqArgs): void;
  callMethod?: (...args: unknown[]) => unknown;
  queue?: unknown[];
}

declare global {
  interface Window {
    fbq?: FbqFn;
  }
}

/**
 * Fires Meta Pixel `Lead` event. No-op when the pixel isn't loaded
 * (NEXT_PUBLIC_META_PIXEL_ID unset). Safe to call from any client component.
 */
export function trackLeadEvent(params?: {
  email?: string;
  phone?: string;
  utmCampaign?: string | null;
}) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }
  try {
    window.fbq("track", "Lead", {
      content_name: params?.utmCampaign ?? undefined,
    });
  } catch {
    // Pixel errors should never break form submission UX.
  }
}
