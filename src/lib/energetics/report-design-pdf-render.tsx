import "server-only";

import { renderToStream } from "@react-pdf/renderer";
import { ReportDesignPdfDocument } from "./report-design-pdf-document";
import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart } from "./astrology";
import type { ChartDesign } from "@/types/chart-design";
import type { ReportPage } from "@/types/report-blocks";

/** Same pattern as reading-pdf-render.tsx — renderToStream returns a Node Readable, wrapped via Readable.toWeb so NextResponse is happy under any runtime. */
export async function renderReportDesignPdfStream(opts: {
  title: string;
  readerName: string;
  businessName: string;
  businessLogoUrl?: string | null;
  pages: ReportPage[];
  humanDesign?: HumanDesignProfile | null;
  astrology?: AstrologyChart | null;
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
}): Promise<ReadableStream<Uint8Array>> {
  const nodeStream = await renderToStream(<ReportDesignPdfDocument {...opts} />);
  const { Readable } = await import("node:stream");
  return Readable.toWeb(
    nodeStream as unknown as InstanceType<typeof Readable>,
  ) as ReadableStream<Uint8Array>;
}

export function reportDesignPdfFilename(title: string, readerName: string): string {
  const safeTitle = (title || "report").replace(/[^A-Za-z0-9_-]+/g, "_");
  const safeName = (readerName || "reading").replace(/[^A-Za-z0-9_-]+/g, "_");
  return `${safeTitle}_${safeName}.pdf`;
}
