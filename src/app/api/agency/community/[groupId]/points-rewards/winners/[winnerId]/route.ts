import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { updateAgencyWinnerFulfillmentServerSide } from "@/lib/server/agency-community-rewards-service";
import type { WinnerFulfillmentStatus } from "@/types/points-rewards";

export const dynamic = "force-dynamic";

/** Owner-only. Marks a winner's fulfillment pending/fulfilled, with
 *  optional notes. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; winnerId: string }> },
) {
  const { groupId, winnerId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  let body: { fulfillmentStatus?: WinnerFulfillmentStatus; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.fulfillmentStatus !== "pending" && body.fulfillmentStatus !== "fulfilled") {
    return NextResponse.json({ error: "Invalid fulfillmentStatus" }, { status: 400 });
  }

  await updateAgencyWinnerFulfillmentServerSide({
    agencyId: caller.agencyId,
    groupId,
    winnerId,
    fulfillmentStatus: body.fulfillmentStatus,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true });
}
