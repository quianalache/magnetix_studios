import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  ChartDesignSetError,
  createChartDesignSet,
  listChartDesignSets,
} from "@/lib/server/chart-design-set-service";

/** Unified Chart Designs (2026-10) — list (any member) and create (admins). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const result = await listChartDesignSets(subAccountId, access.agencyId ?? "");
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const set = await createChartDesignSet({
      subAccountId,
      agencyId: access.agencyId ?? "",
      name: body.name,
    });
    return NextResponse.json({ ok: true, set });
  } catch (err) {
    if (err instanceof ChartDesignSetError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
