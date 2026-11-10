import { CheckoutBlockView, type CheckoutRenderProps } from "@/components/pages-funnels/puck/checkout-block";
import { checkoutKeyFor, normalizeCheckoutBlock } from "@/lib/pages-funnels/checkout-block";

/**
 * SERVER/PUBLIC variant of the Checkout block — used by `serverPuckConfig`
 * (published page + staff Preview). No fetch: reads the checkout the calling
 * route already resolved into `metadata.resolvedCheckouts` from the page's
 * OWN workspace. Published routes always pass `resolvedEmbeds` (the staff
 * Preview doesn't) — the same signal booking-server.tsx uses — so Preview
 * stays non-payable while visitors get the real checkout or nothing.
 */
export function CheckoutElementServerRender({ id, style, metadata, ...rest }: CheckoutRenderProps) {
  const props = normalizeCheckoutBlock(rest);
  const context = metadata?.resolvedEmbeds !== undefined ? "published" : "preview";
  const payload = metadata?.resolvedCheckouts?.[checkoutKeyFor(props)] ?? null;
  return <CheckoutBlockView id={id} props={rest as Record<string, unknown>} style={style} context={context} resolution={{ status: "done", payload }} subAccountId={metadata?.subAccountId} brandKit={metadata?.brandKit} />;
}
