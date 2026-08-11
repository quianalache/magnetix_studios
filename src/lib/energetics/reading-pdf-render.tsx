import "server-only";

import { renderToStream } from "@react-pdf/renderer";
import { ReadingPdfDocument } from "./reading-pdf-document";
import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart } from "./astrology";
import type { GeneKeysSphereResult } from "./gene-keys";
import type { HumanDesignReadingContent, AstrologyReadingContent } from "@/types/energetic-decoder";
import type { ChartDesign } from "@/types/chart-design";

/**
 * Streams a reading as a PDF — same pattern as quotes' pdf-render.tsx
 * (renderToStream returns a Node Readable; wrapped via Readable.toWeb so
 * NextResponse is happy under any runtime).
 */
export async function renderReadingPdfStream(opts: {
  readerName: string;
  birthDate: string;
  birthPlace: string;
  businessName: string;
  businessLogoUrl?: string | null;
  humanDesign?: (HumanDesignProfile & { content?: HumanDesignReadingContent }) | null;
  astrology?: (AstrologyChart & { content?: AstrologyReadingContent }) | null;
  spheres?: GeneKeysSphereResult[];
  /** The sub-account's default Human Design Chart Design — see reading-pdf-document.tsx for the fallback contract. */
  hdDesign?: ChartDesign | null;
  /** The sub-account's default Mandala Chart Design (system: "mandala") — see reading-pdf-document.tsx for the fallback contract. */
  mandalaDesign?: ChartDesign | null;
  /** The sub-account's default Astrology Chart Design (system: "astrology") — see reading-pdf-document.tsx for the fallback contract. */
  astroDesign?: ChartDesign | null;
}): Promise<ReadableStream<Uint8Array>> {
  const nodeStream = await renderToStream(<ReadingPdfDocument {...opts} />);
  const { Readable } = await import("node:stream");
  return Readable.toWeb(
    nodeStream as unknown as InstanceType<typeof Readable>,
  ) as ReadableStream<Uint8Array>;
}

export function readingPdfFilename(readerName: string): string {
  const safe = (readerName || "reading").replace(/[^A-Za-z0-9_-]+/g, "_");
  return `${safe}_reading.pdf`;
}
