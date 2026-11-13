import { CheckCircle2, FileText, ShoppingCart, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { Funnel, FunnelStep, FunnelStepType, PostPurchaseDestination } from "@/types/checkout";
import type { FunnelIssue } from "@/lib/checkout/funnel-routing";
import { COMMERCE_CAPABILITIES } from "@/lib/checkout/capabilities";

/** GET /commerce/funnels/{id} — the funnel hub payload (see getFunnelHub). */
export interface FunnelHubPayload {
  funnel: Funnel;
  steps: FunnelStep[];
  pages: Array<{ id: string; name: string; status: string }>;
  checkout: Record<string, { postPurchase: PostPurchaseDestination | null; offerTitle: string | null }>;
  pageUses: Record<string, number>;
  /** pageId → Upsell / Downsell steps using it. */
  pageExclusiveUses: Record<string, number>;
  issues: FunnelIssue[];
}

/**
 * Does assigning `pageId` to this step need a copy first? Mirrors the server
 * rule: an Upsell / Downsell page can't be shared with any other step, and a
 * page an Upsell / Downsell already uses can't be reused elsewhere. The
 * server stays authoritative (it answers 409 `page_in_use`).
 */
export function pageNeedsCopy(input: { type: FunnelStepType; currentPageId: string | null; pageId: string | null; pageUses: Record<string, number>; pageExclusiveUses: Record<string, number> }): boolean {
  const { type, currentPageId, pageId } = input;
  if (!pageId) return false;
  const mine = pageId === currentPageId ? 1 : 0;
  const others = Math.max(0, (input.pageUses[pageId] ?? 0) - mine);
  const exclusiveOthers = Math.max(0, (input.pageExclusiveUses[pageId] ?? 0) - (mine && (type === "upsell" || type === "downsell") ? 1 : 0));
  return type === "upsell" || type === "downsell" ? others > 0 : exclusiveOthers > 0;
}

export const STEP_ICONS: Record<FunnelStepType, LucideIcon> = {
  page: FileText,
  checkout: ShoppingCart,
  upsell: TrendingUp,
  downsell: TrendingDown,
  thank_you: CheckCircle2,
};

/** The existing step types, explained for the Add Step chooser. */
export const STEP_TYPE_HELP: Record<FunnelStepType, string> = {
  page: "A landing, sales or opt-in page. Visitors continue to the next step.",
  checkout: "Sell an Offer with Order Bumps and coupons. Set it up in Checkout settings.",
  upsell: "A one-time offer after purchase, with Accept and Decline routes.",
  downsell: "An alternative offer, usually shown when an upsell is declined.",
  thank_you: "Confirm the purchase and share next steps.",
};

export const STEP_TYPE_ORDER: FunnelStepType[] = ["page", "checkout", "upsell", "downsell", "thank_you"];

export const pageEditorHref = (subAccountId: string, pageId: string) => `/sa/${subAccountId}/pages-funnels/${pageId}/new-builder`;
export const stepSettingsHref = (subAccountId: string, funnelId: string, stepId: string) => `/sa/${subAccountId}/pages-funnels/funnels/${funnelId}/steps/${stepId}`;
export const FUNNELS_VIEW_HREF = (subAccountId: string) => `/sa/${subAccountId}/pages-funnels?view=funnels`;

/** Plain-language note on Upsell / Downsell steps — follows the runtime capability, never claims charging is live before it is. */
export const OFFER_LATER_NOTE = COMMERCE_CAPABILITIES.funnelPostPurchaseCharging
  ? "Set the Offer, payment and CRM actions in Step settings."
  : "Set the Offer, payment and CRM actions in Step settings. Post-purchase charging isn't enabled yet, so this step doesn't charge buyers.";
