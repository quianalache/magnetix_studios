"use client";

import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManageSubscriptionButton } from "@/components/mymagnetix/manage-subscription-button";
import type { PersonSubscriptionPurchase } from "@/lib/server/mymagnetix-service";
import {
  statusLabel,
  statusClass,
  formatSubscriptionAmount,
  intervalLabel,
  nextChargeText,
} from "@/lib/mymagnetix/purchases-format";

/**
 * One "Current subscription" card (approved Purchases mockup, 2026-09-16).
 * Extracted out of purchases-view.tsx so Space Billing (portal-home-view.tsx)
 * can reuse the exact same card instead of building a second one — per
 * this task's own "reuse Purchases UI primitives where appropriate"
 * instruction. Pure/presentational; no fetching of its own.
 */
export function SubscriptionCard({
  subscription,
  onViewDetails,
  manageEndpoint,
  showBusinessName = true,
}: {
  subscription: PersonSubscriptionPurchase;
  onViewDetails: () => void;
  /** Threaded through to ManageSubscriptionButton — see that component's
   *  own doc comment for why Space Billing needs a different (Member-
   *  authenticated) endpoint than MyMagnetix's cross-business default. */
  manageEndpoint?: string;
  /** Space Billing is already scoped to one business — showing that same
   *  business's name on every card is redundant there (unlike MyMagnetix
   *  Purchases, which aggregates across businesses and needs it). Off by
   *  default changes nothing for the existing MyMagnetix caller. */
  showBusinessName?: boolean;
}) {
  const timing = nextChargeText(subscription);
  return (
    <article className="flex flex-col rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3E4F0] text-[#5E2574]">
            <CreditCard className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-bold text-[#1D1B27]">
              {subscription.productName ||
                subscription.priceName ||
                "Subscription"}
            </h3>
            {showBusinessName && (
              <p className="mt-0.5 truncate text-[11.5px] text-[#8A87A0]">
                {subscription.businessName}
              </p>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${statusClass(subscription.status)}`}
        >
          {statusLabel(subscription.status)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[18px] font-bold text-[#1D1B27]">
          {formatSubscriptionAmount(subscription)}
        </span>
        <span className="text-[12px] text-[#8A87A0]">
          {intervalLabel(subscription)}
        </span>
      </div>
      {timing && <p className="mt-2 text-[11.5px] text-[#6B6780]">{timing}</p>}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-[#F1EFF7] pt-4">
        {subscription.canManage && (
          <ManageSubscriptionButton
            subscriptionId={subscription.id}
            {...(manageEndpoint ? { endpoint: manageEndpoint } : {})}
          />
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onViewDetails}
        >
          View details
        </Button>
      </div>
    </article>
  );
}
