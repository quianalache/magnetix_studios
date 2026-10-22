import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getEmbedConfig } from "@/lib/server/embed-config-service";
import { resolveChartDesignsForEmbed } from "@/lib/server/chart-design-service";
import { resolvePublicEmbed } from "@/lib/server/featured-offer-service";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import type { ReadingToolPayload } from "@/types/embed-config";

/**
 * Null for a missing/foreign Reading Tool. Status is returned so callers can
 * fail closed. `staff` (builder canvas/preview) also shows a Draft Featured
 * Offer; visitors only ever get a published one.
 */
export async function resolveReadingToolPayload(subAccountId: string, embedId: string, opts: { staff?: boolean } = {}): Promise<ReadingToolPayload | null> {
  const embed = await getEmbedConfig(subAccountId, embedId);
  if (!embed) return null;
  const [subSnap, designs, publicEmbed] = await Promise.all([
    getAdminDb().doc(`subAccounts/${subAccountId}`).get(),
    resolveChartDesignsForEmbed(subAccountId, embed.reading.chartDesignSetId),
    resolvePublicEmbed(embed, { includeDraftOffer: opts.staff }),
  ]);
  const theme = { ...defaultEnergeticDecoderTheme(), ...(subSnap.data()?.energeticDecoderTheme ?? {}) };
  return { embedId: embed.id, status: embed.status, embed: publicEmbed, accent: theme.accent, designs };
}

/** Resolve every Embed a published page places (missing ones map to null). */
export async function resolveReadingToolPayloads(subAccountId: string, embedIds: string[]): Promise<Record<string, ReadingToolPayload | null>> {
  const entries = await Promise.all(embedIds.map(async (id) => [id, await resolveReadingToolPayload(subAccountId, id)] as const));
  return Object.fromEntries(entries);
}
