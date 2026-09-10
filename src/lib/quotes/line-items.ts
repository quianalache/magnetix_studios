import type {
  QuoteLineItem,
  QuoteLineItemSourceType,
  QuoteOfferSnapshot,
} from "@/types/quotes";
import type { Product } from "@/types/products";
import type { CourseOffer } from "@/types/course-offers";

/**
 * Pure line-item construction/classification helpers — Phase 1 of the
 * Products/Offers/Quotes/Invoices audit's recommended architecture
 * (2026-09-10). No Firestore, no React, no globals — same "pure in,
 * pure out" discipline as `src/lib/quotes/calc.ts`, and imported by both
 * the builder UI and its own tests.
 */

function newLineItemId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * The effective source of a line item, resolving the backward-compat
 * rule for documents created before `sourceType` existed:
 *
 *   sourceType present        → trust it
 *   sourceType absent + productId set → "legacyProduct"
 *   sourceType absent + no productId  → "custom"
 *
 * Never mutates or backfills the stored document — this is a read-time
 * classification only, used to decide how a line renders in the builder
 * (editable vs. snapshot-locked), never by the PDF or detail-page
 * renderer, which stay `description`/`quantity`/`unitPrice`-only.
 */
export function resolveLineItemSourceType(
  item: Pick<QuoteLineItem, "sourceType" | "productId">,
): QuoteLineItemSourceType {
  if (item.sourceType) return item.sourceType;
  return item.productId ? "legacyProduct" : "custom";
}

/** Builds the Offer snapshot captured at add-time. Pure — takes only the
 *  fields it needs, so it stays stable even as `CourseOffer` grows. */
export function buildOfferSnapshot(
  offer: Pick<
    CourseOffer,
    "id" | "title" | "descriptionHtml" | "type" | "priceCents" | "currency"
  >,
): QuoteOfferSnapshot {
  return {
    offerId: offer.id,
    name: offer.title,
    description: offer.descriptionHtml?.trim() || null,
    offerType: offer.type,
    priceCents: offer.priceCents,
    currency: offer.currency,
  };
}

/**
 * New Offer-backed line item. `description` is plain text (the offer's
 * title only — `descriptionHtml` is rich text and deliberately not
 * dumped into the plain-text field the PDF/detail page render from);
 * `unitPrice` is the offer's price in whole currency units, 0 for a free
 * offer. Quantity defaults to 1, same as the legacy catalog picker.
 */
export function snapshotOfferAsLineItem(
  offer: Pick<
    CourseOffer,
    "id" | "title" | "descriptionHtml" | "type" | "priceCents" | "currency"
  >,
): QuoteLineItem {
  return {
    id: newLineItemId(),
    description: offer.title,
    quantity: 1,
    unitPrice: offer.priceCents != null ? offer.priceCents / 100 : 0,
    productId: null,
    sourceType: "offer",
    offerId: offer.id,
    offerSnapshot: buildOfferSnapshot(offer),
  };
}

/** New legacy Product-backed line item — unchanged behavior, now marked
 *  with an explicit `sourceType` for clarity on new documents (old
 *  documents stay undefined and are read via `resolveLineItemSourceType`). */
export function snapshotProductAsLineItem(
  product: Pick<Product, "id" | "name" | "description" | "unitPriceCents">,
): QuoteLineItem {
  return {
    id: newLineItemId(),
    description: product.description
      ? `${product.name} — ${product.description}`
      : product.name,
    quantity: 1,
    unitPrice: product.unitPriceCents / 100,
    productId: product.id,
    sourceType: "legacyProduct",
  };
}

/** New blank custom line item — description/unitPrice start empty/zero
 *  and are freely editable in the builder, unlike offer/product lines
 *  whose snapshot is locked once added. */
export function createCustomLineItem(): QuoteLineItem {
  return {
    id: newLineItemId(),
    description: "",
    quantity: 1,
    unitPrice: 0,
    productId: null,
    sourceType: "custom",
  };
}
