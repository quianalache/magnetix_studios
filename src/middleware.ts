import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authMiddleware } from "next-firebase-auth-edge/lib/next/middleware";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/terms",
  "/privacy",
  "/security",
  "/api-webhooks",
  "/about",
  "/thank-you",
  // Affiliate direct "Buy now" link (/buy?ref=CODE). Sets the referral
  // cookie client-side then bounces to Stripe checkout. Public — no session.
  "/buy",
  // Secret webinar-only founders landing. Unlinked + noindex (page
  // metadata); the URL is only shared during webinars. Public — no session.
  "/founderx",
  // Public docs (e.g. /docs/updating — the "keeping your app up to date"
  // guide linked from /thank-you and shareable as a stable URL).
  "/docs",
  "/f",
  // Public Pages & Funnels published-page route (src/app/p/[pageId]) — a
  // genuine pre-existing gap found while wiring the Puck Persistence +
  // Publish Foundation task's mandatory "open /p/[pageId]" QA: this route
  // was never actually reachable without a session (it 307-redirected to
  // /login exactly like every authenticated route), for V1-published pages
  // too, not just Puck ones — the route itself has always correctly gated
  // on `status === "published"` and used the Admin SDK precisely because
  // it was meant to be public, but nothing told the middleware that. Added
  // here the same way "/f" (public forms) already is.
  "/p",
  "/api/forms",
  "/api/auth/signup",
  // Workflow Builder step worker — QStash callback, signature-verified inside
  // the route.
  "/api/workflows/step",
  "/api/broadcasts/email/step",
  "/api/checkout",
  "/api/cron/gitpage-heartbeat",
  // Daily sweep for the public API's TTL'd collections (apiRequestLogs,
  // apiIdempotency, webhookEvents). Replaces native Firestore TTL so the
  // buyer doesn't need to click into the Firebase console — QStash is
  // already part of their onboarding. Signature-verified inside the route.
  "/api/cron/api-cleanup",
  // Hourly Inbox Follow-up Watchdog sweep (Labs). QStash-scheduled;
  // signature-verified inside the route.
  "/api/agents/watchdog/step",
  // Google Calendar pull-in sync — QStash-scheduled (every 15 min) plus a
  // one-off immediate trigger right after a new connection. Missing from
  // this list meant every call was silently 307-redirected by the auth
  // check before ever reaching the route's own signature verification,
  // so connections would show "Connected" but never actually sync.
  "/api/cron/google-calendar-sync",
  "/api/landing/metrics",
  "/api/landing/recent-purchases",
  // Live-visitors heartbeat ping for the agency dashboard's world map.
  // Public POST from every landing-page browser every ~5s. Validation
  // + best-effort failure handling inside the route — never breaks
  // the landing experience.
  "/api/landing/heartbeat",
  // Booking/offer page visit + conversion beacon — public POST from every
  // visitor landing on those public pages (most have no session at all).
  // Existence + published-status checked inside the route; best-effort,
  // never blocks the page it's tracking.
  "/api/track/visit",
  "/api/webhooks/twilio",
  "/api/webhooks/stripe",
  // Resend inbound-email webhook — public POST from Resend's cloud.
  // Security: Svix signature (RESEND_WEBHOOK_SECRET) verified inside the
  // route before anything else runs.
  "/api/webhooks/resend",
  // Meta (Facebook Messenger + Instagram DM) webhook — BETA. Public from the
  // Meta cloud: GET is the verify-token handshake, POST carries message events.
  // Security: X-Hub-Signature-256 (HMAC of the raw body with the app secret)
  // verified inside the route; per-sub-account routing by Page / IG id.
  "/api/webhooks/meta",
  // Post-payment GitHub-invite endpoint. Public POST from the buyer's
  // browser on the /thank-you page. Security: 256-bit claim token in
  // the request body must hash-match the value stored on
  // purchases/{sessionId} by the Stripe webhook; 3-attempt permanent
  // lock per session on top.
  "/api/github",
  // Vapi voice-agent webhooks — public from the Vapi cloud. Security:
  //   - Authorization: Bearer ${VAPI_WEBHOOK_SECRET} header check inside
  //     each route (custom header configured per-assistant in the Vapi
  //     dashboard / via our provisioning code).
  //   - Routes scoped by [subAccountId] path param so a leaked secret
  //     can only impersonate one sub-account at worst.
  "/api/webhooks/vapi",
  // Web Chat widget — public from-the-browser API. Security:
  //  - Origin header validated against per-sub-account allowedDomains
  //  - In-memory per-IP + per-session rate limits
  //  - Anonymous sessions; identity only captured via [[capture …]] marker
  "/api/web-chat",
  // Embed pages — the chat widget iframe target. Public; the bot
  // can't send messages without passing the /api/web-chat/* origin check.
  "/embed",
  // Widget loader JS — public static file served from /public.
  "/widget.js",
  // PWA — the manifest is fetched by the browser without credentials on
  // every page (including /login), and the service worker script must be
  // publicly fetchable for registration. Both are harmless to expose:
  // the manifest is branding metadata, sw.js is push-display code only.
  "/manifest.webmanifest",
  "/sw.js",
  // App-icon serving route — the OS/browser fetches manifest icons and the
  // apple-touch icon without credentials. Serves the owner-uploaded icon
  // or 302s to the static fallback; read-only, nothing sensitive.
  "/api/pwa",
  // Brand-logo serving route — the public landing page renders the agency
  // logo for anonymous visitors. Upload/delete stay behind auth (they're
  // at /api/agency/logo, not /api/agency/logo/image); this is read-only.
  "/api/agency/logo/image",
  "/u",
  "/api/u",
  // Public quote pages — recipient-facing /q/[token] view (server-rendered)
  // and the accept/decline endpoint. Both gated by HMAC-signed token
  // verification inside the route; no session needed.
  "/q",
  "/api/quotes",
  // Public booking pages — /b/[saId]/[slug] hosted slot picker, plus the
  // availability + book POST endpoints. Security:
  //  - Page reads only return slots when `status === "published"`
  //  - Per-IP rate limit on availability + book POSTs
  //  - Server-side transactional re-verify at book time so a stale
  //    visitor can't double-book a slot
  "/b",
  "/api/booking",
  // Human-readable custom-domain mirror of "/b" — /booking/[slug], only
  // ever resolves on a verified custom domain (opaque saId+slug still
  // required on the shared platform domain). Same trust model as /b: the
  // actual data reads/writes go through /api/booking either way.
  "/booking",
  // Public event-management page (/e/[token]) + cancel/reschedule
  // endpoints. All gated by HMAC-token + hash match against the stored
  // `event.publicTokenHash`. Reschedule rotates the token so any
  // previously-mailed link invalidates cleanly.
  "/e",
  // Public QR redirect (/qr/[qrId]) — an unguessable Firestore doc id is
  // the slug, same trust model as /f, /b, /e, /q. Logs a scan then 302s to
  // the saved destination; a missing/unset code renders a small fallback
  // page instead of a raw 404.
  "/qr",
  // Booking reminder + payment-auto-expire QStash callbacks. Security:
  // Upstash-Signature header verification inside the route.
  "/api/events/reminder",
  "/api/events/payment",
  "/api/dev-only/danger-wipe-everything",
  "/setup.html",
  // SEO conventions — Next.js serves these as virtual routes from
  // src/app/robots.ts and src/app/sitemap.ts respectively. Both must
  // reach crawlers unauthenticated.
  "/robots.txt",
  "/sitemap.xml",
  // Affiliate program — own session model (magic-link HMAC cookie), not
  // Firebase Auth. Auth checks happen inside each route/page.
  "/affiliate",
  "/api/affiliate",
  // Community + Courses (Skool-style) member surface — own session model
  // (magic-link HMAC cookie scoped to the sub-account), NOT Firebase Auth.
  // The agency gate + member-session checks happen inside each route/page;
  // a member session can never resolve into the staff `/sa/*` surface.
  "/c",
  "/api/community",
  // Staff -> Member Seamless Entry (2026-08-19) cross-domain handoff
  // completion step — reachable on a business's own verified custom
  // domain (e.g. quianalache.com), which never carries a staff `__session`
  // cookie at all. Deliberately its own top-level prefix (not nested under
  // /api/community) since Client Portal/Courses share the same
  // Member/ls_member_session identity system and can redirect here
  // unchanged later. See staff-member-bridge.ts + member-auth.ts's
  // signMemberHandoffToken.
  "/api/member-session",
  // Standalone Courses — a course/product sold on its own public sales page,
  // independent of Community. Same session model (magic-link HMAC cookie
  // scoped to the sub-account), NOT Firebase Auth. The agency gate + member-
  // session checks happen inside each route/page.
  "/course",
  "/api/course",
  // Course Offers — the bundling/pricing wrapper around Standalone Courses.
  // Same session model (magic-link HMAC cookie scoped to the sub-account),
  // NOT Firebase Auth. The agency gate + member-session checks happen
  // inside each route/page, mirroring /course + /api/course above.
  "/offer",
  "/api/offer",
  // Human-readable custom-domain mirror of "/course" + "/offer" combined —
  // /courses/[slug], only ever resolves on a verified custom domain. See
  // src/app/courses/[slug]/page.tsx.
  "/courses",
  // Human-readable custom-domain mirror of "/c" — /communities/[groupSlug]/...,
  // only ever resolves on a verified custom domain (opaque saId+slug still
  // required on the shared platform domain). Same session model as "/c"
  // above; the actual data reads/writes go through /api/community either
  // way. See src/lib/community/domain.ts + src/lib/community/routes.ts.
  "/communities",
  // Energetic Decoder's embeddable public tool — a visitor enters birth
  // details, gets their reading, and (via the create route) becomes a
  // Contact. No session of any kind; tenancy checked inside the route by
  // subAccountId in the URL.
  "/decoder",
  "/api/decoder",
  // Client Portal — one login per Contact surfacing their courses, saved
  // Energetic Decoder readings, upcoming bookings, and invoices. Same
  // magic-link HMAC session model as Community/Standalone Courses (shared
  // member identity), but NOT gated on Community being enabled — every
  // sub-account gets a Portal. Auth checks happen inside each route/page.
  "/portal",
  "/api/portal",
  // Member password setup/reset — public reachability only. The request
  // endpoint avoids account enumeration, reset is token-gated, and set still
  // requires the existing member HMAC session inside the route handlers.
  "/member-password",
  "/api/member-password",
  // MyMagnetix — the person-centered member/customer experience across the
  // whole ecosystem. Own session model (global `mm_session` HMAC cookie,
  // see person-auth.ts/person-session.ts), NOT Firebase Auth and NOT the
  // tenant-scoped `ls_member_session` either — a deliberate third session
  // type. Auth checks happen inside each route/page, same pattern as
  // /portal, /c, /course above. Without this entry, every /my/* request
  // would be treated as an unauthenticated STAFF request and redirected to
  // /login before ever reaching MyMagnetix's own login page.
  "/my",
  "/api/my",
  // Client Billing v1 — public checkout entry + post-checkout status page.
  // The HMAC-signed token in the URL is the credential (verified inside the
  // route against billing.checkoutTokenHash, quote-link model); a valid
  // link 303s into Stripe Checkout.
  "/pay",
  // Public REST API (v1+). Auth happens INSIDE each route via Bearer-token
  // verification (lib/api/auth.ts), not via session cookie. Sub-account-
  // scoped keys; tenancy enforced in code (Admin SDK writes bypass
  // Firestore rules). Adding the prefix here means the Firebase-edge
  // middleware doesn't try to redirect API-key callers to /login.
  "/api/v1",
  // Outbound-webhook delivery worker. QStash callback only — signature-
  // verified inside the route via `verifyQStashSignature`. Mirrors the
  // existing /api/broadcasts/email/step + /api/workflows/step paths.
  "/api/webhooks-out",
];

