import "server-only";

import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getStripeConnectionForEnvironment,
  getStripeEnvironment,
  getStripeServer,
} from "@/lib/stripe/server";
import type {
  DiscoveredStripeCustomer,
  DiscoveredStripeSubscription,
  StripeContactMatch,
  StripeDiscoveryPage,
} from "@/types/stripe-discovery";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export type StripeDiscoveryErrorCode =
  | "SUB_ACCOUNT_NOT_FOUND"
  | "STRIPE_NOT_CONNECTED"
  | "STRIPE_ACCOUNT_UNAVAILABLE"
  | "STRIPE_API_ERROR"
  | "STRIPE_RESOURCE_NOT_FOUND"
  | "INVALID_CURSOR";

export class StripeDiscoveryError extends Error {
  constructor(
    public readonly code: StripeDiscoveryErrorCode,
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "StripeDiscoveryError";
  }
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function isoFromUnix(value: number | null | undefined): string | null {
  return typeof value === "number"
    ? new Date(value * 1000).toISOString()
    : null;
}

function safeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new StripeDiscoveryError(
      "INVALID_CURSOR",
      `limit must be an integer between 1 and ${MAX_LIMIT}.`,
      400
    );
  }
  return value;
}

function metadata(
  value: Stripe.Metadata | null | undefined
): Record<string, string> {
  return value ? { ...value } : {};
}

async function connectedAccountFor(subAccountId: string): Promise<string> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) {
    throw new StripeDiscoveryError(
      "SUB_ACCOUNT_NOT_FOUND",
      "Sub-account not found.",
      404
    );
  }
  const environment = getStripeEnvironment();
  const connection = getStripeConnectionForEnvironment(
    snap.data()?.stripeConnect,
    environment
  );
  const accountId = connection?.accountId?.trim();
  if (!accountId) {
    throw new StripeDiscoveryError(
      "STRIPE_NOT_CONNECTED",
      "This sub-account does not have a connected Stripe account.",
      409
    );
  }
  return accountId;
}

function stripeError(error: unknown): StripeDiscoveryError {
  const candidate = error as {
    code?: string;
    statusCode?: number;
    type?: string;
  };
  if (candidate.code === "resource_missing" || candidate.statusCode === 404) {
    return new StripeDiscoveryError(
      "STRIPE_RESOURCE_NOT_FOUND",
      "The requested Stripe resource was not found on the connected account.",
      404
    );
  }
  if (
    candidate.code === "account_invalid" ||
    candidate.code === "permission_denied" ||
    candidate.type === "StripePermissionError" ||
    candidate.statusCode === 401 ||
    candidate.statusCode === 403
  ) {
    return new StripeDiscoveryError(
      "STRIPE_ACCOUNT_UNAVAILABLE",
      "The connected Stripe account is unavailable for discovery.",
      503
    );
  }
  if (
    candidate.code === "parameter_invalid_integer" ||
    candidate.code === "invalid_request_error"
  ) {
    return new StripeDiscoveryError(
      "INVALID_CURSOR",
      "The Stripe discovery request is invalid.",
      400
    );
  }
  return new StripeDiscoveryError(
    "STRIPE_API_ERROR",
    "Stripe discovery failed.",
    502
  );
}

function customerSnapshot(
  customer: Stripe.Customer,
  providerAccountId: string
): DiscoveredStripeCustomer {
  return {
    externalCustomerId: customer.id,
    providerAccountId,
    email: customer.email ?? null,
    normalizedEmail: normalizeEmail(customer.email),
    name: customer.name ?? null,
    phone: customer.phone ?? null,
    createdAt: isoFromUnix(customer.created),
    delinquent: customer.delinquent ?? null,
    metadata: metadata(customer.metadata),
    subscriptionCount: null,
    livemode: customer.livemode,
  };
}

function subscriptionSnapshot(
  subscription: Stripe.Subscription,
  providerAccountId: string
): DiscoveredStripeSubscription {
  const items = subscription.items.data.map((item) => {
    const price = item.price;
    const product = price.product;
    return {
      priceId: price.id,
      productId: typeof product === "string" ? product : (product?.id ?? null),
      productName:
        typeof product === "string" || product.deleted
          ? null
          : (product.name ?? null),
      priceName: price.nickname ?? null,
      unitAmount: price.unit_amount ?? null,
      currency: price.currency ?? null,
      recurringInterval: price.recurring?.interval ?? null,
      recurringIntervalCount: price.recurring?.interval_count ?? null,
    };
  });
  const firstItem = subscription.items.data[0];
  return {
    externalSubscriptionId: subscription.id,
    externalCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    providerAccountId,
    status: subscription.status,
    providerStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: isoFromUnix(firstItem?.current_period_start),
    currentPeriodEnd: isoFromUnix(firstItem?.current_period_end),
    canceledAt: isoFromUnix(subscription.canceled_at),
    endedAt: isoFromUnix(subscription.ended_at),
    trialStart: isoFromUnix(subscription.trial_start),
    trialEnd: isoFromUnix(subscription.trial_end),
    items,
    metadata: metadata(subscription.metadata),
    livemode: subscription.livemode,
    createdAt: isoFromUnix(subscription.created),
  };
}

