import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import { getDefaultChartDesign, resolveChartDesignsForEmbed } from "@/lib/server/chart-design-service";
import { getEmbedConfig } from "@/lib/server/embed-config-service";
import { getStaffForSubAccount } from "@/lib/auth/current-staff";
import { legacyPublicEmbed, toPublicEmbed } from "@/lib/energetic-decoder/embeds";
import { PublicReadingTool, type ReadingToolMode } from "@/components/energetic-decoder/public-reading-tool";
import type { Metadata } from "next";
import type { ReadingPlacement } from "@/types/embed-config";
import { tenantBrandStyle } from "@/lib/brand/tenant-brand";
import { publicTitle } from "@/lib/server/public-identity";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The Public Reading Tool's own page. `?embed={id}` renders that Embed's
 * configured experience (the hosted/direct link, and the iframe target for
 * external installs — `&embedded=1`, `&host={host page hostname}` added by
 * the install script). Without `?embed` it's the original Embed-less tool,
 * unchanged for existing links.
 *
 * `&mode=preview|test` are staff-only rehearsals (require a signed-in member
 * of this business); a Draft or Archived Embed is not reachable publicly.
 */
export async function generateMetadata({ params }: { params: Promise<{ saId: string }> }): Promise<Metadata> {
  try {
    const { saId } = await params;
    const sub = (await getAdminDb().doc(`subAccounts/${saId}`).get()).data();
    if (!sub || sub.status === "archived") return {};
    return { title: publicTitle("Your Energetic Profile", sub.name as string | undefined), robots: { index: false } };
  } catch {
    return {};
  }
}

export default async function PublicDecoderPage({
  params,
  searchParams,
}: {
  params: Promise<{ saId: string }>;
  searchParams?: SearchParams;
}) {
  const { saId } = await params;
  const sp = (await searchParams) ?? {};
  const snap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!snap.exists || snap.data()?.status === "archived") notFound();

  const sub = snap.data() ?? {};
  const businessName = (sub.name as string) || "Energetic Decoder";
  const theme = { ...defaultEnergeticDecoderTheme(), ...(sub.energeticDecoderTheme ?? {}) };

  const requestedMode = one(sp.mode);
  const mode: ReadingToolMode = requestedMode === "preview" || requestedMode === "test" ? requestedMode : "live";
  if (mode !== "live" && !(await getStaffForSubAccount(saId))) notFound();

  const embedId = one(sp.embed);
  const embed = embedId ? await getEmbedConfig(saId, embedId) : null;
  if (embedId && !embed) notFound();
  // Draft and Archived Embeds fail closed for visitors; staff can still Preview/Test.
  if (embed && mode === "live" && embed.status !== "live") notFound();

  const designs = embed
    ? await resolveChartDesignsForEmbed(saId, embed.reading.chartDesignSetId)
    : await Promise.all([
        getDefaultChartDesign(saId, "humanDesign"),
        getDefaultChartDesign(saId, "mandala"),
        getDefaultChartDesign(saId, "astrology"),
      ]).then(([hdDesign, mandalaDesign, astroDesign]) => ({ hdDesign, mandalaDesign, astroDesign }));

  const embedded = one(sp.embedded) === "1";
  const host = one(sp.host).toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 120);
  const placement: ReadingPlacement = embedded ? { kind: "external", host: host || null } : { kind: "direct" };

  const tool = (
    <PublicReadingTool
      saId={saId}
      embedId={embed?.id ?? null}
      embed={embed ? toPublicEmbed(embed) : legacyPublicEmbed()}
      accent={theme.accent}
      hdDesign={designs.hdDesign}
      mandalaDesign={designs.mandalaDesign}
      astroDesign={designs.astroDesign}
      mode={mode}
      placement={placement}
      embedded={embedded}
      logVisit={!!embed && mode === "live"}
      cardClassName="tenant-card p-6 sm:p-8"
      headingLevel={1}
    />
  );

  if (embedded) {
    // Inside another site's iframe: no business header, transparent canvas.
    return (
      <div
        className="tenant-surface p-3 sm:p-4"
        style={{ ...tenantBrandStyle({ name: businessName, primary: theme.accent }), "--decoder-accent": theme.accent, background: "transparent" } as React.CSSProperties}
        data-public-shell="decoder-embedded"
      >
        {tool}
      </div>
    );
  }

  return (
    // Tenant public surface (2026-10-16): the Decoder's own existing source
    // (energeticDecoderTheme — its controls were removed, so defaults render)
    // supplies the accent and an already-saved logo; nothing else is added.
    <div
      className="tenant-surface tenant-wash min-h-screen p-4 sm:p-6"
      style={{ ...tenantBrandStyle({ name: businessName, primary: theme.accent }), "--decoder-accent": theme.accent } as React.CSSProperties}
      data-public-shell="decoder"
    >
      <div className="mx-auto mb-6 flex w-full max-w-lg items-center justify-center gap-2.5 pt-4 sm:pt-10">
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.logoUrl} alt={businessName} className="h-7 w-auto" />
        ) : null}
        <span className="public-ink font-semibold">{businessName}</span>
      </div>
      {tool}
    </div>
  );
}