/**
 * Dynamic public paths — patterns that contain a path param. These are
 * QStash-callback / webhook endpoints whose security comes from signature
 * verification inside the route, not from session auth.
 */
const PUBLIC_PATH_PATTERNS: RegExp[] = [
  // Booking loop audit (2026-08-26) — public reschedule/cancel:
  // /api/events/{token}/reschedule and /api/events/{token}/cancel.
  // Real, live-confirmed bug found while wiring the booking notification
  // loop: the "/e" public path above covers the /e/[token] VIEW page, but
  // these two ACTION endpoints live under /api/events/[token]/*, a
  // different root the PUBLIC_PATHS array never listed — every visitor
  // clicking "reschedule" or "cancel" from a real confirmation email was
  // being 307-redirected to the staff /login page instead of reaching the
  // route's own HMAC-token verification. Same failure class already
  // documented on /api/cron/google-calendar-sync above. Both routes are
  // token-gated inside themselves (verifyEventToken + a hash match against
  // the stored event doc) — this pattern only stops the blanket
  // session-auth redirect from intercepting them first.
  /^\/api\/events\/[^/]+\/reschedule$/,
  /^\/api\/events\/[^/]+\/cancel$/,
  // Bulk outbound-call step — QStash callback, signature-verified inside
  // the route (same security model as /api/broadcasts/email/step).
  /^\/api\/comms\/voice\/campaign\/step$/,
  // 3-day post-purchase Gitpage bonus reminder — QStash callback,
  // signature-verified inside the route.
  /^\/api\/gitpage-reminder\/step$/,
  // gitpage build poll: /api/sub-accounts/{id}/website/{siteId}/poll
  /^\/api\/sub-accounts\/[^/]+\/website\/[^/]+\/poll$/,
  // Social Planner publish callback — QStash callback, signature-verified
  // inside the route (same security model as /api/workflows/step).
  /^\/api\/social\/publish\/step$/,
  // GHL migration drain — QStash callback, signature-verified in the route.
  /^\/api\/import\/ghl\/step$/,
  // WhatsApp template approval poll: /api/sub-accounts/{id}/whatsapp-templates/poll
  // QStash callback, signature-verified inside the route.
  /^\/api\/sub-accounts\/[^/]+\/whatsapp-templates\/poll$/,
  // Calendar subscription feed: /api/sub-accounts/{id}/calendar.ics
  // Token-gated inside the route via verifyCalendarFeedToken — Google /
  // Apple / Outlook pollers are unauthenticated, so session-cookie auth
  // would block them. The HMAC token in `?t=` is the credential.
  /^\/api\/sub-accounts\/[^/]+\/calendar\.ics$/,
  // Public competitor comparison pages (SEO landing pages, e.g.
  // /leadstack-vs-gohighlevel). Slug is path-suffixed with a hyphen
  // rather than a slash so the PUBLIC_PATHS prefix-match logic can't
  // see it — regex is the only option here. Read-only public content;
  // no auth required. Each competitor has its own static route under
  // src/app/leadstack-vs-{slug}/page.tsx; this regex catches them all.
  /^\/leadstack-vs-[a-z0-9-]+$/,
];

