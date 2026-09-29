import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { archiveRewardServerSide } from "@/lib/server/community-rewards-service";

export const dynamic = "force-dynamic";

/** Moderator-only. Archives a reward — never deletes it (Winners history
 *  and the Rewards tab's past/completed view both keep referencing it). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; rewardId: string }> },
) {
  const { saId, groupId, rewardId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }
  await archiveRewardServerSide({ subAccountId: saId, groupId, rewardId });
  return NextResponse.json({ ok: true });
}
