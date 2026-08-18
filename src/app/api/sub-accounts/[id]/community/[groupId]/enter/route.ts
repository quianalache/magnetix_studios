import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveMemberForStaffBridge } from "@/lib/server/staff-member-bridge";
import { getGroupById, joinGroupServerSide } from "@/lib/server/community-service";
import { signMemberSessionToken, signMemberHandoffToken } from "@/lib/community/member-auth";
import { setMemberSessionCookie } from "@/lib/community/member-session";
import { communityHomeHref } from "@/lib/community/routes";
import { platformOrigin } from "@/lib/domains/public-url";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Staff -> Member Seamless Entry, Community edition (2026-08-19) — the
 * real "Enter Community" product entry point (src/app/(dashboard)/sa/
 * [subAccountId]/community/[groupId]/page.tsx). Runs on the CRM origin,
 * requires the caller's existing Firebase `__session` (this path is NOT
 * in middleware.ts's PUBLIC_PATHS, so an unauthenticated visit is
 * redirected to /login and lands back here automatically afterward — no
 * manual 401 handling needed here for the "not logged in at all" case).
 *
 * Sequence:
 *   1. Re-verify entitlement + resolve/provision the Member identity
 *      (resolveMemberForStaffBridge — shared, surface-agnostic; Portal/
 *      Courses can call the exact same function later).
 *   2. Ensure the GroupMembership for THIS group exists (joinGroupServerSide
 *      — existing, idempotent, already assigns "moderator" instead of
 *      "member" when the joining email is staff/admin for this sub-account
 *      — see community-service.ts's isStaffEmail. Not reinvented here.
 *   3. Same-origin destination (no verified custom domain — the opaque
 *      /c/... route lives on this same crm.magnetixstudios.com origin):
 *      set ls_member_session directly, redirect straight there.
 *   4. Cross-domain destination (a verified custom domain, e.g.
 *      quianalache.com): mint a short-lived signed handoff token and
 *      redirect to that domain's own /api/member-session/handoff, which
 *      sets the real cookie correctly scoped to ITS host. Works for any
 *      verified custom domain — nothing here is specific to one business.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId, groupId } = await params;

  const bridged = await resolveMemberForStaffBridge(request, subAccountId);
  if (!bridged.ok) {
    return NextResponse.json({ error: bridged.error }, { status: bridged.status });
  }
  const { member } = bridged.result;

  const group = await getGroupById(subAccountId, groupId);
  if (!group || group.status !== "published") {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const sub = subSnap.data() as SubAccountDoc;

  // Idempotent — a re-click never creates a duplicate membership, resets
  // points, or downgrades an existing moderator back to member (see
  // joinGroupServerSide: an existing non-removed membership short-circuits
  // to "already" with no write at all).
  try {
    await joinGroupServerSide({
      subAccountId,
      agencyId: sub.agencyId,
      groupId,
      memberId: member.id,
    });
  } catch (err) {
    console.error("[community/enter-as-staff] joinGroupServerSide failed", err);
    return NextResponse.json({ error: "Couldn't set up Community access" }, { status: 500 });
  }

  const customHost =
    sub.customDomain?.status === "verified" ? sub.customDomain.domain : null;
  const platformHost = (() => {
    try {
      return new URL(platformOrigin()).hostname;
    } catch {
      return null;
    }
  })();
  const crossDomain = !!customHost && customHost !== platformHost;

  if (!crossDomain) {
    const sessionToken = signMemberSessionToken(subAccountId, member.id, member.email);
    await setMemberSessionCookie(sessionToken);
    const destination = communityHomeHref({ saId: subAccountId, pretty: false }, group.slug);
    return NextResponse.redirect(new URL(destination, request.url));
  }

  const next = communityHomeHref({ saId: subAccountId, pretty: true }, group.slug);
  const handoffToken = signMemberHandoffToken(subAccountId, member.id, member.email, next);
  const handoffUrl = new URL(`https://${customHost}/api/member-session/handoff`);
  handoffUrl.searchParams.set("token", handoffToken);
  return NextResponse.redirect(handoffUrl);
}
