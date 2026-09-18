import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  createAgencyWinnerServerSide,
  listAgencyWinnersServerSide,
} from "@/lib/server/agency-community-rewards-service";

export const dynamic = "force-dynamic";

/** Owner-only — award a winner is always an explicit, confirmed owner
 *  action, never automatic. */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  const winners = await listAgencyWinnersServerSide(caller.agencyId, groupId);
  return NextResponse.json({ ok: true, winners });
}

export async function POST(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  let body: { rewardId?: string; memberId?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.rewardId || !body.memberId) {
    return NextResponse.json({ error: "rewardId and memberId are required" }, { status: 400 });
  }

  const winner = await createAgencyWinnerServerSide({
    agencyId: caller.agencyId,
    groupId,
    rewardId: body.rewardId,
    memberId: body.memberId,
    awardedBy: caller.uid,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true, winner });
}
