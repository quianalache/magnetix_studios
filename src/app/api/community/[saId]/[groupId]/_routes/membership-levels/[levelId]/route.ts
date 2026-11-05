import { NextResponse } from "next/server";
import { requireCommunityModerator } from "@/lib/community/require-moderator";
import {
  deleteMembershipLevel,
  MembershipLevelError,
  updateMembershipLevel,
} from "@/lib/server/community-membership-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ saId: string; groupId: string; levelId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { saId, groupId, levelId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    const level = await updateMembershipLevel(saId, groupId, levelId, body, `member:${access.member.id}`);
    return NextResponse.json({ ok: true, level });
  } catch (err) {
    if (err instanceof MembershipLevelError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { saId, groupId, levelId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  try {
    await deleteMembershipLevel(saId, groupId, levelId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MembershipLevelError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
