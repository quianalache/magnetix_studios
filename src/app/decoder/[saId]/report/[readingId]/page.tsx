import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { SphereList, HumanDesignSummary, AstrologySummary } from "@/components/energetic-decoder/reading-summary";

export const dynamic = "force-dynamic";

/**
 * The actual report — the piece that was missing entirely before
 * 2026-08-08. A saved reading used to live only as an admin-only accordion
 * row inside the CRM dashboard; a real client had nowhere to open their
 * own chart. This is that place: a durable, branded, shareable link (the
 * Readings tab's "Share report" copies this URL; the public tool links
 * here right after someone generates their own reading) — the direct
 * equivalent of bodygraph.com's emailed "download link to your report."
 *
 * No auth — the reading ID (an unguessable Firestore doc ID) is the access
 * key, matching how every other public link in this app works. Scoped to
 * saId via getReadingById so a reading can't be opened under the wrong
 * sub-account even if the ID were somehow guessed.
 */
export default async function EnergeticDecoderReportPage({
  params,
}: {
  params: Promise<{ saId: string; readingId: string }>;
}) {
  const { saId, readingId } = await params;
  const reading = await getReadingById(saId, readingId);
  if (!reading) notFound();

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists || subSnap.data()?.status === "archived") notFound();
  const sub = subSnap.data() ?? {};
  const businessName = (sub.name as string) || "Your reading";
  // Merged (not just a whole-object fallback) so a sub-account whose theme
  // was saved before chartDefinedColor existed still gets the default
  // value for it, instead of an undefined color reaching the chart.
  const theme = { ...defaultEnergeticDecoderTheme(), ...(sub.energeticDecoderTheme ?? {}) };

  const hasAnySystem = reading.spheres.length > 0 || !!reading.humanDesign || !!reading.astrology;

  // Full chart-design richness (2026-08-09 rebuild) — fetched in parallel,
  // each independently optional (null when a sub-account never set one up),
  // matching every component's own "falls back to traditional base" rule.
  const [hdDesign, mandalaDesign, astroDesign] = reading.humanDesign || reading.astrology
    ? await Promise.all([
        reading.humanDesign ? getDefaultChartDesign(saId, "humanDesign") : Promise.resolve(null),
        reading.humanDesign ? getDefaultChartDesign(saId, "mandala") : Promise.resolve(null),
        reading.astrology ? getDefaultChartDesign(saId, "astrology") : Promise.resolve(null),
      ])
    : [null, null, null];

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 px-4 py-10 sm:px-6"
      style={{ "--decoder-accent": theme.accent } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-2">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt={businessName} className="h-6 w-auto" />
          ) : null}
          <span className="font-medium text-foreground">{businessName}</span>
        </div>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{reading.name}&apos;s Reading</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {reading.birthPlace} · {reading.birthDate} · {reading.birthTime}
            </p>
          </div>
          <a
            href={`/api/decoder/${saId}/report/${readingId}/pdf`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted"
            download
          >
            Download PDF
          </a>
        </div>

        {hasAnySystem ? (
          <div className="space-y-4">
            {reading.spheres.length > 0 && <SphereList spheres={reading.spheres} />}
            {reading.humanDesign && (
              <HumanDesignSummary profile={reading.humanDesign} hdDesign={hdDesign} mandalaDesign={mandalaDesign} />
            )}
            {reading.astrology && <AstrologySummary chart={reading.astrology} astroDesign={astroDesign} />}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            This reading doesn&apos;t include any systems yet.
          </p>
        )}
      </div>
    </div>
  );
}
