import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listChartDesigns, createChartDesign } from "@/lib/server/chart-design-service";
import type { ChartDesignSystem } from "@/types/chart-design";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const designs = await listChartDesigns(subAccountId, access.agencyId ?? "");
  return NextResponse.json({ ok: true, designs });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const system: ChartDesignSystem = body.system === "astrology" ? "astrology" : "humanDesign";
  const name = typeof body.name === "string" ? body.name : "Untitled design";

  const design = await createChartDesign({
    agencyId: access.agencyId ?? "",
    subAccountId,
    system,
    name,
  });
  return NextResponse.json({ ok: true, design });
}
