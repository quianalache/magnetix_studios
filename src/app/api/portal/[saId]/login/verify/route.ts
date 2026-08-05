import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  signMemberSessionToken,
  verifyMemberMagicLinkToken,
} from "@/lib/community/member-auth";
import { ensureMember } from "@/lib/community/member-account";
import { setMemberSessionCookie } from "@/lib/community/member-session";

export const dynamic = "force-dynamic";

/**
 * Verify a Portal magic-link token and exchange it for a 30-day session
 * cookie, creating (or reusing) the member identity + reconciling a contact
 * on the way. Mirrors `/api/community/[saId]/login/verify` but with no
 * community-gate check and no group auto-join — the Portal always redirects
 * straight to `/portal/{saId}`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const url = new URL(request.url);
  const loginUrl = (error: string) =>
    NextResponse.redirect(new URL(`/portal/${saId}/login?error=${error}`, url));

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) return loginUrl("missing_token");

  const verified = verifyMemberMagicLinkToken(token);
  if (!verified || verified.subAccountId !== saId) return loginUrl("expired");

  try {
    const member = await ensureMember({
      subAccountId: saId,
      email: verified.email,
      source: "portal",
    });
    if (member.status !== "active") return loginUrl("inactive");

    const sessionToken = signMemberSessionToken(saId, member.id, verified.email);
    await setMemberSessionCookie(sessionToken);
  } catch (err) {
    console.error("[portal/login/verify] ensureMember failed", err);
    return loginUrl("error");
  }

  return NextResponse.redirect(new URL(`/portal/${saId}`, url));
}
