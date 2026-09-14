import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { findExternalSubscriptionByProviderAccountSubscription } from "@/lib/server/external-billing-service";
import type { ExternalSubscriptionStatus } from "@/types/external-billing";

export type ExternalBillingSyncResult =
  | { outcome: "no_match"; externalSubscriptionId: string }
  | { outcome: "updated"; externalSubscriptionId: string; recordId: string }
  | { outcome: "stale"; externalSubscriptionId: string; recordId: string };

function normalizedStatus(
  status: Stripe.Subscription.Status,
  deleted: boolean
): ExternalSubscriptionStatus {
  if (deleted && status === "canceled") return "canceled";
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "paused":
    case "canceled":
    case "incomplete":
      return status;
    default:
      return "unknown";
  }
}

function unixOrNull(value: number | null): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function expandedProductName(price: Stripe.Price): string | null {
  const product = price.product;
  if (typeof product === "string" || product.deleted) return null;
  return product.name ?? null;
}

function customerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

/**
 * Synchronizes only an already-imported subscription. The caller must pass the
 * connected account from the verified Stripe event, never from metadata.
 */
export async function syncExternalStripeSubscriptionFromWebhook(input: {
  subscription: Stripe.Subscription;
  providerAccountId: string | null;
  eventCreated: number;
  deleted?: boolean;
}): Promise<ExternalBillingSyncResult> {
  const externalSubscriptionId = input.subscription.id;
  const providerAccountId = input.providerAccountId?.trim();
  if (!providerAccountId) {
    return { outcome: "no_match", externalSubscriptionId };
  }

  const existing = await findExternalSubscriptionByProviderAccountSubscription({
    provider: "stripe",
    providerAccountId,
    externalSubscriptionId,
  });
  if (!existing) return { outcome: "no_match", externalSubscriptionId };

  const firstItem = input.subscription.items.data[0];
  const price = firstItem?.price;
  const updates: Record<string, unknown> = {
    externalCustomerId: customerId(input.subscription),
    externalProductId: price?.product
      ? typeof price.product === "string"
        ? price.product
        : price.product.id
      : null,
    externalPriceId: price?.id ?? null,
    amountCents: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    interval: price?.recurring?.interval ?? null,
    intervalCount: price?.recurring?.interval_count ?? null,
    status: normalizedStatus(input.subscription.status, input.deleted === true),
    providerStatus: input.subscription.status,
    currentPeriodStart: unixOrNull(firstItem?.current_period_start ?? null),
    currentPeriodEnd: unixOrNull(firstItem?.current_period_end ?? null),
    cancelAtPeriodEnd: input.subscription.cancel_at_period_end === true,
    canceledAt: unixOrNull(input.subscription.canceled_at),
    endedAt: unixOrNull(input.subscription.ended_at),
    trialStart: unixOrNull(input.subscription.trial_start),
    trialEnd: unixOrNull(input.subscription.trial_end),
    lastProviderEventCreatedAt: input.eventCreated,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Webhook payloads commonly contain product ids but not expanded product
  // names. Preserve the existing snapshot in that case; never invent a name.
  const productName = price ? expandedProductName(price) : null;
  if (productName !== null) updates.productName = productName;
  if (price?.nickname !== undefined) updates.priceName = price.nickname ?? null;

  const ref = getAdminDb().doc(`externalSubscriptions/${existing.id}`);
  const outcome = await getAdminDb().runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(ref);
    if (!currentSnap.exists) {
      return "stale" as const;
    }
    const current = currentSnap.data() ?? {};
    const lastEvent = current.lastProviderEventCreatedAt;
    if (typeof lastEvent === "number" && input.eventCreated < lastEvent) {
      return "stale" as const;
    }
    transaction.update(ref, updates);
    return "updated" as const;
  });
  if (outcome === "stale") {
    return {
      outcome,
      externalSubscriptionId,
      recordId: existing.id,
    };
  }
  return {
    outcome: "updated",
    externalSubscriptionId,
    recordId: existing.id,
  };
}
