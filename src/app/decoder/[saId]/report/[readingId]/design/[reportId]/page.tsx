import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { getReportDesign } from "@/lib/server/report-design-service";
import { resolveChartDesignsForReading } from "@/lib/server/chart-design-service";
import { ReportDesignViewer } from "@/components/energetic-decoder/report-design-viewer";

export const dynamic = "force-dynamic";

/**
 * The piece that was genuinely missing (2026-08-09, found while building
 * the report-page visibility picker): the Report Builder could design a
 * page, but nothing ever delivered that design to a real reader — clients
 * only ever saw the fixed layout at /decoder/[saId]/report/[readingId].
 * This is that missing delivery page: same no-auth "the reading ID is the
 * access key" model, plus the report design ID naming which saved design
 * to render this specific reading through.
 *
 * The plain fixed-layout page still exists and still works — this is
 * additive, a practitioner shares THIS link once they've actually built a
 * real Report Design and wants to deliver that instead of the default.
 */
export default async function EnergeticDecoderReportDesignPage({
  params,
}: {
  params: Promise<{ saId: string; readingId: string; reportId: string }>;
}) {
  const { saId, readingId, reportId } = await params;
  const [reading, design] = await Promise.all([
    getReadingById(saId, readingId),
    getReportDesign(saId, reportId),
  ]);
  if (!reading || !design) notFound();

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists || subSnap.data()?.status === "archived") notFound();
  const sub = subSnap.data() ?? {};
  const businessName = (sub.name as string) || "Your reading";
  const theme = { ...defaultEnergeticDecoderTheme(), ...(sub.energeticDecoderTheme ?? {}) };

  const readingInput = {
    name: reading.name,
    birthDate: reading.birthDate,
    birthPlace: reading.birthPlace,
    humanDesign: reading.humanDesign,
    astrology: reading.astrology,
    spheres: reading.spheres,
  };

  // Honors this reading's Profile's saved-design override when it has one
  // (2026-08-15, Bodygraph gap closure) — same shared resolver the plain
  // report page uses, so a practitioner's per-person design choice is
  // consistent across every client-facing delivery surface, not just one.
  const { hdDesign, mandalaDesign, astroDesign } = await resolveChartDesignsForReading(saId, reading);

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

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{design.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">For {reading.name}</p>
        </div>

        <ReportDesignViewer
          design={design}
          readingInput={readingInput}
          ruleInput={{ humanDesign: reading.humanDesign, astrology: reading.astrology }}
          hdDesign={hdDesign}
          mandalaDesign={mandalaDesign}
          astroDesign={astroDesign}
        />
      </div>
    </div>
  );
}
