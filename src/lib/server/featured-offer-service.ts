import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import { buildOfferUrl } from "@/lib/domains/public-url";
import { offerBillingNote, offerPriceLabel } from "@/lib/course-offers/price-label";
import { toPublicEmbed } from "@/lib/energetic-decoder/embeds";
import type { EmbedConfig, PublicEmbedConfig } from "@/types/embed-config";
import type { FeaturedOfferPayload } from "@/types/reading-blocks";
import type { SubAccountDoc } from "@/types";

/**
 * Featured Offer (2026-10-21) — the one place a Reading result reads a real
 * Offer. Price, billing terms, what it grants and the checkout link all come
 * from the Offer itself; a page or Standard Result only adds presentation
 * (headline, copy, badge, image, layout). Works for every kind of Offer —
 * courses, booking sessions, projects — because it reads what the Offer
 * grants rather than assuming it's a Reading.
 */

function plainSummary(html: string): string {
  const text = html
    .replace(/<(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text;
}

/** Null for a missing Offer or one in another business. Unpublished Offers resolve with `published: false` (the builder shows them; visitors never do). */
export async function resolveFeaturedOffer(subAccountId: string, offerId: string): Promise<FeaturedOfferPayload | null> {
  if (!offerId || !/^[A-Za-z0-9_-]{1,64}$/.test(offerId)) return null;
  const offer = await getCourseOffer(subAccountId, offerId);
  if (!offer || offer.subAccountId !== subAccountId) return null;
  const [sub, courses] = await Promise.all([
    getAdminDb().doc(`subAccounts/${subAccountId}`).get(),
    Promise.all(offer.courseIds.map((id) => getStandaloneCourse(subAccountId, id).catch(() => null))),
  ]);
  const grants: string[] = [];
  for (const c of courses) if (c) grants.push(`Course: ${c.title}`);
  if (offer.booking && offer.booking.sessionCount > 0) {
    grants.push(`${offer.booking.sessionCount} ${offer.booking.sessionCount === 1 ? "session" : "sessions"}: ${offer.booking.bookingPageName}`);
  }
  for (const p of offer.projectTemplates) grants.push(`Project: ${p.templateTitle}`);
  return {
    offerId: offer.id,
    title: offer.title,
    summary: plainSummary(offer.descriptionHtml ?? ""),
    thumbnailUrl: offer.thumbnailUrl ?? null,
    priceLabel: offerPriceLabel(offer),
    billingNote: offerBillingNote(offer),
    grants,
    href: buildOfferUrl({ subAccount: sub.data() as SubAccountDoc | undefined, subAccountId, offerId: offer.id, slug: offer.slug }),
    published: offer.visibility === "published",
  };
}

export async function resolveFeaturedOffers(subAccountId: string, offerIds: string[], opts: { includeDraftOffer?: boolean } = {}): Promise<Record<string, FeaturedOfferPayload | null>> {
  const unique = [...new Set(offerIds.filter(Boolean))];
  const entries = await Promise.all(unique.map(async (id) => {
    const offer = await resolveFeaturedOffer(subAccountId, id);
    return [id, offer && (offer.published || opts.includeDraftOffer) ? offer : null] as const;
  }));
  return Object.fromEntries(entries);
}

/**
 * `toPublicEmbed` plus the Standard Result's Featured Offer. A visitor only
 * ever receives a PUBLISHED Offer; staff Preview/Test also see a Draft Offer
 * so they can check the layout before publishing it.
 */
export async function resolvePublicEmbed(embed: EmbedConfig, opts: { includeDraftOffer?: boolean } = {}): Promise<PublicEmbedConfig> {
  const pub = toPublicEmbed(embed);
  const step = embed.afterSubmit.nextStep;
  if (step.kind !== "featuredOffer") return pub;
  const offer = await resolveFeaturedOffer(embed.subAccountId, step.offerId);
  if (!offer || (!offer.published && !opts.includeDraftOffer)) return pub;
  const { kind: _kind, offerId: _offerId, ...presentation } = step;
  void _kind;
  void _offerId;
  return { ...pub, afterSubmit: { ...pub.afterSubmit, featuredOffer: { presentation, offer } } };
}
