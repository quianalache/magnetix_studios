import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { PublicDecoderForm } from "./public-decoder-form";

export const dynamic = "force-dynamic";

/**
 * The embeddable public tool — bodygraph.com's "chart generator" side, in
 * this CRM's terms. A visitor enters their birth details, gets their Gene
 * Keys profile, and becomes a saved Contact + reading for the
 * practitioner automatically (createEnergeticDecoderReading), same as
 * bodygraph's "capture lead, deliver reading."
 */
export default async function PublicDecoderPage({
  params,
}: {
  params: Promise<{ saId: string }>;
}) {
  const { saId } = await params;
  const snap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!snap.exists || snap.data()?.status === "archived") notFound();

  const sub = snap.data() ?? {};
  const businessName = (sub.name as string) || "Energetic Decoder";
  const theme = { ...defaultEnergeticDecoderTheme(), ...(sub.energeticDecoderTheme ?? {}) };

  // Full Chart Designs (2026-08-09 rebuild) — fetched unconditionally since
  // this is the pre-submit form; which systems the resulting reading
  // includes isn't known until the visitor actually submits.
  const [hdDesign, mandalaDesign, astroDesign] = await Promise.all([
    getDefaultChartDesign(saId, "humanDesign"),
    getDefaultChartDesign(saId, "mandala"),
    getDefaultChartDesign(saId, "astrology"),
  ]);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-4 sm:p-6"
      style={{ "--decoder-accent": theme.accent } as React.CSSProperties}
    >
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt={businessName} className="h-6 w-auto" />
          ) : null}
          <span className="font-medium text-foreground">{businessName}</span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your Frequency Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your birth details to decode your energetic blueprint.
          </p>
          <div className="mt-6">
            <PublicDecoderForm
              saId={saId}
              accent={theme.accent}
              hdDesign={hdDesign}
              mandalaDesign={mandalaDesign}
              astroDesign={astroDesign}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
