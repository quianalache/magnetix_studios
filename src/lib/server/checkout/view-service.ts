import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { offerBillingNote, offerPriceLabel } from "@/lib/course-offers/price-label";
import { computeOrderTotals, lineFromOffer } from "@/lib/checkout/pricing";
import type { CheckoutView } from "@/lib/checkout/view-types";
import { courseTitlesFor, entitlementSummary } from "./config-service";
import { paymentReadiness, resolveCheckout } from "./order-service";

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Build the client-safe checkout view for a config (public or preview). */
export async function buildCheckoutView(configId: string, opts: { preview?: boolean } = {}): Promise<CheckoutView> {
  const resolved = await resolveCheckout(configId, opts);
  const { config, primary } = resolved;
  const [titles, sub, payment] = await Promise.all([
    courseTitlesFor(config.subAccountId),
    getAdminDb().doc(`subAccounts/${config.subAccountId}`).get(),
    paymentReadiness(resolved),
  ]);
  const sa = sub.data() ?? {};
  const accent = primary.theme?.colors?.accent?.[0] ?? null;
  return {
    configId: config.id,
    subAccountId: config.subAccountId,
    brand: {
      name: (sa.name as string) ?? "",
      logoUrl: (sa.logoUrl as string) || null,
      primary: typeof accent === "string" && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : null,
    },
    format: config.format,
    nameFormat: config.nameFormat,
    phone: config.phone,
    billingAddress: config.billingAddress,
    agreement: config.agreement,
    couponsEnabled: config.couponsEnabled,
    display: config.display,
    primary: {
      offerId: primary.id,
      title: primary.title,
      description: stripHtml(primary.descriptionHtml ?? "").slice(0, 280),
      thumbnailUrl: primary.thumbnailUrl,
      priceLabel: offerPriceLabel(primary),
      billingNote: offerBillingNote(primary),
      entitlements: entitlementSummary(primary, titles),
    },
    bumps: resolved.bumps.map(({ bump, offer }) => ({
      bumpId: bump.id,
      offerId: offer.id,
      headline: bump.headline || offer.title,
      description: bump.description || stripHtml(offer.descriptionHtml ?? "").slice(0, 200),
      imageUrl: bump.imageUrl || offer.thumbnailUrl || null,
      badge: bump.badge,
      checkboxLabel: bump.checkboxLabel || "Yes, add this to my order",
      priceLabel: offerPriceLabel(offer),
    })),
    initialTotals: computeOrderTotals([lineFromOffer(primary, "primary")]),
    payment,
    preview: opts.preview === true,
  };
}
