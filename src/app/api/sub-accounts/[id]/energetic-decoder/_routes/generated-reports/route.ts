import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listGeneratedReports, createGeneratedReport } from "@/lib/server/generated-report-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const readingId = url.searchParams.get("readingId") ?? undefined;
  const reportDesignId = url.searchParams.get("reportDesignId") ?? undefined;

  const reports = await listGeneratedReports(subAccountId, { readingId, reportDesignId });
  return NextResponse.json({ ok: true, reports });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (!access.agencyId) {
    return NextResponse.json({ error: "No agency on this account" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reportDesignId = typeof body.reportDesignId === "string" ? body.reportDesignId : "";
  const readingId = typeof body.readingId === "string" ? body.readingId : "";
  if (!reportDesignId || !readingId) {
    return NextResponse.json({ error: "reportDesignId and readingId are both required" }, { status: 400 });
  }

  const result = await createGeneratedReport({
    agencyId: access.agencyId,
    subAccountId,
    reportDesignId,
    readingId,
    generatedByUid: access.uid,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, generatedReport: result });
}
