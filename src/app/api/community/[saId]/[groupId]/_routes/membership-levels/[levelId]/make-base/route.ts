import { NextResponse } from "next/server";
import { requireCommunityModerator } from "@/lib/community/require-moderator";
import { makeBaseMembershipLevel, MembershipLevelError } from "@/lib/server/community-membership-service";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ saId: string; groupId: string; levelId: string }> }) {
  const { saId, groupId, levelId } = await params;
  const access = await requireCommunityModerator(saId, groupId);
  if (access instanceof NextResponse) return access;
  try {
    await makeBaseMembershipLevel(saId, groupId, levelId, `member:${access.member.id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MembershipLevelError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
