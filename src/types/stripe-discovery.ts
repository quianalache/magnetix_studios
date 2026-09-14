export interface DiscoveredStripeCustomer {
  externalCustomerId: string;
  providerAccountId: string;
  email: string | null;
  normalizedEmail: string | null;
  name: string | null;
  phone: string | null;
  createdAt: string | null;
  delinquent: boolean | null;
  metadata: Record<string, string>;
  subscriptionCount: number | null;
  livemode: boolean;
}

export interface DiscoveredStripeSubscription {
  externalSubscriptionId: string;
  externalCustomerId: string;
  providerAccountId: string;
  status: string;
  providerStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  items: Array<{
    priceId: string;
    productId: string | null;
    productName: string | null;
    priceName: string | null;
    unitAmount: number | null;
    currency: string | null;
    recurringInterval: string | null;
    recurringIntervalCount: number | null;
  }>;
  metadata: Record<string, string>;
  livemode: boolean;
  createdAt: string | null;
}

export interface StripeDiscoveryPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export type StripeContactMatchStatus = "matched" | "unmatched" | "needs_review";

export interface StripeContactMatch {
  status: StripeContactMatchStatus;
  normalizedEmail: string | null;
  candidateContactIds: string[];
  reason: string;
}
