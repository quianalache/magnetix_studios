import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { PublicDecoderForm } from "./public-decoder-form";
import type { Metadata } from "next";
import { tenantBrandStyle } from "@/lib/brand/tenant-brand";
import { publicTitle } from "@/lib/server/public-identity";

export const dynamic = "force-dynamic";

/**
 * The embeddable public tool — bodygraph.com's "chart generator" side, in
 * this CRM's terms. A visitor enters their birth details, gets their Gene
 * Keys profile, and becomes a saved Contact + reading for the
 * practitioner automatically (createEnergeticDecoderReading), same as
 * bodygraph's "capture lead, deliver reading."
 */
/** Browser title: the public reading tool · business (2026-10-16 public surfaces). */
export async function generateMetadata({ params }: { params: Promise<{ saId: string }> }): Promise<Metadata> {
  try {
    const { saId } = await params;
    const sub = (await getAdminDb().doc(`subAccounts/${saId}`).get()).data();
    if (!sub || sub.status === "archived") return {};
    return { title: publicTitle("Your Energetic Profile", sub.name as string | undefined) };
  } catch {
    return {};
  }
}

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
    // Tenant public surface (2026-10-16): the Decoder's own existing source
    // (energeticDecoderTheme — its controls were removed, so defaults render)
    // supplies the accent and an already-saved logo; nothing else is added.
    <div
      className="tenant-surface tenant-wash flex min-h-screen items-center justify-center p-4 sm:p-6"
      style={{ ...tenantBrandStyle({ name: businessName, primary: theme.accent }), "--decoder-accent": theme.accent } as React.CSSProperties}
      data-public-shell="decoder"
    >
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2.5">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt={businessName} className="h-7 w-auto" />
          ) : null}
          <span className="public-ink font-semibold">{businessName}</span>
        </div>
        <div className="tenant-card p-6 sm:p-8">
          <h1 className="public-ink text-2xl font-semibold tracking-tight">
            Your Energetic Profile
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
