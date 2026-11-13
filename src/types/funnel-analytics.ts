import type { Timestamp, FieldValue } from "firebase-admin/firestore";

export type FunnelAnalyticsEventType =
  | "funnel_entry"
  | "step_viewed"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_failed"
  | "offer_viewed"
  | "offer_accepted"
  | "offer_declined"
  | "step_transition"
  | "funnel_completed";

export type FunnelAnalyticsMode = "test" | "live" | "unknown";

/** Server-written, default-deny event record. Never contains card data. */
export interface FunnelAnalyticsEvent {
  id: string;
  type: FunnelAnalyticsEventType;
  agencyId: string;
  subAccountId: string;
  funnelId: string;
  stepId: string | null;
  pageId: string | null;
  funnelSessionId: string | null;
  anonymousSessionId: string | null;
  memberId: string | null;
  contactId: string | null;
  orderId: string | null;
  purchaseId: string | null;
  offerId: string | null;
  paymentMode: FunnelAnalyticsMode;
  stripeAccountId: string | null;
  verified: boolean;
  outcome: "payment" | "trial_activation" | "declined" | "failed" | null;
  route: string | null;
  amountCents: number | null;
  currency: string | null;
  occurredAt: number | Timestamp | FieldValue;
  createdAt: number | Timestamp | FieldValue;
}
export interface FunnelAnalyticsDaily {
  funnelId: string;
  agencyId: string;
  subAccountId: string;
  day: string;
  updatedAt: number | Timestamp | FieldValue;
  modes?: Record<string, {
    events?: Record<string, number | FieldValue>;
    uniqueSessions?: number | FieldValue;
    uniqueVisitors?: number | FieldValue;
    revenue?: { initialPurchaseCents?: number | FieldValue; offerPurchaseCents?: number | FieldValue };
    byStep?: Record<string, {
      events?: Record<string, number | FieldValue>;
      uniqueVisitors?: number | FieldValue;
      revenue?: { initialPurchaseCents?: number | FieldValue; offerPurchaseCents?: number | FieldValue };
    }>;
  }>;
}
