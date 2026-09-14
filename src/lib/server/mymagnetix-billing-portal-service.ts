import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import {
  listPersonMemberships,
  subscriptionBelongsToMembership,
} from "@/lib/server/mymagnetix-service";
import type {
  ExternalBillingCustomer,
  ExternalSubscription,
} from "@/types/external-billing";

export type MyMagnetixPortalErrorCode =
  | "SUBSCRIPTION_NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "UNSUPPORTED_SUBSCRIPTION"
  | "BILLING_CUSTOMER_MISSING"
  | "STRIPE_ACCOUNT_UNAVAILABLE"
  | "STRIPE_CUSTOMER_MISSING"
  | "BILLING_PORTAL_UNAVAILABLE";

export class MyMagnetixPortalError extends Error {
  constructor(
    public readonly code: MyMagnetixPortalErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "MyMagnetixPortalError";
  }
}

function manageableStatus(subscription: ExternalSubscription): boolean {
  return (
    subscription.status !== "canceled" &&
    subscription.status !== "ended" &&
    subscription.providerStatus !== "canceled"
  );
}

function stripeFailure(error: unknown): MyMagnetixPortalError {
  const candidate = error as {
    code?: string;
    statusCode?: number;
  };
  if (candidate.code === "resource_missing" || candidate.statusCode === 404) {
    return new MyMagnetixPortalError(
      "STRIPE_CUSTOMER_MISSING",
      "This billing profile is no longer available. Please contact the business for help.",
      409
    );
  }
  return new MyMagnetixPortalError(
    "BILLING_PORTAL_UNAVAILABLE",
    "Subscription management is temporarily unavailable. Please try again later.",
    503
  );
}

/** Creates a Stripe-hosted portal session for one verified person-owned subscription. */
export async function createPersonBillingPortalSession(input: {
  personId: string;
  subscriptionId: string;
  returnUrl: string;
}): Promise<string> {
  const subscriptionId = input.subscriptionId.trim();
  if (!subscriptionId) {
    throw new MyMagnetixPortalError(
      "SUBSCRIPTION_NOT_FOUND",
      "Subscription not found.",
      404
    );
  }

  const subscriptionSnap = await getAdminDb()
    .doc(`externalSubscriptions/${subscriptionId}`)
    .get();
  if (!subscriptionSnap.exists) {
    throw new MyMagnetixPortalError(
      "SUBSCRIPTION_NOT_FOUND",
      "Subscription not found.",
      404
    );
  }
  const subscription = {
    id: subscriptionSnap.id,
    ...(subscriptionSnap.data() as Omit<ExternalSubscription, "id">),
  };
  if (subscription.provider !== "stripe" || !manageableStatus(subscription)) {
    throw new MyMagnetixPortalError(
      "UNSUPPORTED_SUBSCRIPTION",
      "This subscription is not available for management.",
      409
    );
  }

  const memberships = await listPersonMemberships(input.personId);
  if (
    !memberships.some((membership) =>
      subscriptionBelongsToMembership(subscription, membership)
    )
  ) {
    throw new MyMagnetixPortalError(
      "NOT_AUTHORIZED",
      "This subscription is not available for management.",
      403
    );
  }

  const [customerSnap, subAccountSnap] = await Promise.all([
    getAdminDb()
      .doc(`externalBillingCustomers/${subscription.externalBillingCustomerId}`)
      .get(),
    getAdminDb().doc(`subAccounts/${subscription.subAccountId}`).get(),
  ]);
  if (!customerSnap.exists) {
    throw new MyMagnetixPortalError(
      "BILLING_CUSTOMER_MISSING",
      "This billing profile is no longer available. Please contact the business for help.",
      409
    );
  }
  const customer = {
    id: customerSnap.id,
    ...(customerSnap.data() as Omit<ExternalBillingCustomer, "id">),
  };
  if (
    customer.provider !== "stripe" ||
    customer.subAccountId !== subscription.subAccountId ||
    customer.providerAccountId !== subscription.providerAccountId ||
    customer.externalCustomerId !== subscription.externalCustomerId ||
    customer.contactId !== subscription.contactId
  ) {
    throw new MyMagnetixPortalError(
      "BILLING_CUSTOMER_MISSING",
      "This billing profile is no longer available. Please contact the business for help.",
      409
    );
  }
  if (
    !subAccountSnap.exists ||
    subAccountSnap.data()?.stripeConnect?.accountId !==
      subscription.providerAccountId
  ) {
    throw new MyMagnetixPortalError(
      "STRIPE_ACCOUNT_UNAVAILABLE",
      "This business's Stripe connection is unavailable. Please contact the business for help.",
      409
    );
  }

  const stripe = getStripeServer();
  const options = { stripeAccount: subscription.providerAccountId };
  try {
    const stripeCustomer = await stripe.customers.retrieve(
      subscription.externalCustomerId,
      undefined,
      options
    );
    if (stripeCustomer.deleted) {
      throw new MyMagnetixPortalError(
        "STRIPE_CUSTOMER_MISSING",
        "This billing profile is no longer available. Please contact the business for help.",
        409
      );
    }
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: subscription.externalCustomerId,
        return_url: input.returnUrl,
      },
      options
    );
    return session.url;
  } catch (error) {
    if (error instanceof MyMagnetixPortalError) throw error;
    throw stripeFailure(error);
  }
}