export async function listStripeCustomersForSubAccount(input: {
  subAccountId: string;
  limit?: number;
  startingAfter?: string | null;
  email?: string | null;
}): Promise<StripeDiscoveryPage<DiscoveredStripeCustomer>> {
  const providerAccountId = await connectedAccountFor(input.subAccountId);
  const params: Stripe.CustomerListParams = { limit: safeLimit(input.limit) };
  if (input.startingAfter) params.starting_after = input.startingAfter;
  if (input.email) params.email = normalizeEmail(input.email) ?? undefined;
  try {
    const page = await getStripeServer().customers.list(params, {
      stripeAccount: providerAccountId,
    });
    return {
      items: page.data.map((customer) =>
        customerSnapshot(customer, providerAccountId)
      ),
      hasMore: page.has_more,
      nextCursor: page.data.at(-1)?.id ?? null,
    };
  } catch (error) {
    throw stripeError(error);
  }
}

export async function getStripeCustomerForSubAccount(
  subAccountId: string,
  externalCustomerId: string
): Promise<DiscoveredStripeCustomer> {
  const providerAccountId = await connectedAccountFor(subAccountId);
  try {
    const customer = await getStripeServer().customers.retrieve(
      externalCustomerId,
      undefined,
      { stripeAccount: providerAccountId }
    );
    if (customer.deleted) {
      throw new StripeDiscoveryError(
        "STRIPE_RESOURCE_NOT_FOUND",
        "Stripe customer not found.",
        404
      );
    }
    return customerSnapshot(customer, providerAccountId);
  } catch (error) {
    if (error instanceof StripeDiscoveryError) throw error;
    throw stripeError(error);
  }
}

async function listSubscriptions(input: {
  subAccountId: string;
  customerId?: string | null;
  limit?: number;
  startingAfter?: string | null;
}): Promise<StripeDiscoveryPage<DiscoveredStripeSubscription>> {
  const providerAccountId = await connectedAccountFor(input.subAccountId);
  const params: Stripe.SubscriptionListParams = {
    limit: safeLimit(input.limit),
    status: "all",
    expand: ["data.items.data.price.product"],
  };
  if (input.customerId) params.customer = input.customerId;
  if (input.startingAfter) params.starting_after = input.startingAfter;
  try {
    const page = await getStripeServer().subscriptions.list(params, {
      stripeAccount: providerAccountId,
    });
    return {
      items: page.data.map((subscription) =>
        subscriptionSnapshot(subscription, providerAccountId)
      ),
      hasMore: page.has_more,
      nextCursor: page.data.at(-1)?.id ?? null,
    };
  } catch (error) {
    throw stripeError(error);
  }
}

export async function listStripeSubscriptionsForSubAccount(
  input: Omit<Parameters<typeof listSubscriptions>[0], "customerId">
): Promise<StripeDiscoveryPage<DiscoveredStripeSubscription>> {
  return listSubscriptions(input);
}

export async function listStripeSubscriptionsForCustomer(input: {
  subAccountId: string;
  externalCustomerId: string;
  limit?: number;
  startingAfter?: string | null;
}): Promise<StripeDiscoveryPage<DiscoveredStripeSubscription>> {
  return listSubscriptions(input);
}

export async function getStripeSubscriptionForSubAccount(
  subAccountId: string,
  externalSubscriptionId: string
): Promise<DiscoveredStripeSubscription> {
  const providerAccountId = await connectedAccountFor(subAccountId);
  try {
    const subscription = await getStripeServer().subscriptions.retrieve(
      externalSubscriptionId,
      { expand: ["items.data.price.product"] },
      { stripeAccount: providerAccountId }
    );
    return subscriptionSnapshot(subscription, providerAccountId);
  } catch (error) {
    throw stripeError(error);
  }
}

export async function matchStripeCustomerToContacts(input: {
  subAccountId: string;
  email: string | null | undefined;
}): Promise<StripeContactMatch> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    return {
      status: "unmatched",
      normalizedEmail: null,
      candidateContactIds: [],
      reason: "The Stripe customer has no usable email address.",
    };
  }
  const snap = await getAdminDb()
    .collection("contacts")
    .where("subAccountId", "==", input.subAccountId)
    .get();
  const candidates = snap.docs.filter(
    (doc) => normalizeEmail(doc.data().email) === normalizedEmail
  );
  if (candidates.length === 1) {
    return {
      status: "matched",
      normalizedEmail,
      candidateContactIds: [candidates[0].id],
      reason: "Exactly one contact has the normalized Stripe customer email.",
    };
  }
  if (candidates.length === 0) {
    return {
      status: "unmatched",
      normalizedEmail,
      candidateContactIds: [],
      reason:
        "No contact in this sub-account has the normalized Stripe customer email.",
    };
  }
  return {
    status: "needs_review",
    normalizedEmail,
    candidateContactIds: candidates.map((doc) => doc.id),
    reason:
      "Multiple contacts in this sub-account have the normalized Stripe customer email.",
  };
}
