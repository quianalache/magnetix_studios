import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyMemberHandoffToken, signMemberSessionToken } from "@/lib/community/member-auth";
import { setMemberSessionCookie } from "@/lib/community/member-session";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import type { Member } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff -> Member Seamless Entry — cross-domain completion step
 * (2026-08-19). Deliberately surface-agnostic (NOT nested under
 * /api/community): this is the one place a signed Member handoff token
 * ever gets exchanged for a real `ls_member_session` cookie, correctly
 * scoped to whatever host actually served this request. Community is the
 * first caller (see .../community/[groupId]/enter/route.ts), but Client
 * Portal and Courses share the exact same Member/ls_member_session
 * identity system and can redirect here unchanged later — this route
 * knows nothing Community-specific.
 *
 * Modeled directly on /api/my/handoff (the proven MyMagnetix cross-domain
 * pattern), with one deliberate strengthening: that route trusts an
 * unsigned (but path-restricted) `next` query param; this route's `next`
 * is signed INTO the token itself (see signMemberHandoffToken), so it
 * can't be altered after issuance at all, not merely restricted.
 *
 * SECURITY — every protection below is required, not defense-in-depth
 * decoration:
 *   - Token kind "ho" is structurally distinct from "ses"; a handoff
 *     token can never be replayed as a session credential itself
 *     (verifyMemberSessionToken rejects it outright).
 *   - Short TTL (2 minutes) bounds the replay window — TTL-only, no
 *     database-tracked single-use, the same deliberate tradeoff already
 *     accepted for the MyMagnetix handoff token (see person-auth.ts).
 *   - HOST CROSS-CHECK: the token's `sa` must match the sub-account THIS
 *     HOST actually resolves to via the existing custom-domain lookup —
 *     this is what stops a token minted for one business's Community
 *     from being replayed against a different verified custom domain.
 *     Without this check, the token's signature alone would only prove
 *     "some staff member vouched for this a moment ago," not "for THIS
 *     domain" — a wrong-domain replay would otherwise still succeed.
 *   - The Member is re-verified to exist and be active before minting a
 *     session — the token's `mid` is a strong hint, not blind trust.
 *   - `next` is re-validated as a same-origin relative path even though
 *     it's already signed, matching the codebase's existing open-redirect
 *     discipline elsewhere (never trust a redirect target on shape alone).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const failUrl = new URL("/communities/login?error=handoff_unavailable", url);

  if (!token) {
    return NextResponse.redirect(failUrl);
  }

  const verified = verifyMemberHandoffToken(token);
  if (!verified) {
    return NextResponse.redirect(failUrl);
  }

  // Host cross-check — the token must belong to the sub-account THIS host
  // (whatever verified custom domain served this request) actually
  // resolves to. A token minted for sub-account A can never be replayed
  // against sub-account B's domain, even if both are valid, live, verified
  // custom domains at the moment of replay.
  const hostHeader = request.headers.get("host");
  const hostSubAccount = await getSubAccountByCustomDomain(hostHeader);
  if (!hostSubAccount || hostSubAccount.id !== verified.subAccountId) {
    return NextResponse.redirect(failUrl);
  }

  // Re-verify the Member still exists and is active — the 2-minute TTL
  // makes this vanishingly unlikely to differ from what the bridge route
  // just confirmed, but a session must never be minted for a member that
  // was removed in between.
  const memberSnap = await getAdminDb()
    .doc(`subAccounts/${verified.subAccountId}/members/${verified.memberId}`)
    .get();
  if (!memberSnap.exists) {
    return NextResponse.redirect(failUrl);
  }
  const member = memberSnap.data() as Omit<Member, "id">;
  if (member.status !== "active") {
    return NextResponse.redirect(failUrl);
  }

  const sessionToken = signMemberSessionToken(verified.subAccountId, verified.memberId, verified.email);
  await setMemberSessionCookie(sessionToken);

  // Belt-and-suspenders open-redirect guard on top of the token's own
  // signature — `next` must still look like a real relative path.
  const next =
    verified.next.startsWith("/") && !verified.next.startsWith("//")
      ? verified.next
      : "/communities";
  return NextResponse.redirect(new URL(next, url));
}
