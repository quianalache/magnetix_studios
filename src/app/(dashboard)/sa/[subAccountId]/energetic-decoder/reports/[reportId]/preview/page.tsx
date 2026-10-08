"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
  contentSet: { id: string; name: string; values: Record<string, { fields: Record<string, string> }>; strict: boolean };
  missingContent: { entryId: string; field: string }[];
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
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    if (!subAccountId) return;
    const source = searchParams.get("source") ?? "";
    const readingId = searchParams.get("readingId");
    const qs = new URLSearchParams({ source });
    if (readingId) qs.set("readingId", readingId);

    setData(null);
    setError(null);
    setWarningDismissed(false);
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${params.reportId}/preview-data?${qs}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Couldn't load preview.");
        return body as PreviewData;
      })
      .then((next) => {
        if (searchParams.get("draft") === "1") {
          try {
            const draft = JSON.parse(sessionStorage.getItem(`report-design-draft:${params.reportId}`) || "null") as Partial<ReportDesign> | null;
            if (draft?.pages) next.design = { ...next.design, ...draft, pages: draft.pages };
          } catch { /* ignore malformed local draft and show the saved design */ }
        }
        setData(next);
      })
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
              readingInput={{ ...data.reading, reportContent: data.contentSet }}
              ruleInput={{ humanDesign: data.reading.humanDesign, astrology: data.reading.astrology }}
              hdDesign={data.hdDesign}
              mandalaDesign={data.mandalaDesign}
              astroDesign={data.astroDesign}
            />
            {data.missingContent.length > 0 && !warningDismissed && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
                <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-xl">
                  <h2 className="text-lg font-semibold text-amber-950">Some Content Set text is missing</h2>
                  <p className="mt-2 text-sm text-amber-900">This preview will leave {data.missingContent.length} interpretation value{data.missingContent.length === 1 ? "" : "s"} blank. You can continue without filling them.</p>
                  <div className="mt-4 max-h-32 overflow-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-950">{data.missingContent.slice(0, 12).map((m) => <div key={`${m.entryId}.${m.field}`}>{m.entryId} · {m.field}</div>)}</div>
                  <div className="mt-5 flex justify-end gap-2"><button onClick={() => window.close()} className="rounded-lg border px-3 py-2 text-sm">Go back / review Content</button><button onClick={() => setWarningDismissed(true)} className="rounded-lg bg-[#5420a8] px-3 py-2 text-sm font-semibold text-white">Continue anyway</button></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
