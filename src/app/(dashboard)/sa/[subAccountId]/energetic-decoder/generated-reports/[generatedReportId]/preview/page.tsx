"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { ReportDesignViewer } from "@/components/energetic-decoder/report-design-viewer";
import type { ReportDesign } from "@/types/report-blocks";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";
import type { ChartDesign } from "@/types/chart-design";

interface PreviewData {
  design: ReportDesign;
  reading: {
    name: string;
    birthDate: string;
    birthPlace: string;
    humanDesign: HumanDesignProfile | null;
    astrology: AstrologyChart | null;
    spheres?: GeneKeysSphereResult[];
  };
  sourceLabel: string;
  hdDesign: ChartDesign | null;
  mandalaDesign: ChartDesign | null;
  astroDesign: ChartDesign | null;
}

/**
 * Preview for an already-generated report (Phase 2 Build Plan,
 * 2026-08-12) — opens in a new tab from the Readings tab's "Generate
 * Report" flow. Same `ReportDesignViewer` as Report Builder Preview and
 * the public report-delivery route — the difference is only in what feeds
 * it: this page's `preview-data` route sources pages from the
 * GeneratedReport's own frozen snapshot, not the live template, so what's
 * shown here matches what was actually generated (and what the PDF
 * download produces) even if the template changes later.
 */
export default function GeneratedReportPreviewPage() {
  const { subAccountId } = useSubAccount();
  const params = useParams<{ generatedReportId: string }>();
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports/${params.generatedReportId}/preview-data`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Couldn't load preview.");
        return body as PreviewData;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [subAccountId, params.generatedReportId]);

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
              Generated report · {data.sourceLabel}
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
