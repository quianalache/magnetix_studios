import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getGeneratedReport, deleteGeneratedReport } from "@/lib/server/generated-report-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; generatedReportId: string }> },
) {
  const { id: subAccountId, generatedReportId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const report = await getGeneratedReport(subAccountId, generatedReportId);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, generatedReport: report });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; generatedReportId: string }> },
) {
  const { id: subAccountId, generatedReportId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteGeneratedReport(subAccountId, generatedReportId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
