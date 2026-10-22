import { NextResponse } from "next/server";
import {
  asSeeOther,
  magicLinkContinuePage,
  redeemMagicLinkOnce,
} from "@/lib/auth/magic-link-once";
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
async function redeemLink(request: Request) {
  const url = new URL(request.url);
  // First-time-access loop fix: `/api/my/login` embedded this — already
  // validated as a relative path there, but re-validated here too since
  // this URL is the one that actually goes out in an email and could in
  // principle be hand-edited before being clicked.
  const nextParam = url.searchParams.get("next");
  const safeNext = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const next = safeNext ?? "/gateway";
  // An expired/used link keeps its destination (e.g. their Reading), so a
  // fresh link from the login page still lands there (2026-10-21).
  const loginUrl = (error: string) =>
    NextResponse.redirect(new URL(`/my/login?error=${error}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`, url));

  const token = url.searchParams.get("token");
  if (!token) return loginUrl("missing_token");

  const verified = verifyPersonMagicLinkToken(token);
  if (!verified) return loginUrl("expired");
  // Each emailed link signs someone in once — see magic-link-once.ts.
  if (!(await redeemMagicLinkOnce(token, verified.expiresAt))) return loginUrl("used");

  try {
    const { sessionToken } = await establishPersonSessionForEmail(verified.email);
    await setPersonSessionCookie(sessionToken);
  } catch (err) {
    console.error("[my/login/verify] failed", err);
    return loginUrl("error");
  }

  return NextResponse.redirect(new URL(next, url));
}

/** Opening the emailed link never signs in; the page it returns POSTs back
 *  here, and only that POST redeems the link (see magic-link-once.ts). */
export async function GET() {
  return magicLinkContinuePage();
}

export async function POST(request: Request) {
  return asSeeOther(await redeemLink(request));
}
