/**
 * Commerce runtime capabilities — what the RUNTIME can actually do, as
 * opposed to what can be configured. Settings screens and the public
 * runtime read these so nothing claims (or runs) a capability that isn't
 * switched on.
 *
 * `funnelPostPurchaseCharging` — the funnel Upsell / Downsell runtime.
 * This public flag only says that the deployment contains the capability. The
 * server-side `funnelPostPurchaseChargingEnabled()` check below additionally
 * requires the workspace to be allow-listed for the Offer's payment mode.
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
 * Off unless the deployment flag is on AND the workspace is on the allow-list
 * for the Offer's payment mode — two SEPARATE server-only lists:
 *
 * - `FUNNEL_POST_PURCHASE_TEST_SUBACCOUNT_IDS` — TEST mode. Test transactions
 *   still create CRM records, entitlements and tags, so this stays limited
 *   to disposable, owner-approved QA workspaces (Workflows run sandboxed).
 * - `FUNNEL_POST_PURCHASE_LIVE_SUBACCOUNT_IDS` — LIVE mode (real money).
 *   Empty by default; a workspace is added only with explicit owner
 *   approval. Being on the TEST list never enables LIVE charging.
 *
 * Both are comma-separated sub-account ids, never client-controlled.
 * Removing an id (or the flag) is the rollback: new sessions stop opening
 * and every Accept / Decline is refused; nothing already paid is touched.
 */
export function funnelPostPurchaseChargingEnabled(
  context: FunnelPostPurchaseContext,
): boolean {
  if (!COMMERCE_CAPABILITIES.funnelPostPurchaseCharging) return false;
  const list =
    context.paymentMode === "test"
      ? process.env.FUNNEL_POST_PURCHASE_TEST_SUBACCOUNT_IDS
      : context.paymentMode === "live"
        ? process.env.FUNNEL_POST_PURCHASE_LIVE_SUBACCOUNT_IDS
        : undefined;
  const allowed = new Set(
    (list ?? "")
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
