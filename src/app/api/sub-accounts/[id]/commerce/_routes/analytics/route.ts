import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { buildFunnelAnalytics, buildPageAnalytics } from "@/lib/server/page-funnel-analytics-report";
import { isAnalyticsRangeKey } from "@/lib/analytics/page-funnel-metrics";

export const dynamic = "force-dynamic";

/**
 * Page & Funnel analytics for ONE workspace (members only; the workspace
 * comes from the authorized path, never from the query). Shared by the light
 * analytics in Pages & Funnels and Reports → Page & Funnel Analytics.
 *   ?type=funnels|pages   &range=7d|30d|90d
 * Business results only: LIVE money, real traffic — no TEST/LIVE switch.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const rangeParam = url.searchParams.get("range");
  const range = isAnalyticsRangeKey(rangeParam) ? rangeParam : "30d";
  try {
    if (type === "pages") return NextResponse.json(await buildPageAnalytics(id, range), { headers: { "Cache-Control": "no-store" } });
    if (type === "funnels") return NextResponse.json(await buildFunnelAnalytics(id, range), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Unknown analytics type." }, { status: 400 });
  } catch (err) {
    console.error("[analytics] report failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Analytics couldn't be loaded. Try again." }, { status: 500 });
  }
}
