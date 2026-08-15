import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getGeneratedReport } from "@/lib/server/generated-report-service";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { resolveChartDesignsForReading } from "@/lib/server/chart-design-service";

/**
 * Generate Report preview (Phase 2 Build Plan, 2026-08-12) — everything
 * the Preview page needs to render an already-generated report through
 * `ReportDesignViewer`. Deliberately built from the GeneratedReport's own
 * frozen `snapshot.pages` (visibleIf already filtered, shortcodes already
 * resolved at generation time), not the live ReportDesign — same "PDF
 * reflects what was actually generated" contract as the PDF route, now
 * applied to Preview too. Chart data comes from the source reading (not
 * duplicated into the snapshot); safe to re-fetch since readings are
 * immutable once created, so this can never disagree with what's frozen.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; generatedReportId: string }> },
) {
  const { id: subAccountId, generatedReportId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const generatedReport = await getGeneratedReport(subAccountId, generatedReportId);
  if (!generatedReport) return NextResponse.json({ error: "Generated report not found" }, { status: 404 });

  const real = await getReadingById(subAccountId, generatedReport.readingId);
  if (!real) return NextResponse.json({ error: "Source reading not found" }, { status: 404 });

  const design = {
    id: generatedReport.reportDesignId,
    subAccountId,
    agencyId: generatedReport.agencyId,
    title: generatedReport.reportDesignTitleAtGeneration,
    pages: generatedReport.snapshot.pages,
    createdAt: generatedReport.generatedAt,
    updatedAt: generatedReport.generatedAt,
  };
  const reading = {
    name: real.name,
    birthDate: real.birthDate,
    birthPlace: real.birthPlace,
    humanDesign: real.humanDesign,
    astrology: real.astrology,
  };

  // Honors the source reading's Profile's saved-design override, if it has
  // one (2026-08-15, Bodygraph gap closure) — the practitioner's own
  // Preview should show exactly what the client-facing surfaces show.
  const { hdDesign, mandalaDesign, astroDesign } = await resolveChartDesignsForReading(subAccountId, real);

  return NextResponse.json({ ok: true, design, reading, sourceLabel: real.name, hdDesign, mandalaDesign, astroDesign });
}
