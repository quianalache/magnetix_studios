import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getEmbedConfig } from "@/lib/server/embed-config-service";
import { resolveChartDesignsForEmbed } from "@/lib/server/chart-design-service";
import { toPublicEmbed } from "@/lib/energetic-decoder/embeds";
import { defaultEnergeticDecoderTheme } from "@/types/energetic-decoder";
import type { ReadingToolPayload } from "@/types/embed-config";

/** Null for a missing/foreign Embed. Status is returned so callers can fail closed. */
export async function resolveReadingToolPayload(subAccountId: string, embedId: string): Promise<ReadingToolPayload | null> {
  const embed = await getEmbedConfig(subAccountId, embedId);
  if (!embed) return null;
  const [subSnap, designs] = await Promise.all([
    getAdminDb().doc(`subAccounts/${subAccountId}`).get(),
    resolveChartDesignsForEmbed(subAccountId, embed.reading.chartDesignSetId),
  ]);
  const theme = { ...defaultEnergeticDecoderTheme(), ...(subSnap.data()?.energeticDecoderTheme ?? {}) };
  return { embedId: embed.id, status: embed.status, embed: toPublicEmbed(embed), accent: theme.accent, designs };
}

/** Resolve every Embed a published page places (missing ones map to null). */
export async function resolveReadingToolPayloads(subAccountId: string, embedIds: string[]): Promise<Record<string, ReadingToolPayload | null>> {
  const entries = await Promise.all(embedIds.map(async (id) => [id, await resolveReadingToolPayload(subAccountId, id)] as const));
  return Object.fromEntries(entries);
}
