import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireCommunityModerator } from "@/lib/community/require-moderator";
import {
  endMembershipLevelGrant,
  grantMembershipLevel,
  listLevelMembers,
  MembershipLevelError,
} from "@/lib/server/community-membership-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ saId: string; groupId: string; levelId: string }> };

/** Manage members: who's on the level (+ source) and everyone who could be added. */
export async function GET(_request: Request, { params }: Params) {
  const { saId, groupId, levelId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  try {
    const members = await listLevelMembers(saId, groupId, levelId);
    const roster = await getAdminDb().collection(`subAccounts/${saId}/communityGroups/${groupId}/memberships`).where("status", "==", "active").get();
    const onLevel = new Set(members.map((m) => m.memberId));
    const candidates = [];
    for (const d of roster.docs) {
      if (onLevel.has(d.id)) continue;
      const m = (await getAdminDb().doc(`subAccounts/${saId}/members/${d.id}`).get()).data();
      candidates.push({ memberId: d.id, name: (m?.displayName as string) ?? "", email: (m?.email as string) ?? "" });
    }
    candidates.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, members, candidates });
  } catch (err) {
    if (err instanceof MembershipLevelError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Manual (complimentary) assignment — never recorded as a purchase. */
export async function POST(request: Request, { params }: Params) {
  const { saId, groupId, levelId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => null)) as { memberId?: string } | null;
  if (!body?.memberId) return NextResponse.json({ error: "Choose a member" }, { status: 400 });
  try {
    const r = await grantMembershipLevel({ subAccountId: saId, groupId, memberId: body.memberId, levelId, source: "manual", grantedByUid: `member:${access.member.id}` });
    return NextResponse.json({ ok: true, created: r.created });
  } catch (err) {
    if (err instanceof MembershipLevelError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Remove a MANUAL grant. Offer-backed grants end with the purchase/subscription. */
export async function DELETE(request: Request, { params }: Params) {
  const { saId, groupId, levelId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? "";
  const grantId = url.searchParams.get("grantId") ?? "";
  if (!memberId || !grantId) return NextResponse.json({ error: "Missing grant" }, { status: 400 });
  const snap = await getAdminDb().doc(`subAccounts/${saId}/communityGroups/${groupId}/memberships/${memberId}/levelGrants/${grantId}`).get();
  if (!snap.exists || snap.data()!.levelId !== levelId) return NextResponse.json({ error: "Grant not found" }, { status: 404 });
  if (snap.data()!.source !== "manual") return NextResponse.json({ error: "This member bought this level — it ends when their purchase or subscription ends." }, { status: 409 });
  await endMembershipLevelGrant({ subAccountId: saId, groupId, memberId, grantId, reason: `removed_by:member:${access.member.id}` });
  return NextResponse.json({ ok: true });
}
