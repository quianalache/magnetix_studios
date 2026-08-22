import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createWinnerServerSide, listWinnersServerSide } from "@/lib/server/community-rewards-service";

export const dynamic = "force-dynamic";

/** GET is member-readable (a persistent, member-visible-eventually history
 *  — today used by the Settings Winners tab; POST (award a winner) is
 *  moderator-only — always an explicit, confirmed moderator action,
 *  never automatic, per Part 17's "do not silently grant real-world
 *  prizes without owner awareness". */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const winners = await listWinnersServerSide(saId, groupId);
  return NextResponse.json({ ok: true, winners });
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

  let body: { rewardId?: string; memberId?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.rewardId || !body.memberId) {
    return NextResponse.json({ error: "rewardId and memberId are required" }, { status: 400 });
  }

  const winner = await createWinnerServerSide({
    subAccountId: saId,
    groupId,
    rewardId: body.rewardId,
    memberId: body.memberId,
    awardedBy: access.member.id,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true, winner });
}
