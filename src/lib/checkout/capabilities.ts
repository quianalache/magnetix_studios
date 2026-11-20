/**
 * Commerce runtime capabilities.
 *
 * One-click post-purchase Upsells / Downsells are part of the normal
 * payment experience (owner decision 2026-11-20): every workspace whose
 * Offer can be paid through its own connected, payment-ready Stripe account
 * may use them, in TEST or LIVE mode, with NO per-workspace activation,
 * allow-list or plan gate. Real eligibility is checked on the server for
 * every action (funnel-runtime-service `validateOfferStep`: published funnel,
 * page and Offer of this workspace, connected account = the checkout's
 * account, same payment mode, publishable key, saved authorization, consent).
 *
 * `FUNNEL_POST_PURCHASE_CHARGING_DISABLED` (server-only, "1"/"true") is a
 * PLATFORM-WIDE EMERGENCY STOP for incidents only — not an activation switch.
 * Unset = available. While it is set no one-click charge starts anywhere;
 * buyers can still choose "No thanks" and continue (never stranded), and
 * funnels with offer steps buyers would reach can't be newly published.
 */

export type FunnelPostPurchaseContext = {
  subAccountId: string;
  paymentMode: "test" | "live" | null | undefined;
};

export function funnelPostPurchaseEmergencyDisabled(): boolean {
  const v = process.env.FUNNEL_POST_PURCHASE_CHARGING_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Can one-click charges run for this payment mode right now? True for any
 * workspace in TEST or LIVE mode unless the emergency stop is set. Never a
 * substitute for the per-action eligibility checks — only their precondition.
 */
export function funnelPostPurchaseChargingEnabled(context: FunnelPostPurchaseContext): boolean {
  if (funnelPostPurchaseEmergencyDisabled()) return false;
  return context.paymentMode === "test" || context.paymentMode === "live";
}
