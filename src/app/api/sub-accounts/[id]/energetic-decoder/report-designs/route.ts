import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listReportDesigns, createReportDesign } from "@/lib/server/report-design-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const designs = await listReportDesigns(subAccountId);
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
  const title = typeof body.title === "string" ? body.title : "Untitled Report";

  const design = await createReportDesign({
    agencyId: access.agencyId ?? "",
    subAccountId,
    title,
  });
  return NextResponse.json({ ok: true, design });
}
