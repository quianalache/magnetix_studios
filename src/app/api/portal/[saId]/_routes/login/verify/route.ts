import { NextResponse } from "next/server";
import {
  asSeeOther,
  magicLinkContinuePage,
  redeemMagicLinkOnce,
} from "@/lib/auth/magic-link-once";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  signMemberSessionToken,
  verifyMemberMagicLinkToken,
} from "@/lib/community/member-auth";
import { ensureMember } from "@/lib/community/member-account";
import { setMemberSessionCookie } from "@/lib/community/member-session";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";

export const dynamic = "force-dynamic";

/**
 * Verify a Portal magic-link token and exchange it for a 30-day session
 * cookie, creating (or reusing) the member identity + reconciling a contact
 * on the way. Mirrors `/api/community/[saId]/login/verify` but with no
 * community-gate check and no group auto-join.
 *
 * Redirects to the pretty `/portal` (+ `/login` on error) when this request
 * arrived on the sub-account's own verified custom domain, else falls back
 * to the opaque `/portal/{saId}` — same domain-or-platform choice as
 * `buildPortalLoginUrl`, just decided by the INCOMING host here rather than
 * a stored subAccount doc, since that's what determines what `request.url`'s
 * origin actually is.
 */
async function redeemLink(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const url = new URL(request.url);

  const host = request.headers.get("host");
  const customDomainSub = await getSubAccountByCustomDomain(host);
  const onCustomDomain = customDomainSub?.id === saId;
  const homePath = onCustomDomain ? "/portal" : `/portal/${saId}`;
  const loginPath = onCustomDomain ? "/portal/login" : `/portal/${saId}/login`;

  const loginUrl = (error: string) =>
    NextResponse.redirect(new URL(`${loginPath}?error=${error}`, url));

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) return loginUrl("missing_token");

  const verified = verifyMemberMagicLinkToken(token);
  if (!verified || verified.subAccountId !== saId) return loginUrl("expired");
  // Each emailed link signs someone in once — see magic-link-once.ts.
  if (!(await redeemMagicLinkOnce(token, verified.expiresAt))) return loginUrl("used");

  try {
    const member = await ensureMember({
      subAccountId: saId,
      email: verified.email,
      source: "portal",
      emailProof: "proven",
    });
    if (member.status !== "active") return loginUrl("inactive");

    const sessionToken = signMemberSessionToken(saId, member.id, verified.email);
    await setMemberSessionCookie(sessionToken);
  } catch (err) {
    console.error("[portal/login/verify] ensureMember failed", err);
    return loginUrl("error");
  }

  return NextResponse.redirect(new URL(homePath, url));
}

/** Opening the emailed link never signs in; the page it returns POSTs back
 *  here, and only that POST redeems the link (see magic-link-once.ts). */
export async function GET() {
  return magicLinkContinuePage();
}

export async function POST(request: Request, ctx: { params: Promise<{ saId: string }> }) {
  return asSeeOther(await redeemLink(request, ctx));
}
