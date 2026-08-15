import { NextResponse } from "next/server";
import { verifyPersonMagicLinkToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";
import { establishPersonSessionForEmail } from "@/lib/server/person-password";

export const dynamic = "force-dynamic";

/**
 * Verify a MyMagnetix magic-link token and exchange it for a 30-day global
 * session cookie, creating (or reusing) the person identity on the way.
 * Mirrors `/api/portal/[saId]/login/verify`, minus any sub-account/contact
 * reconciliation — a Person has no tenant relationships of its own to
 * create; those stay owned by the existing Member reconciliation paths.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const loginUrl = (error: string) =>
    NextResponse.redirect(new URL(`/my/login?error=${error}`, url));

  const token = url.searchParams.get("token");
  if (!token) return loginUrl("missing_token");

  const verified = verifyPersonMagicLinkToken(token);
  if (!verified) return loginUrl("expired");

  try {
    const { sessionToken } = await establishPersonSessionForEmail(verified.email);
    await setPersonSessionCookie(sessionToken);
  } catch (err) {
    console.error("[my/login/verify] failed", err);
    return loginUrl("error");
  }

  return NextResponse.redirect(new URL("/my/gateway", url));
}