function isPublicPath(pathname: string): boolean {
  if (
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`)
    )
  ) {
    return true;
  }
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

/**
 * A handful of routes are one-shot ACTIONS, not real pages: visiting them
 * (with a valid session) immediately 30x-redirects somewhere else — most
 * notably the Meta (Facebook/Instagram) OAuth connect route, which
 * immediately bounces to facebook.com. If an authenticated user's session
 * ever gets flagged invalid for exactly THAT one request (a token-refresh
 * hiccup, a stale bfcache re-fetch on browser back-navigation, etc.), the
 * generic `redirect=<pathname>` behavior below would send them back to
 * /login only to be shot straight back out to Facebook again the instant
 * they sign in — confusing, and exactly the "why did I see the login page
 * in my browser history" symptom reported during Meta connect testing
 * (2026-08-18). These routes get a real, stable page as their post-login
 * destination instead of themselves.
 */
const ACTION_ROUTE_REDIRECT_OVERRIDES: Array<{
  pattern: RegExp;
  target: (pathname: string) => string;
}> = [
  {
    pattern: /^\/api\/sub-accounts\/([^/]+)\/meta\/connect$/,
    target: (pathname) => {
      const id = pathname.match(
        /^\/api\/sub-accounts\/([^/]+)\/meta\/connect$/
      )?.[1];
      return id ? `/sa/${id}/dashboard/settings` : "/dashboard";
    },
  },
  {
    // No sub-account id in the path here (it lives in the signed `state`
    // query param) — a re-consumed OAuth `code` is single-use and invalid
    // anyway, so there's nothing useful to return to; land somewhere real.
    pattern: /^\/api\/meta\/callback$/,
    target: () => "/dashboard",
  },
];

function loginRedirectTarget(pathname: string): string {
  const override = ACTION_ROUTE_REDIRECT_OVERRIDES.find((o) =>
    o.pattern.test(pathname)
  );
  return override ? override.target(pathname) : pathname;
}

export default function middleware(request: NextRequest) {
  // Skip auth middleware if Firebase is not configured
  if (
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !process.env.FIREBASE_ADMIN_PROJECT_ID
  ) {
    return NextResponse.next();
  }

  return authMiddleware(request, {
    loginPath: "/api/login",
    logoutPath: "/api/logout",
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    cookieName: "__session",
    cookieSignatureKeys: [
      process.env.COOKIE_SECRET_CURRENT ?? "",
      process.env.COOKIE_SECRET_PREVIOUS ?? "",
    ],
    cookieSerializeOptions: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 24, // 12 days
    },
    serviceAccount: {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? "",
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? "",
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(
        /\\n/g,
        "\n"
      ),
    },
    handleValidToken: async ({ decodedToken }, headers) => {
      // Allow authenticated users through
      // Attach user info to headers for downstream use
      headers.set("x-user-uid", decodedToken.uid);
      headers.set("x-user-email", decodedToken.email ?? "");

      return NextResponse.next({ request: { headers } });
    },
    handleInvalidToken: async () => {
      const pathname = request.nextUrl.pathname;

      // Allow public paths without authentication
      if (isPublicPath(pathname)) {
        return NextResponse.next();
      }

      // Redirect unauthenticated users to login for protected paths
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", loginRedirectTarget(pathname));
      return NextResponse.redirect(url);
    },
    handleError: async () => {
      const pathname = request.nextUrl.pathname;

      // On error, allow public paths and redirect protected paths
      if (isPublicPath(pathname)) {
        return NextResponse.next();
      }

      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", loginRedirectTarget(pathname));
      return NextResponse.redirect(url);
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/login",
    "/api/logout",
  ],
};
