/**
 * Page Builder Checkout / Order Form block (Checkout Foundation Phase 3) —
 * PURE props + tree helpers shared by the editor, Preview and the published
 * page. The block stores only:
 *   - `checkoutConfigId`: the connected Funnel Checkout Step's config
 *     ("" = connect automatically to this page's own Checkout Step);
 *   - `presentation`: layout / visibility / text (lib/checkout/presentation).
 * No price, Offer id, Order Bump, coupon or fulfilment data is ever stored
 * on the block — those stay in Checkout Settings.
 */
import { normalizePresentation, type CheckoutPresentation } from "@/lib/checkout/presentation";
import type { CheckoutView } from "@/lib/checkout/view-types";

export const CHECKOUT_BLOCK_TYPE = "CheckoutBlock";
/** Key used in resolved metadata for an unconnected block (auto-connect). */
export const AUTO_CHECKOUT_KEY = "auto";
const CONFIG_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface CheckoutBlockProps {
  checkoutConfigId: string;
  presentation: CheckoutPresentation;
}

export const isCheckoutConfigId = (v: unknown): v is string => typeof v === "string" && CONFIG_RE.test(v) && !v.startsWith("hosted_");

export function normalizeCheckoutBlock(raw: unknown): CheckoutBlockProps {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    checkoutConfigId: isCheckoutConfigId(r.checkoutConfigId) ? r.checkoutConfigId : "",
    presentation: normalizePresentation(r.presentation),
  };
}

/** The resolution key for a block: its connected config, or "auto". */
export const checkoutKeyFor = (props: Pick<CheckoutBlockProps, "checkoutConfigId">) => props.checkoutConfigId || AUTO_CHECKOUT_KEY;

/** A Checkout Step this page's block may connect to (same workspace only). */
export interface CheckoutStepContext {
  configId: string;
  funnelId: string;
  funnelName: string;
  funnelStatus: string;
  stepId: string;
  stepName: string;
  /** This page is the step's own page. */
  linkedToPage: boolean;
  primaryOfferTitle: string | null;
}

/** What a connected block renders from (resolved server-side). */
export interface CheckoutBlockPayload {
  connection: CheckoutStepContext;
  /** Null when the step can't render yet (no primary Offer, unavailable Offer…). */
  view: CheckoutView | null;
  problem: string | null;
}

function visit(data: unknown, fn: (props: Record<string, unknown>) => void) {
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { type?: unknown; props?: Record<string, unknown> };
    if (n.type === CHECKOUT_BLOCK_TYPE && n.props) fn(n.props);
    for (const value of Object.values(n.props ?? {})) if (Array.isArray(value)) walk(value);
  };
  const d = data as { content?: unknown; zones?: Record<string, unknown> } | null;
  walk(d?.content);
  if (d?.zones) Object.values(d.zones).forEach(walk);
}

/** Resolution keys the page's Checkout blocks need (config ids and/or "auto"). */
export function collectCheckoutKeys(data: unknown): string[] {
  const keys = new Set<string>();
  visit(data, (props) => keys.add(checkoutKeyFor(normalizeCheckoutBlock(props))));
  return [...keys].slice(0, 5);
}

/** Where "Edit Checkout Settings" goes for a connected step. */
export const checkoutSettingsHref = (subAccountId: string, c: Pick<CheckoutStepContext, "funnelId" | "stepId">) =>
  `/sa/${subAccountId}/pages-funnels/funnels/${c.funnelId}/steps/${c.stepId}`;
