import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  createAgencyRewardServerSide,
  listAgencyRewardsServerSide,
  parseRewardInputBody,
} from "@/lib/server/agency-community-rewards-service";

export const dynamic = "force-dynamic";

/** Agency Community Settings → Points & Rewards → Rewards. Owner-only. */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  const rewards = await listAgencyRewardsServerSide(caller.agencyId, groupId);
  return NextResponse.json({ ok: true, rewards });
}

export async function POST(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  let input: ReturnType<typeof parseRewardInputBody>;
  try {
    input = parseRewardInputBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const reward = await createAgencyRewardServerSide({
      agencyId: caller.agencyId,
      groupId,
      createdBy: caller.uid,
      input,
    });
    return NextResponse.json({ ok: true, reward });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create reward";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
