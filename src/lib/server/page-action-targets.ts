import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { buildOfferUrl, buildPublishedPageUrl } from "@/lib/domains/public-url";
import { collectActionTargets } from "@/lib/pages-funnels/puck/action";
import type { ResolvedActionTargets } from "@/types/pages-funnels-puck";
import type { PageDoc } from "@/types/pages-funnels";
import type { SubAccountDoc } from "@/types";

/**
 * Resolves a page's object-bound Button/Image actions (Go to Page, Go to
 * Offer) to their authoritative public URLs — custom-domain aware, via the
 * same builders every other public link uses. Tenant-safe by construction:
 * a target resolves only when it belongs to `subAccountId` AND visitors can
 * open it (published page / published Offer). Anything else is null and the
 * button renders without a link.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function resolveActionTargets(
  subAccountId: string,
  ids: { pageIds: string[]; offerIds: string[]; sectionIds?: string[] },
): Promise<ResolvedActionTargets> {
  const pageIds = [...new Set(ids.pageIds.filter((id) => ID.test(id)))].slice(0, 50);
  const offerIds = [...new Set(ids.offerIds.filter((id) => ID.test(id)))].slice(0, 50);
  const result: ResolvedActionTargets = { pages: {}, offers: {}, sectionIds: ids.sectionIds ?? [] };
  if (!subAccountId || (pageIds.length === 0 && offerIds.length === 0)) return result;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const sub = subSnap.data() as SubAccountDoc | undefined;

  await Promise.all([
    ...pageIds.map(async (pageId) => {
      const snap = await db.collection("pages").doc(pageId).get();
      const page = snap.data() as PageDoc | undefined;
      result.pages[pageId] =
        page && page.subAccountId === subAccountId && page.status === "published"
          ? { href: buildPublishedPageUrl({ subAccount: sub, pageId }) }
          : null;
    }),
    ...offerIds.map(async (offerId) => {
      const offer = await getCourseOffer(subAccountId, offerId).catch(() => null);
      result.offers[offerId] =
        offer && offer.subAccountId === subAccountId && offer.visibility === "published"
          ? { href: buildOfferUrl({ subAccount: sub, subAccountId, offerId: offer.id, slug: offer.slug }) }
          : null;
    }),
  ]);
  return result;
}

/** Collects and resolves every action target on one page's Puck data. */
export async function resolvePageActionTargets(subAccountId: string, data: unknown): Promise<ResolvedActionTargets> {
  return resolveActionTargets(subAccountId, collectActionTargets(data));
}
