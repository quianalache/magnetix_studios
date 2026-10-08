import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { getContentSet } from "@/lib/server/content-set-service";
import { getPreviewSampleReading } from "@/lib/energetics/preview-sample-reading";
import { resolveShortcodes } from "@/lib/energetics/shortcodes";
import { evaluateChartRule } from "@/lib/energetics/chart-rules";
import { renderReportDesignPdfStream } from "@/lib/energetics/report-design-pdf-render";
import { DEFAULT_CONTENT_SET_ID } from "@/lib/energetic-decoder/content-sets";
import type { ReportCanvasElement, ReportDesign, ReportPage } from "@/types/report-blocks";

function resolvePages(design: ReportDesign, reading: Awaited<ReturnType<typeof getPreviewSampleReading>>, contentSet: Awaited<ReturnType<typeof getContentSet>>, ruleInput: Parameters<typeof evaluateChartRule>[1]): ReportPage[] {
  const readingInput = { ...reading, reportContent: { values: contentSet.values, strict: true } };
  return design.pages
    .filter((page) => !page.visibleIf || evaluateChartRule(page.visibleIf, ruleInput))
    .map((page) => ({
      ...page,
      blocks: page.blocks.map((block) => block.type === "text" ? { ...block, html: resolveShortcodes(block.html, readingInput) } : block),
      elements: page.elements?.map((element): ReportCanvasElement => {
        if (element.type === "shortcode") {
          return { ...element, type: "text", payload: { ...element.payload, text: resolveShortcodes(`{{${String(element.payload.token ?? "full_name")}}}`, readingInput) } };
        }
        if (element.type === "text") return { ...element, payload: { ...element.payload, text: resolveShortcodes(String(element.payload.text ?? ""), readingInput) } };
        return element;
      }),
    }));
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
): Promise<Response> {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as { design?: Partial<ReportDesign> } | null;
  if (!body?.design || !Array.isArray(body.design.pages)) return NextResponse.json({ error: "A draft report design is required." }, { status: 400 });

  const design = body.design as ReportDesign;
  const reading = await getPreviewSampleReading();
  const selectedSetId = design.contentSetId || DEFAULT_CONTENT_SET_ID;
  const [contentSet, hdDesign, mandalaDesign, astroDesign, subSnap] = await Promise.all([
    getContentSet(subAccountId, selectedSetId),
    getDefaultChartDesign(subAccountId, "humanDesign"),
    getDefaultChartDesign(subAccountId, "mandala"),
    getDefaultChartDesign(subAccountId, "astrology"),
    getAdminDb().doc(`subAccounts/${subAccountId}`).get(),
  ]);
  const sub = subSnap.exists ? subSnap.data() ?? {} : {};
  const pages = resolvePages(design, reading, contentSet, { humanDesign: reading.humanDesign, astrology: reading.astrology });
  const stream = await renderReportDesignPdfStream({
    title: design.title || "Report preview",
    readerName: reading.name,
    businessName: typeof sub.name === "string" ? sub.name : "Magnetix Studios",
    businessLogoUrl: typeof sub.logoUrl === "string" ? sub.logoUrl : null,
    pages,
    humanDesign: reading.humanDesign,
    astrology: reading.astrology,
    spheres: reading.spheres,
    hdDesign,
    mandalaDesign,
    astroDesign,
    pageSize: design.pageSize,
    customPageSize: design.customPageSize,
  });
  return new NextResponse(stream, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=report-preview.pdf", "Cache-Control": "no-store" } });
}
