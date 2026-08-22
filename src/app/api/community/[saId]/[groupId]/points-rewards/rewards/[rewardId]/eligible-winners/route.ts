import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { evaluateEligibleWinners, listRewardsServerSide } from "@/lib/server/community-rewards-service";

export const dynamic = "force-dynamic";

/**
 * Moderator-only. The Award Winner modal's candidate list for a
 * calculable criterion (top_points_period / point_threshold / reach_level)
 * — surfaced for the moderator to CONFIRM, never auto-granted. Empty for
 * a "manual" criterion (the modal falls back to a member search there).
 */
export async function GET(
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
  const rewards = await listRewardsServerSide(saId, groupId);
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) return NextResponse.json({ error: "Reward not found" }, { status: 404 });
  const candidates = await evaluateEligibleWinners(saId, groupId, reward.criterion);
  return NextResponse.json({ ok: true, candidates });
}
