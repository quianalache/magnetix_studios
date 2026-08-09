import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { renderReadingPdfStream, readingPdfFilename } from "@/lib/energetics/reading-pdf-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sub-accounts/[id]/energetic-decoder/readings/[readingId]/pdf
 *
 * Operator-facing PDF download (Readings tab). Same renderer as the public
 * route under /api/decoder/[saId]/report/[readingId]/pdf — the only
 * difference is auth (sub-account membership required here vs. the
 * reading ID itself being the access key there).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; readingId: string }> },
): Promise<Response> {
  const { id: subAccountId, readingId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const reading = await getReadingById(subAccountId, readingId);
  if (!reading) return NextResponse.json({ error: "Reading not found" }, { status: 404 });

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const sub = subSnap.exists ? (subSnap.data() ?? {}) : {};
  const businessName = (sub.name as string) || "Your reading";
  const businessLogoUrl = typeof sub.logoUrl === "string" ? (sub.logoUrl as string) : null;
  const theme = { ...defaultEnergeticDecoderTheme(), ...(sub.energeticDecoderTheme ?? {}) };

  const stream = await renderReadingPdfStream({
    readerName: reading.name,
    birthDate: reading.birthDate,
    birthPlace: reading.birthPlace,
    businessName,
    businessLogoUrl,
    humanDesign: reading.humanDesign,
    astrology: reading.astrology,
    spheres: reading.spheres,
    definedColor: theme.chartDefinedColor,
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${readingPdfFilename(reading.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
