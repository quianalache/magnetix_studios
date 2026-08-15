import { NextResponse } from "next/server";
import { verifyPersonHandoffToken, signPersonSessionToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";

export const dynamic = "force-dynamic";

/**
 * The platform-origin completion step of the cross-domain
 * Portal->MyMagnetix bridge (2026-08-17). This route does exactly one
 * thing: verify a short-lived handoff token minted by
 * /api/my/bridge-from-member (only ever reachable by following THAT
 * route's own redirect — never linked directly, never emailed) and set
 * the real `mm_session` cookie, now correctly scoped to the platform
 * origin this route always runs on.
 *
 * SECURITY: the handoff token is a distinct token kind ("ho") that
 * verifyPersonSessionToken explicitly rejects — it can never be replayed
 * as a session credential itself, only exchanged here, once, within its
 * 2-minute TTL. The personId it carries was already fully re-verified
 * against a real Member doc by the bridge route before this token was
 * ever minted; this route trusts the token's signature, not the caller.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/my";

  if (!token) {
    return NextResponse.redirect(new URL("/my/login?error=bridge_unavailable", url));
  }

  const verified = verifyPersonHandoffToken(token);
  if (!verified) {
    return NextResponse.redirect(new URL("/my/login?error=bridge_unavailable", url));
  }

  const sessionToken = signPersonSessionToken(verified.personId, verified.email);
  await setPersonSessionCookie(sessionToken);

  return NextResponse.redirect(new URL(next, url));
}
