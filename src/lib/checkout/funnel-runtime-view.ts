/**
 * What an Upsell / Downsell page's Accept / Decline buttons know at run time
 * (post-purchase funnel runtime). Built server-side from the buyer's funnel
 * session + the step's saved settings + the live Offer; passed to the page as
 * render metadata. Contains no secrets: no session token (that's an httpOnly
 * cookie), no Stripe secret, no card data.
 */
export type FunnelOfferRuntimeState = "ready" | "processing" | "requires_action" | "payment_failed" | "succeeded" | "declined";

export interface FunnelOfferRuntimeView {
  /** False → the buttons are inactive and show `unavailableMessage`. */
  available: boolean;
  unavailableMessage: string | null;
  funnelId: string;
  stepId: string;
  state: FunnelOfferRuntimeState;
  offer: {
    title: string;
    billing: "one_time" | "recurring";
    /** "$47.00" */
    amountLabel: string;
    /** "month" for recurring Offers. */
    interval: string | null;
    /** Offer service agreement (shown with the subscription consent). */
    termsText: string | null;
    termsUrl: string | null;
    /** Free-trial subscription Offers: trial length (days) and the first charge date (ISO, from the Offer's trial). 0 / null otherwise. */
    trialDays: number;
    firstChargeDate: string | null;
  } | null;
  hasSavedPaymentMethod: boolean;
  failure: string | null;
  nextHref: string | null;
  /** Stripe.js (authentication + inline payment): publishable key + the workspace's connected account. */
  stripe: { publishableKey: string; stripeAccount: string | null } | null;
}

/** API response for POST /api/order-checkout/funnel-offer/{funnelId}/{stepId}. */
export interface FunnelOfferActionResponse {
  state: FunnelOfferRuntimeState;
  clientSecret?: string | null;
  /** `setup` = a free trial's card authorization (SetupIntent); `payment` = a charge (PaymentIntent). */
  intentType?: "payment" | "setup";
  /** How a succeeded step was accepted. */
  acceptance?: "payment" | "trial_activation" | null;
  failure?: string | null;
  nextHref?: string | null;
  message?: string | null;
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
