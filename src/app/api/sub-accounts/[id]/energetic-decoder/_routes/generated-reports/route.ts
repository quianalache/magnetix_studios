import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listGeneratedReports, listGeneratedReportsForProfile, createGeneratedReport } from "@/lib/server/generated-report-service";
import { getReportDesign } from "@/lib/server/report-design-service";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { getContentSet } from "@/lib/server/content-set-service";
import { DEFAULT_CONTENT_SET_ID, missingContentForReading, type ContentReadingInput } from "@/lib/energetic-decoder/content-sets";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const readingId = url.searchParams.get("readingId") ?? undefined;
  const reportDesignId = url.searchParams.get("reportDesignId") ?? undefined;

  // `?profileId=` — the Reading workspace's Reports tab (every reading of one Profile).
  const profileId = url.searchParams.get("profileId");
  const reports = profileId
    ? await listGeneratedReportsForProfile(subAccountId, profileId)
    : await listGeneratedReports(subAccountId, { readingId, reportDesignId });
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
  const confirmMissing = body.confirmMissing === true;
  if (!reportDesignId || !readingId) {
    return NextResponse.json({ error: "reportDesignId and readingId are both required" }, { status: 400 });
  }

  const [design, reading] = await Promise.all([getReportDesign(subAccountId, reportDesignId), getReadingById(subAccountId, readingId)]);
  if (!design || !reading) return NextResponse.json({ error: "Report design or reading not found" }, { status: 422 });
  const contentSet = await getContentSet(subAccountId, design.contentSetId || DEFAULT_CONTENT_SET_ID);
  const missingContent = missingContentForReading(reading as ContentReadingInput, (entryId) => contentSet.values[entryId]);
  if (missingContent.length > 0 && !confirmMissing) {
    return NextResponse.json({ error: "missing_content", missingContent, contentSetName: contentSet.name }, { status: 409 });
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
