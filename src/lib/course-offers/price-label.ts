import { formatCurrency } from "@/lib/format";
import type { CourseOffer } from "@/types/course-offers";

/**
 * The price an Offer advertises — identical to the Offer's own checkout
 * page (src/app/offer/[saId]/[offerId]/page.tsx), so anything that features
 * an Offer elsewhere can never show a different price from checkout.
 */
export function offerPriceLabel(offer: Pick<CourseOffer, "type" | "priceCents" | "currency" | "recurringInterval" | "priceTextOverride">): string {
  if (offer.priceTextOverride) return offer.priceTextOverride;
  if (offer.type === "free") return "Free";
  const amount = formatCurrency((offer.priceCents ?? 0) / 100, offer.currency ?? "USD");
  return offer.type === "recurring" ? `${amount} / ${offer.recurringInterval ?? "month"}` : amount;
}

/** Billing terms beyond the price: renewal and any free trial. Null for one-time and free Offers. */
export function offerBillingNote(offer: Pick<CourseOffer, "type" | "recurringInterval" | "trialDays">): string | null {
  if (offer.type !== "recurring") return null;
  const parts = [`Renews every ${offer.recurringInterval ?? "month"}`];
  if (offer.trialDays && offer.trialDays > 0) parts.push(`${offer.trialDays}-day free trial`);
  return parts.join(" · ");
}
