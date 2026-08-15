import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getGeneratedReport } from "@/lib/server/generated-report-service";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { resolveChartDesignsForReading } from "@/lib/server/chart-design-service";
import { renderReportDesignPdfStream, reportDesignPdfFilename } from "@/lib/energetics/report-design-pdf-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET .../generated-reports/[generatedReportId]/pdf — Phase 2 Build Plan
 * Task 6. Streams the PDF for an already-generated report, built from its
 * frozen `snapshot` (not a fresh recompute — see generated-report-
 * service.ts). Chart blocks render off the source reading's real,
 * immutable HD/Astrology data, fetched here since the snapshot itself
 * doesn't carry it (see generated-report.ts's doc comment).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; generatedReportId: string }> },
): Promise<Response> {
  const { id: subAccountId, generatedReportId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const generatedReport = await getGeneratedReport(subAccountId, generatedReportId);
  if (!generatedReport) return NextResponse.json({ error: "Generated report not found" }, { status: 404 });

  const reading = await getReadingById(subAccountId, generatedReport.readingId);
  if (!reading) return NextResponse.json({ error: "Source reading not found" }, { status: 404 });

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const sub = subSnap.exists ? (subSnap.data() ?? {}) : {};
  const businessName = (sub.name as string) || "Your report";
  const businessLogoUrl = typeof sub.logoUrl === "string" ? (sub.logoUrl as string) : null;

  // Honors the source reading's Profile's saved-design override, if it has
  // one (2026-08-15, Bodygraph gap closure) — the downloaded PDF should
  // match what the practitioner chose for this person, not silently
  // revert to the sub-account default.
  const { hdDesign, mandalaDesign, astroDesign } = await resolveChartDesignsForReading(subAccountId, reading);

  const stream = await renderReportDesignPdfStream({
    title: generatedReport.reportDesignTitleAtGeneration,
    readerName: reading.name,
    businessName,
    businessLogoUrl,
    pages: generatedReport.snapshot.pages,
    humanDesign: reading.humanDesign,
    astrology: reading.astrology,
    hdDesign,
    mandalaDesign,
    astroDesign,
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${reportDesignPdfFilename(generatedReport.reportDesignTitleAtGeneration, reading.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
