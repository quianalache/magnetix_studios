import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { normalizeAttribution } from "@/lib/attribution";
import {
  bumpAttributionVisit,
  claimUniqueVisitorSlot,
} from "@/lib/attribution-visits";
import { recordFirstTouchIfAbsent } from "@/lib/attribution-first-touch";

export const dynamic = "force-dynamic";

/**
 * Agency Acquisition Foundation (2026-08-31) — public acquisition-tracking
 * beacon for the agency's own EXTERNALLY-hosted sales page (GitPage today;
 * "vendor-agnostic" by design, see the tracking snippet at
 * GET /api/track/acquisition/snippet.js). Called cross-origin, with no
 * session, from ordinary browser JavaScript pasted onto that page.
 *
 * Reuses the SAME attribution vocabulary/infrastructure booking + course-
 * offer pages already use — `normalizeAttribution`, `bumpAttributionVisit`
 * (new `pageType: "platformSignup"`), `recordFirstTouchIfAbsent` — rather
 * than inventing a second analytics system (Sales & Affiliate
 * Infrastructure audit, Part 4/13). This is also the SAME service surface
 * a future native Magnetix Pages & Funnels page would call directly
 * (in-process, no HTTP round-trip) instead of the external script — see
 * Part 14 of that audit.
 *
 * SECURITY (audit item 17 — tracking is analytics, not authorization):
 *   - No agencyId is ever accepted from the client. It's resolved
 *     server-side via `resolveFirstAgencyId()` — the SAME resolution the
 *     checkout-session endpoint and the get-started page already trust —
 *     so a forged `agencyId` in the request body is structurally
 *     impossible; the field doesn't exist.
 *   - No secret/API key is required or accepted. There is nothing here to
 *     steal: this endpoint can only ever increment analytics counters.
 *   - This route NEVER writes to `purchases` or `subAccounts`. It writes
 *     ONLY to `attributionVisits`, `attributionFirstTouch`, and
 *     `attributionSessionSeen` — none of which any provisioning or
 *     entitlement check anywhere in this codebase reads. A flood of forged
 *     tracking events can, at worst, inflate an analytics counter; it can
 *     never provision a workspace, grant a feature gate, or move money.
 *   - Rate-limited per IP (in-memory, per-instance — same acknowledged
 *     limitation as `/api/track/visit`) and bot-UA filtered.
 *   - Every string field is length-capped by `normalizeAttribution`
 *     (500 chars) before it ever reaches Firestore.
 *   - Always returns 200 — even on rate-limit, bad body, or an unconfigured
 *     deployment — so a misbehaving or blocked beacon never shows up as a
 *     console error on someone else's page.
 *
 * CORS: reflects the caller's Origin (matches the existing
 * `/api/web-chat/*` pattern for the same reason — a public, unauthenticated,
 * side-effect-limited endpoint meant to be called from any third-party
 * page the agency owner pastes the snippet onto).
 */

interface TrackBody {
  url?: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  /** Foundation for future affiliate-referral attribution — stored, not
   *  used for any commission calculation (out of scope, see Part 15). */
  ref?: string | null;
  /** Long-lived (localStorage) anonymous id — powers first-touch only. */
  visitorId?: string;
  /** Short-lived (sessionStorage) anonymous id — powers the "unique-ish
   *  visitors" counter only. See this route's doc comment + the snippet
   *  for what it actually measures and its limitations. */
  sessionId?: string;
}

const IP_HOURLY_CAP = 240;
const WINDOW_MS = 60 * 60_000;
const ipHits = new Map<string, number[]>();

