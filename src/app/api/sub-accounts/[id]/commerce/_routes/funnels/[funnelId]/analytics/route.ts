import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getFunnelAnalyticsDaily } from "@/lib/server/funnel-analytics-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string; funnelId: string }> }) {
  const { id, funnelId } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? to;
  try {
    return NextResponse.json({ from, to, days: await getFunnelAnalyticsDaily({ subAccountId: id, funnelId, from, to }) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unable to load analytics" }, { status: 400 });
  }
}
