/**
 * Commerce runtime capabilities — what the RUNTIME can actually do, as
 * opposed to what can be configured. Settings screens and the public
 * runtime read these so nothing claims (or runs) a capability that isn't
 * switched on.
 *
 * `funnelPostPurchaseCharging` — the funnel Upsell / Downsell runtime.
 * This public flag only says that the deployment contains the capability. The
 * server-side `funnelPostPurchaseChargingEnabled()` check below additionally
 * requires TEST mode and an explicitly allow-listed QA workspace.
 */
export const COMMERCE_CAPABILITIES: Record<"funnelPostPurchaseCharging", boolean> = {
  funnelPostPurchaseCharging: process.env.NEXT_PUBLIC_FUNNEL_POST_PURCHASE_CHARGING === "on",
};

export type FunnelPostPurchaseContext = {
  subAccountId: string;
  paymentMode: "test" | "live" | null | undefined;
};

/**
 * The only server-authoritative switch for funnel post-purchase charging.
 *
 * TEST mode is necessary but not sufficient: test transactions can still
 * create CRM records, entitlements, tags and workflow effects. The explicit
 * workspace allow-list keeps the capability limited to a disposable,
 * owner-approved QA workspace. LIVE mode is rejected even when the broad
 * deployment capability flag is on.
 *
 * `FUNNEL_POST_PURCHASE_TEST_SUBACCOUNT_IDS` is a comma-separated list of
 * sub-account IDs. It is intentionally server-only; it must never be exposed
 * as a client-controlled payment-mode or workspace switch.
 */
export function funnelPostPurchaseChargingEnabled(
  context: FunnelPostPurchaseContext,
): boolean {
  if (!COMMERCE_CAPABILITIES.funnelPostPurchaseCharging) return false;
  if (context.paymentMode !== "test") return false;
  const allowed = new Set(
    (process.env.FUNNEL_POST_PURCHASE_TEST_SUBACCOUNT_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  return allowed.has(context.subAccountId);
}

export type CommerceCapability = keyof typeof COMMERCE_CAPABILITIES;

export function commerceCapability(name: CommerceCapability): boolean {
  return COMMERCE_CAPABILITIES[name];
}
