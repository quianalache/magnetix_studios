import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  createRewardServerSide,
  listRewardsServerSide,
  parseRewardInputBody,
} from "@/lib/server/community-rewards-service";

export const dynamic = "force-dynamic";

/** Community Settings → Points & Rewards → Rewards. GET is member-readable
 *  (Overview's Active Rewards panel + the Leaderboard's reward surfacing
 *  both need this); POST (create) is moderator-only. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const rewards = await listRewardsServerSide(saId, groupId);
  return NextResponse.json({ ok: true, rewards });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
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
    const reward = await createRewardServerSide({
      subAccountId: saId,
      groupId,
      createdBy: access.member.id,
      input,
    });
    return NextResponse.json({ ok: true, reward });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create reward";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
