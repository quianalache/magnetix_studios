import type { Quote } from "@/types/quotes";

/**
 * The quote fields the portal Billing list renders — plain values only, so
 * the server page can pass them to its Client Component. A raw Quote doc
 * carries Firestore Timestamps, which React refuses to serialize (that
 * crashed Billing with a 500 for any member who had a quote or invoice).
 */
export type PortalQuoteSummary = Pick<Quote, "id" | "kind" | "quoteNumber" | "status" | "currency" | "lineItems" | "globalDiscount" | "globalTaxPercent">;

export function toPortalQuoteSummary(q: Quote): PortalQuoteSummary {
  return {
    id: q.id,
    kind: q.kind,
    quoteNumber: q.quoteNumber,
    status: q.status,
    currency: q.currency,
    lineItems: (q.lineItems ?? []).map((l) => ({ ...l })),
    globalDiscount: q.globalDiscount ? { ...q.globalDiscount } : null,
    globalTaxPercent: q.globalTaxPercent ?? null,
  };
}
