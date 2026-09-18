import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { getAgencyPointsConfig, updateAgencyPointRulesServerSide } from "@/lib/server/agency-community-points-service";
import type { PointRuleMap } from "@/types/points-rewards";

export const dynamic = "force-dynamic";

/** Agency Community Settings → Points & Rewards → Points System. Owner-only,
 *  mirrors the tenant moderator-only route. */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  const config = await getAgencyPointsConfig(caller.agencyId, groupId);
  return NextResponse.json({ ok: true, config });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  let body: { rules?: PointRuleMap };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.rules) return NextResponse.json({ error: "Missing rules" }, { status: 400 });

  try {
    const config = await updateAgencyPointRulesServerSide({
      agencyId: caller.agencyId,
      groupId,
      rules: body.rules,
      updatedBy: caller.uid,
    });
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't save points rules";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
