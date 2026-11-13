/**
 * Commerce runtime capabilities — what the RUNTIME can actually do, as
 * opposed to what can be configured. Settings screens and the public
 * runtime read these so nothing claims (or runs) a capability that isn't
 * switched on.
 *
 * `funnelPostPurchaseCharging` — the funnel Upsell / Downsell runtime
 * (one-click charges on the saved payment method, one-click subscriptions,
 * authentication, inline payment recovery, Accept / Decline outcomes). The
 * code exists, but it is OFF unless the deployment sets
 * `NEXT_PUBLIC_FUNNEL_POST_PURCHASE_CHARGING=on` (inlined at build, so it
 * needs a redeploy). Default off: turning it on is a release decision, not a
 * code change. While off, no funnel session is opened, Accept / Decline
 * buttons stay inactive and the runtime API refuses every action.
 */
export const COMMERCE_CAPABILITIES: Record<"funnelPostPurchaseCharging", boolean> = {
  funnelPostPurchaseCharging: process.env.NEXT_PUBLIC_FUNNEL_POST_PURCHASE_CHARGING === "on",
};

export type CommerceCapability = keyof typeof COMMERCE_CAPABILITIES;

export function commerceCapability(name: CommerceCapability): boolean {
  return COMMERCE_CAPABILITIES[name];
}
