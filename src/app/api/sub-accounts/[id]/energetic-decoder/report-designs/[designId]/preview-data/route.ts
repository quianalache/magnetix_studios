import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getReportDesign } from "@/lib/server/report-design-service";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { getPreviewSampleReading } from "@/lib/energetics/preview-sample-reading";

/**
 * Report Builder Preview (2026-08-12) — everything the internal Preview
 * page needs in one authenticated call: the saved `ReportDesign` plus a
 * `reading`-shaped source to render it against, either a real Energetic
 * Decoder reading this sub-account already owns, or the built-in
 * deterministic sample reading (see preview-sample-reading.ts). Deliberately
 * NOT reused for the public/no-auth report-delivery route — this one is
 * gated by `requireSubAccountMember` since it can read ANY of this
 * sub-account's readings by ID, not just the one reading a delivery link
 * was scoped to.
 *
 * The `source` selection layer is intentionally this API route's only job
 * (a `?source=reading&readingId=…` / `?source=sample` switch), so the
 * eventual Reading → Energetic Profile swap (Phase 2 architecture,
 * approved) only touches this one function later, not the Preview page or
 * ReportDesignViewer itself.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
) {
  const { id: subAccountId, designId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const design = await getReportDesign(subAccountId, designId);
  if (!design) return NextResponse.json({ error: "Report design not found" }, { status: 404 });

  const url = new URL(request.url);
  const source = url.searchParams.get("source");

  let reading: { name: string; birthDate: string; birthPlace: string; humanDesign: unknown; astrology: unknown };
  let sourceLabel: string;

  if (source === "sample") {
    const sample = await getPreviewSampleReading();
    reading = sample;
    sourceLabel = "Sample Data";
  } else if (source === "reading") {
    const readingId = url.searchParams.get("readingId");
    if (!readingId) return NextResponse.json({ error: "readingId is required for source=reading" }, { status: 400 });
    const real = await getReadingById(subAccountId, readingId);
    if (!real) return NextResponse.json({ error: "Reading not found" }, { status: 404 });
    reading = {
      name: real.name,
      birthDate: real.birthDate,
      birthPlace: real.birthPlace,
      humanDesign: real.humanDesign,
      astrology: real.astrology,
    };
    sourceLabel = real.name;
  } else {
    return NextResponse.json({ error: "source must be 'sample' or 'reading'" }, { status: 400 });
  }

  const [hdDesign, mandalaDesign, astroDesign] = await Promise.all([
    getDefaultChartDesign(subAccountId, "humanDesign"),
    getDefaultChartDesign(subAccountId, "mandala"),
    getDefaultChartDesign(subAccountId, "astrology"),
  ]);

  return NextResponse.json({ ok: true, design, reading, sourceLabel, hdDesign, mandalaDesign, astroDesign });
}
