import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveMemberForStaffBridge } from "@/lib/server/staff-member-bridge";
import { getGroupById, joinGroupServerSide } from "@/lib/server/community-service";
import { signMemberSessionToken } from "@/lib/community/member-auth";
import { setMemberSessionCookie } from "@/lib/community/member-session";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM session bridge (2026-08-24) — a same-origin-ONLY
 * sibling of the existing `/enter` route (staff-member-bridge.ts's Staff ->
 * Member Seamless Entry). Deliberately never does that route's cross-domain
 * custom-domain handoff: this exists specifically so staff viewing
 * Community from inside the CRM (`/sa/[subAccountId]/community/...`) stay
 * on crm.magnetixstudios.com and get an `ls_member_session` cookie scoped
 * to THIS origin — letting every existing Community page and API route
 * (all of which already read that cookie via `getCurrentMember`) work
 * completely unchanged for a staff visitor. No parallel auth path, no
 * route-by-route changes, and the recently-shipped unified Community
 * login fix is untouched (this never checks a password — it's reached
 * only from `requireStaffGroupPageAccess`, itself only reachable after
 * the CRM's own Firebase session has already been verified).
 *
 * Redirects straight back to `next` (a `/sa/...` staff Community path)
 * once the cookie is set. A normal 30-day cookie lifetime means this only
 * actually fires once every so often per staff browser, not on every
 * page load.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId, groupId } = await params;

  const rawNext = new URL(request.url).searchParams.get("next");
  // Open-redirect guard: only ever bounce back into this SAME staff
  // Community route tree, never an arbitrary caller-supplied URL.
  const next =
    rawNext && rawNext.startsWith(`/sa/${subAccountId}/community/${groupId}`)
      ? rawNext
      : `/sa/${subAccountId}/community/${groupId}`;

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
    console.error("[community/ensure-session] joinGroupServerSide failed", err);
    return NextResponse.json({ error: "Couldn't set up Community access" }, { status: 500 });
  }

  const sessionToken = signMemberSessionToken(subAccountId, member.id, member.email);
  await setMemberSessionCookie(sessionToken);
  return NextResponse.redirect(new URL(next, request.url));
}
