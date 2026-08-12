import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { duplicateReportDesign } from "@/lib/server/report-design-service";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
) {
  const { id: subAccountId, designId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const duplicate = await duplicateReportDesign(subAccountId, designId);
  if (!duplicate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, design: duplicate });
}
