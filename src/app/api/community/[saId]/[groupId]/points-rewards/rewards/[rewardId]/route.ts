import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { updateRewardServerSide, parseRewardInputBody } from "@/lib/server/community-rewards-service";

export const dynamic = "force-dynamic";

/** Moderator-only full update of one reward (title/description/status/
 *  dates/criterion/fulfillment). Archiving is a separate, narrower action
 *  — see `./archive/route.ts`. */
export async function PATCH(
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

  let input: ReturnType<typeof parseRewardInputBody>;
  try {
    input = parseRewardInputBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const reward = await updateRewardServerSide({ subAccountId: saId, groupId, rewardId, input });
    if (!reward) return NextResponse.json({ error: "Reward not found" }, { status: 404 });
    return NextResponse.json({ ok: true, reward });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't save reward";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