function pushAndCheck(key: string): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = (ipHits.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= IP_HOURLY_CAP) {
    ipHits.set(key, arr);
    return true;
  }
  arr.push(now);
  ipHits.set(key, arr);
  if (ipHits.size > 5000) {
    const oldest = ipHits.keys().next().value;
    if (oldest !== undefined) ipHits.delete(oldest);
  }
  return false;
}

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Same bot-UA set as /api/track/visit — kept in sync deliberately, not
// imported, since these two routes are still allowed to diverge (e.g. a
// future ad-network prefetch allowance here) without touching the older one.
const BOT_UA_RE =
  /bot|spider|crawl|slurp|facebookexternalhit|pingdom|uptimerobot|headlesschrome|phantomjs/i;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  // Production QA (2026-08-31) found a real defect here: navigator.sendBeacon
  // — the snippet's PRIMARY delivery method, tried before the fetch fallback
  // — is unconditionally sent with `credentials: "include"` per the Beacon
  // API spec; that's not something the caller can opt out of. A browser
  // refuses to complete ANY credentialed cross-origin request unless the
  // response carries `Access-Control-Allow-Credentials: true`, and per spec
  // that header is only meaningful (and only honored by browsers) alongside
  // a SPECIFIC `Access-Control-Allow-Origin` — never "*". So this is safe to
  // set unconditionally: when `origin` is present (every real browser
  // sendBeacon/fetch call always sends one) it's already reflected verbatim
  // above, satisfying that requirement; the "*" fallback only ever fires for
  // non-browser callers (curl, a server) that send no Origin header at all,
  // where credentials are moot. Confirmed live: without this header, every
  // real external sales page's beacon silently failed at the CORS preflight
  // — reproduced via a real cross-origin browser load, not just curl (curl
  // doesn't enforce CORS, which is why every earlier same-origin-equivalent
  // test passed despite this bug). This endpoint reads no cookie for its own
  // logic either way — it's a public, anonymous, analytics-only route — so
  // there's no confidentiality downside to accepting credentials.
  if (origin) headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

function trim(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, max) : null;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  const noop = () => NextResponse.json({ ok: true }, { headers });

  const ip = getClientIp(request);
  if (pushAndCheck(ip)) return noop();

  const ua = request.headers.get("user-agent") ?? "";
  if (BOT_UA_RE.test(ua)) return noop();

  let body: TrackBody;
  try {
    body = (await request.json()) as TrackBody;
  } catch {
    return noop();
  }

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return noop(); // no agency provisioned on this deployment yet

  const attribution = normalizeAttribution({
    utmSource: trim(body.utm_source),
    utmMedium: trim(body.utm_medium),
    utmCampaign: trim(body.utm_campaign),
    utmContent: trim(body.utm_content),
    utmTerm: trim(body.utm_term),
    referrer: trim(body.referrer),
    gclid: trim(body.gclid),
    fbclid: trim(body.fbclid),
    landingPage: trim(body.url),
  });
  const referralCode = trim(body.ref, 80);
  const visitorId = trim(body.visitorId, 100);
  const sessionId = trim(body.sessionId, 100);

  // One fixed page id per agency — there is exactly one primary sales page
  // per agency today (Part 2 of the audit). Using the agencyId itself as
  // pageId keeps this forward-compatible with a future multi-page world
  // (Pages & Funnels) without a schema change: a native page would pass
  // its own pageId instead.
  const pageId = agencyId;

  try {
    await bumpAttributionVisit({
      subAccountId: null,
      agencyId,
      pageType: "platformSignup",
      pageId,
      attribution,
      field: "visits",
    });

    if (sessionId) {
      const isNewSession = await claimUniqueVisitorSlot({
        pageType: "platformSignup",
        pageId,
        sessionId,
      });
      if (isNewSession) {
        await bumpAttributionVisit({
          subAccountId: null,
          agencyId,
          pageType: "platformSignup",
          pageId,
          attribution,
          field: "uniqueVisitors",
        });
      }
    }

    if (visitorId) {
      await recordFirstTouchIfAbsent({
        visitorId,
        agencyId,
        attribution,
        landingPage: trim(body.url),
        referralCode,
      });
    }
  } catch (err) {
    console.warn("[track/acquisition] write failed", err);
  }

  return noop();
}
