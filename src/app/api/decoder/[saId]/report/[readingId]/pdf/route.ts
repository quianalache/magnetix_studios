import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { renderReadingPdfStream, readingPdfFilename } from "@/lib/energetics/reading-pdf-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/decoder/[saId]/report/[readingId]/pdf
 *
 * Public download — same no-auth model as the report page itself
 * (/decoder/[saId]/report/[readingId]): the reading ID is an unguessable
 * Firestore doc ID, that's the access key. Scoped to saId via
 * getReadingById so a reading can't be pulled under the wrong sub-account
 * even if the ID were somehow guessed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; readingId: string }> },
): Promise<Response> {
  const { saId, readingId } = await params;
  const reading = await getReadingById(saId, readingId);
  if (!reading) return NextResponse.json({ error: "Reading not found" }, { status: 404 });

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists || subSnap.data()?.status === "archived") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const sub = subSnap.data() ?? {};
  const businessName = (sub.name as string) || "Your reading";
  const businessLogoUrl = typeof sub.logoUrl === "string" ? (sub.logoUrl as string) : null;
  // Real Chart Design, not the legacy single-field theme — same source
  // the web report page (reading-summary.tsx) reads, so the PDF's Human
  // Design section matches what's actually shown on screen.
  const hdDesign = reading.humanDesign ? await getDefaultChartDesign(saId, "humanDesign") : null;
  // Same real Mandala Chart Design record (system: "mandala", separate from
  // hdDesign) reading-summary.tsx reads, so the PDF's Mandala matches the
  // web Mandala's own colors, not the BodyGraph's.
  const mandalaDesign = reading.humanDesign ? await getDefaultChartDesign(saId, "mandala") : null;
  // Same real Astrology Chart Design record reading-summary.tsx's
  // AstrologySummary reads, so the PDF wheel's accent matches the web
  // wheel's.
  const astroDesign = reading.astrology ? await getDefaultChartDesign(saId, "astrology") : null;

  const stream = await renderReadingPdfStream({
    readerName: reading.name,
    birthDate: reading.birthDate,
    birthPlace: reading.birthPlace,
    businessName,
    businessLogoUrl,
    humanDesign: reading.humanDesign,
    astrology: reading.astrology,
    spheres: reading.spheres,
    hdDesign,
    mandalaDesign,
    astroDesign,
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${readingPdfFilename(reading.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
