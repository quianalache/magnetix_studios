"use client";

import { CalendarClock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ManageSubscriptionButton } from "@/components/mymagnetix/manage-subscription-button";
import type { PersonSubscriptionPurchase } from "@/lib/server/mymagnetix-service";
import {
  formatSubscriptionAmount,
  intervalLabel,
  formatDate,
  statusLabel,
  statusClass,
} from "@/lib/mymagnetix/purchases-format";

/**
 * "View details" drawer for one Current Subscription card (approved
 * Purchases mockup, 2026-09-16). Renders ONLY fields already present on
 * the `PersonSubscriptionPurchase` the caller already fetched server-side
 * — no new read, no new service, no invented Offer contents/benefits list
 * (the canonical ExternalSubscription ledger doesn't carry one; per this
 * task's own instruction not to invent that).
 */
export function SubscriptionDetailsSheet({
  subscription,
  onClose,
  manageEndpoint,
}: {
  subscription: PersonSubscriptionPurchase | null;
  onClose: () => void;
  /** Threaded straight through to ManageSubscriptionButton — see that
   *  component's own doc comment on why Space Billing needs a different
   *  (Member-authenticated) endpoint than MyMagnetix's default. */
  manageEndpoint?: string;
}) {
  return (
    <Sheet open={!!subscription} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>
            {subscription?.productName ||
              subscription?.priceName ||
              "Subscription"}
          </SheetTitle>
          <SheetDescription>{subscription?.businessName}</SheetDescription>
        </SheetHeader>
        {subscription && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-1 text-micro font-semibold ${statusClass(subscription.status)}`}
              >
                {statusLabel(subscription.status)}
              </span>
              <span className="text-section font-semibold text-foreground">
                {formatSubscriptionAmount(subscription)}{" "}
                <span className="text-micro font-normal text-muted-foreground">
                  {intervalLabel(subscription)}
                </span>
              </span>
            </div>

            <dl className="space-y-2.5 border-t border-border pt-4 text-body-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Current period</dt>
                <dd className="font-medium text-foreground">
                  {formatDate(subscription.currentPeriodStart) ?? "—"} –{" "}
                  {formatDate(subscription.currentPeriodEnd) ?? "—"}
                </dd>
              </div>
              {subscription.cancelAtPeriodEnd && (
                <div className="flex items-center gap-1.5 text-body-sm text-status-warning-fg">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  Set to cancel at the end of the current period.
                </div>
              )}
            </dl>

            {subscription.canManage && (
              <div className="border-t border-border pt-4">
                <ManageSubscriptionButton
                  subscriptionId={subscription.id}
                  {...(manageEndpoint ? { endpoint: manageEndpoint } : {})}
                />
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
