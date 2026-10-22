import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { collectPuckFeaturedOfferIds } from "@/lib/pages-funnels/puck/resolve";
import { resolveChartDesignsForEmbed, resolveChartDesignsForReading } from "@/lib/server/chart-design-service";
import { resolveFeaturedOffers } from "@/lib/server/featured-offer-service";
import { maskEmail, readingOwnerEmail } from "@/lib/server/reading-access";
import { platformOrigin } from "@/lib/domains/public-url";
import { defaultEnergeticDecoderTheme, type EnergeticDecoderReading } from "@/types/energetic-decoder";
import { DEFAULT_READING_RESULT_PAGE_SETTINGS, READING_SAMPLE_LABEL, type ReadingBlockContext, type ReadingBlockMode, type ReadingResultPageSettings, type ReadingSampleKind } from "@/types/reading-blocks";

/**
 * Builds what every Reading block on a Reading Result Page reads
 * (2026-10-21). Chart Design: the page's default, else the Reading Tool's
 * (saved on the Reading), else the business default. Wording: always the
 * Reading's own saved Content Set — a page can never swap it.
 */
export async function buildReadingBlockContext(opts: {
  subAccountId: string;
  reading: EnergeticDecoderReading;
  mode: ReadingBlockMode;
  pageSettings?: ReadingResultPageSettings | null;
  /** Offers placed in Featured Offer blocks on this page. */
  offerIds?: string[];
  sample?: ReadingSampleKind | null;
}): Promise<ReadingBlockContext> {
  const { subAccountId, reading, mode } = opts;
  const settings = { ...DEFAULT_READING_RESULT_PAGE_SETTINGS, ...(opts.pageSettings ?? {}) };
  const [subSnap, designs, offers, ownerEmail] = await Promise.all([
    getAdminDb().doc(`subAccounts/${subAccountId}`).get(),
    settings.chartDesignSetId
      ? resolveChartDesignsForEmbed(subAccountId, settings.chartDesignSetId)
      : resolveChartDesignsForReading(subAccountId, reading).then((d) => ({ hdDesign: d.hdDesign, mandalaDesign: d.mandalaDesign, astroDesign: d.astroDesign })),
    resolveFeaturedOffers(subAccountId, opts.offerIds ?? []),
    mode === "live" || mode === "test" ? readingOwnerEmail(reading).catch(() => null) : Promise.resolve(null),
  ]);
  const theme = { ...defaultEnergeticDecoderTheme(), ...(subSnap.data()?.energeticDecoderTheme ?? {}) };
  const saved = mode === "live" || mode === "test";
  // Readings made before Reading Tools existed have no snapshot — treat
  // them like today's default (MyMagnetix on, PDF on).
  const myMagnetixOn = reading.embed ? reading.embed.myMagnetix !== false : true;
  const pdfOn = reading.embed ? reading.embed.pdf !== false : true;
  return {
    subAccountId,
    // Plain data only — Reading blocks are client components, and a stray
    // Firestore Timestamp on the doc would fail the server→client handoff.
    reading: JSON.parse(JSON.stringify(reading)) as EnergeticDecoderReading,
    designs: JSON.parse(JSON.stringify(designs)) as typeof designs,
    accent: theme.accent,
    mode,
    access: {
      // Same-host links — the result cookie set on this domain authorizes them.
      pdfHref: saved && pdfOn ? `/api/decoder/${subAccountId}/report/${reading.id}/pdf` : null,
      reportHref: saved && !myMagnetixOn ? `/decoder/${subAccountId}/report/${reading.id}` : null,
      myMagnetix: myMagnetixOn
        ? {
            actionUrl: saved ? `/api/decoder/${subAccountId}/result` : null,
            openUrl: `${platformOrigin()}/my/readings/${reading.id}`,
            maskedEmail: maskEmail(ownerEmail),
          }
        : null,
    },
    offers,
    sampleLabel: opts.sample ? READING_SAMPLE_LABEL[opts.sample] : null,
  };
}

/** Every Offer placed by a Featured Offer block anywhere in a page. */
export const collectFeaturedOfferIds = collectPuckFeaturedOfferIds;
