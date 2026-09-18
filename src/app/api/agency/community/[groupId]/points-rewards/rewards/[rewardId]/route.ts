import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { updateAgencyRewardServerSide, parseRewardInputBody } from "@/lib/server/agency-community-rewards-service";

export const dynamic = "force-dynamic";

/** Owner-only full update of one reward. Archiving is a separate, narrower
 *  action — see `./archive/route.ts`. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; rewardId: string }> },
) {
  const { groupId, rewardId } = await ctx.params;
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
    const reward = await updateAgencyRewardServerSide({ agencyId: caller.agencyId, groupId, rewardId, input });
    if (!reward) return NextResponse.json({ error: "Reward not found" }, { status: 404 });
    return NextResponse.json({ ok: true, reward });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't save reward";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
