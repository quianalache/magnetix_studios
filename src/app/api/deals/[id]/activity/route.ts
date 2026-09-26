import "server-only";

import { NextResponse } from "next/server";
import { requireDealRoute } from "@/lib/server/deal-route-guard";
import { listDealActivity } from "@/lib/server/deal-feed-service";

export const dynamic = "force-dynamic";

/** GET — the deal's activity feed (see `listDealActivity`). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const guard = await requireDealRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await listDealActivity(guard.deal));
}
