import "server-only";

import { listMediaLibrary, tenantOf } from "@/lib/server/assets/media-library-service";

/**
 * Social publishing may only persist a URL created by the Media Library's
 * explicit public-image approval flow. The lookup is tenant-scoped and uses
 * the canonical Media Library projection, so no legacy asset URL can bypass
 * the approval boundary.
 */
export async function isApprovedSocialImage(subAccountId: string, url: string): Promise<boolean> {
  const items = await listMediaLibrary(await tenantOf(subAccountId), { kind: "image", readyOnly: true });
  return items.some((item) => item.publicUrl === url);
}
