import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { ChartDesignSetError, duplicateChartDesignSet } from "@/lib/server/chart-design-set-service";

/** Duplicate a unified Chart Design — a full independent copy of every system's records. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; setId: string }> }) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const set = await duplicateChartDesignSet({ subAccountId, agencyId: access.agencyId ?? "", setId, name: body.name });
    return NextResponse.json({ ok: true, set });
  } catch (err) {
    if (err instanceof ChartDesignSetError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
