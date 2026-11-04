import "server-only";

import { getBunnyPlaybackUrl } from "@/lib/server/bunny-stream-service";
import { collectMediaVideoIds } from "@/lib/pages-funnels/puck/media-video";

/**
 * Media Library videos on a page (Wave 3 Video block): mints a fresh,
 * short-lived Bunny playback URL for each referenced hosted video that
 * belongs to THIS page's own workspace and is ready to play. A foreign,
 * deleted, not-ready or mid-deletion video resolves to null and the block
 * renders nothing. Called per request (public route is force-dynamic), so a
 * visitor always gets a token minted for them.
 */
export async function resolveMediaVideosForPage(
  page: { agencyId?: string | null; subAccountId?: string | null },
  ...trees: unknown[]
): Promise<Record<string, string | null>> {
  if (!page.agencyId || !page.subAccountId) return {};
  const ids = collectMediaVideoIds(...trees).slice(0, 20);
  const scope = { kind: "tenant" as const, agencyId: page.agencyId, subAccountId: page.subAccountId };
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        return [id, await getBunnyPlaybackUrl(scope, id)] as const;
      } catch {
        return [id, null] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}
