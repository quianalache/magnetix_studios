import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { MEMBER_SESSION_COOKIE, verifyMemberSessionToken } from "@/lib/community/member-auth";
import { ensurePersonLinkForMember } from "@/lib/server/person-identity-service";
import { signPersonSessionToken, signPersonHandoffToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";
import { platformOrigin } from "@/lib/domains/public-url";
import type { Member } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * The tenant-Portal -> MyMagnetix identity bridge (2026-08-16, extended
 * 2026-08-17 for the Client Portal's own "Back to MyMagnetix" control).
 * Fixes a real gap caught in owner QA: someone already authenticated
 * inside a business-specific Client Portal (holding a valid
 * `ls_member_session`) got asked to log into MyMagnetix again, even
 * though their Member relationship is already linked to a global Person.
 *
 * This is the mirror image of /api/my/bridge-from-staff — same contract,
 * opposite direction:
 *   - staff bridge: an already-Firebase-authenticated identity may mint
 *     an mm_session for its own linked personId.
 *   - this bridge: an already-Member-session-authenticated identity may
 *     mint an mm_session for its own linked personId.
 * Neither bridge ever grants NEW access — both re-derive and re-verify
 * everything server-side from an already-legitimate session, never from
 * a client-supplied id.
 *
 * SECURITY: the `sa`/`mid` used to load the Member doc come ONLY from
 * the verified, signed `ls_member_session` token — never from a query
 * param or request body. A tampered or expired token fails closed (falls
 * through to /my/login) rather than guessing. The original
 * `ls_member_session` cookie is never read destructively and is never
 * cleared here — both sessions coexist afterward.
 *
 * CUSTOM-DOMAIN SAFE: this route is now reachable from a business's own
 * custom domain (e.g. quianalache.com/portal's "Back to MyMagnetix"
 * link). Cookies cannot be set cross-origin — a `Set-Cookie` issued while
 * handling a request on quianalache.com is scoped to quianalache.com,
 * full stop, no matter what the redirect's Location header says. So when
 * this request did NOT arrive on the platform origin, this route does
 * NOT set mm_session itself; it verifies everything here (fail-closed
 * checks happen on the ORIGINAL domain, where the real ls_member_session
 * lives) and hands the already-verified identity to
 * /api/my/handoff — a second, tiny hop that runs ON the platform origin
 * and does nothing but set the real cookie there. See
 * signPersonHandoffToken's own doc comment for why this is safe (short
 * TTL, distinct token kind, never itself a valid session).
 *
 * Called from Server Components (which cannot set cookies themselves)
 * via a redirect — see (app)/layout.tsx and /my/login/page.tsx — and now
 * also directly as a plain link from the Client Portal shell, on any host.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/my";
  const origin = platformOrigin() || url.origin;
  const onPlatformOrigin = url.origin === origin;
  // `bridge_unavailable` on every failure path (never a bare /my/login) —
  // load-bearing for loop-safety: /my/login only auto-retries this bridge
  // when NO error param is present (see that page), so a stale/expired/
  // invalid ls_member_session cookie fails ONCE and lands on a normal
  // login screen instead of redirect-looping forever.
  const loginUrl = new URL("/my/login?error=bridge_unavailable", origin);

  const cookieStore = await cookies();
  const memberToken = cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
  if (!memberToken) return NextResponse.redirect(loginUrl);

  const verified = verifyMemberSessionToken(memberToken);
  if (!verified) return NextResponse.redirect(loginUrl);

  const memberRef = getAdminDb().doc(`subAccounts/${verified.subAccountId}/members/${verified.memberId}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) return NextResponse.redirect(loginUrl);

  const member = { id: memberSnap.id, ...(memberSnap.data() as Omit<Member, "id">) };
  if (member.status !== "active") return NextResponse.redirect(loginUrl);

  try {
    const personId = await ensurePersonLinkForMember(verified.subAccountId, member);
    if (!personId) return NextResponse.redirect(loginUrl);

    if (onPlatformOrigin) {
      const sessionToken = signPersonSessionToken(personId, member.email);
      await setPersonSessionCookie(sessionToken);
      return NextResponse.redirect(new URL(next, origin));
    }

    // Cross-domain: hand off to the platform origin instead of setting a
    // cookie here, where it would be scoped to the wrong host.
    const handoffToken = signPersonHandoffToken(personId, member.email);
    const handoffUrl = new URL("/api/my/handoff", origin);
    handoffUrl.searchParams.set("token", handoffToken);
    handoffUrl.searchParams.set("next", next);
    return NextResponse.redirect(handoffUrl);
  } catch (err) {
    console.error("[my/bridge-from-member] failed", err);
    return NextResponse.redirect(loginUrl);
  }
}
