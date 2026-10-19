import { NextResponse } from "next/server";
import { isPublicPath } from "@/lib/routing/public-paths";
import type { NextRequest } from "next/server";
import { authMiddleware } from "next-firebase-auth-edge/lib/next/middleware";


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

/**
 * Identity headers are set by this middleware ONLY from a verified session
 * (`handleValidToken` below), and route handlers trust them
 * (`require-tenancy.ts`, `current-staff.ts`). A request that is let through
 * WITHOUT a verified session (public paths, or Firebase not configured)
 * must never carry client-supplied copies — otherwise anyone could send
 * `x-user-uid: <some staff uid>` and be treated as that staff user.
 */
const IDENTITY_HEADERS = ["x-user-uid", "x-user-email"] as const;

function nextWithoutIdentityHeaders(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  for (const name of IDENTITY_HEADERS) headers.delete(name);
  return NextResponse.next({ request: { headers } });
}

export default function middleware(request: NextRequest) {
  // Skip auth middleware if Firebase is not configured
  if (
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !process.env.FIREBASE_ADMIN_PROJECT_ID
  ) {
    return nextWithoutIdentityHeaders(request);
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
        return nextWithoutIdentityHeaders(request);
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
        return nextWithoutIdentityHeaders(request);
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
