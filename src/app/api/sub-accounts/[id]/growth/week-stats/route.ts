import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { computeWeekStats, weekStartOf } from "@/lib/server/growth-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("weekStart");
  const d = raw ? new Date(raw) : new Date();
  const weekStart = weekStartOf(Number.isNaN(d.getTime()) ? new Date() : d);
  const stats = await computeWeekStats(subAccountId, weekStart);
  return NextResponse.json({ ok: true, stats, weekStart: weekStart.toISOString() });
}
