"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { ReportDesignViewer } from "@/components/energetic-decoder/report-design-viewer";
import type { ReportDesign } from "@/types/report-blocks";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import type { ChartDesign } from "@/types/chart-design";

interface PreviewData {
  design: ReportDesign;
  reading: {
    name: string;
    birthDate: string;
    birthPlace: string;
    humanDesign: HumanDesignProfile | null;
    astrology: AstrologyChart | null;
  };
  sourceLabel: string;
  hdDesign: ChartDesign | null;
  mandalaDesign: ChartDesign | null;
  astroDesign: ChartDesign | null;
}

/**
 * Report Builder Preview (2026-08-12) — opens in a new tab from the editor
 * once the current draft has saved. Renders through the exact same
 * `ReportDesignViewer` the public report-delivery route uses — same page
 * filtering (`ReportPage.visibleIf`), same shortcode resolution, same
 * chart rendering. No second renderer, no WYSIWYG approximation: what's
 * shown here is the real output, just reached from inside the editor
 * instead of a shared client link.
 *
 * Source ("sample" or a real "reading") is resolved entirely by the
 * `preview-data` API route — this page only asks for whichever `source`/
 * `readingId` the query string carries, so swapping "Reading" for the
 * approved Energetic Profile architecture later only touches that one
 * route, not this page or the viewer.
 */
export default function ReportDesignPreviewPage() {
  const { subAccountId } = useSubAccount();
  const params = useParams<{ reportId: string }>();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    const source = searchParams.get("source") ?? "";
    const readingId = searchParams.get("readingId");
    const qs = new URLSearchParams({ source });
    if (readingId) qs.set("readingId", readingId);

    setData(null);
    setError(null);
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${params.reportId}/preview-data?${qs}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Couldn't load preview.");
        return body as PreviewData;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [subAccountId, params.reportId, searchParams]);

  return (
    <div className="momentum-scope min-h-screen bg-muted/20 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            onClick={() => window.close()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Close preview
          </button>
          {data && (
            <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Preview · {data.sourceLabel}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!data && !error && <div className="h-96 w-full animate-pulse rounded-2xl bg-muted/30" />}

        {data && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight">{data.design.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">For {data.reading.name}</p>
            </div>
            <ReportDesignViewer
              design={data.design}
              readingInput={data.reading}
              ruleInput={{ humanDesign: data.reading.humanDesign, astrology: data.reading.astrology }}
              hdDesign={data.hdDesign}
              mandalaDesign={data.mandalaDesign}
              astroDesign={data.astroDesign}
            />
          </>
        )}
      </div>
    </div>
  );
}
