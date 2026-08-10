import { notFound } from "next/navigation";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";

export const dynamic = "force-dynamic";

/**
 * Preview-only route for HumanDesignFullChart (2026-08-10) — her explicit
 * "build the component first, render it in a safe preview/test location
 * so we can inspect it before wiring it into reading-summary.tsx." Not
 * linked from any nav or the real report page; reuses the exact same
 * getReadingById/getDefaultChartDesign pattern the real report page
 * (../page.tsx) uses, so this renders against real reading + real Chart
 * Design data, not a mock. Same "unguessable reading ID is the access
 * key" security posture as the real report page — no new exposure.
 *
 * Delete or fold into reading-summary.tsx once the full chart is approved
 * and actually wired in — this route has no reason to exist afterward.
 */
export default async function HumanDesignFullChartPreviewPage({
  params,
}: {
  params: Promise<{ saId: string; readingId: string }>;
}) {
  const { saId, readingId } = await params;
  const reading = await getReadingById(saId, readingId);
  if (!reading || !reading.humanDesign) notFound();

  const hdDesign = await getDefaultChartDesign(saId, "humanDesign");

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="rounded-xl border border-dashed bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Preview only</strong> — HumanDesignFullChart, not yet wired into the real Readings tab or
          report page. Rendering {reading.name}&apos;s real reading + real Human Design Chart Design.
        </div>
        <div className="overflow-hidden rounded-2xl border shadow-sm">
          <HumanDesignFullChart profile={reading.humanDesign} design={hdDesign} />
        </div>
      </div>
    </div>
  );
}
