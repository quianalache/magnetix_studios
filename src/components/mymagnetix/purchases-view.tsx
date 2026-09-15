"use client";

import { useState } from "react";
import { CreditCard, ReceiptText } from "lucide-react";
import type {
  PersonPaymentHistoryItem,
  PersonSubscriptionPurchase,
} from "@/lib/server/mymagnetix-service";
import { Button } from "@/components/ui/button";
import { ManageSubscriptionButton } from "@/components/mymagnetix/manage-subscription-button";
import { SubscriptionDetailsSheet } from "@/components/mymagnetix/subscription-details-sheet";
import { PaymentHistoryTable } from "@/components/mymagnetix/payment-history-table";
import {
  statusLabel,
  statusClass,
  formatSubscriptionAmount,
  intervalLabel,
  nextChargeText,
} from "@/lib/mymagnetix/purchases-format";

/**
 * Pure presentational Purchases view (approved mockup, 2026-09-16) — takes
 * already-fetched data as props, no fetching of its own. Split out of
 * purchases/page.tsx (which still does all the auth + Firestore reads and
 * stays a Server Component) specifically so this exact component can also
 * be rendered directly with FIXTURE data for populated-state visual QA —
 * see scripts/test-mymagnetix-purchases-ui.tsx — without needing a real
 * MyMagnetix session or any Firestore data.
 *
 * Final structure is intentionally just two sections, per the approved
 * mockup: Current subscriptions, then Payment history. The prior
 * "Past subscriptions" grid is gone — a fully canceled/ended subscription
 * no longer gets its own summary card here (its historical CHARGES still
 * appear in Payment History, which is payment-level, not subscription-
 * level); this is the approved simplification, not a data loss.
 */
export function PurchasesView({
  subscriptions,
  paymentHistory,
  subscriptionError,
  paymentHistoryError,
}: {
  subscriptions: PersonSubscriptionPurchase[];
  paymentHistory: PersonPaymentHistoryItem[];
  subscriptionError: boolean;
  paymentHistoryError: boolean;
}) {
  const [selectedSubscription, setSelectedSubscription] =
    useState<PersonSubscriptionPurchase | null>(null);

  const current = subscriptions.filter(
    (subscription) =>
      subscription.status !== "canceled" && subscription.status !== "ended"
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-[20px] font-bold text-[#1D1B27]">Purchases</h1>
        <p className="mt-1 text-[13px] text-[#84809A]">
          View your active subscriptions and purchases across your Magnetix
          businesses.
        </p>
      </div>

      <section className="mt-6">
        <h2 className="text-[15px] font-bold text-[#1D1B27]">
          Current subscriptions
        </h2>
        {subscriptionError ? (
          <div className="mt-3 rounded-2xl border border-[#F3D2D2] bg-white p-6 text-center">
            <ReceiptText className="mx-auto h-6 w-6 text-[#B91C1C]" />
            <p className="mt-2 text-[13px] font-semibold text-[#1D1B27]">
              Purchases are temporarily unavailable
            </p>
            <p className="mt-1 text-[12px] text-[#8A87A0]">
              Please try again in a moment.
            </p>
          </div>
        ) : current.length === 0 ? (
          <p className="mt-3 text-[13px] text-[#8A87A0]">
            No active subscriptions.
          </p>
        ) : (
          <div className="mt-3.5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {current.map((subscription) => (
              <SubscriptionCard
                key={subscription.id}
                subscription={subscription}
                onViewDetails={() => setSelectedSubscription(subscription)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-7">
        <h2 className="text-[15px] font-bold text-[#1D1B27]">
          Payment history
        </h2>
        {paymentHistoryError ? (
          <div className="mt-3 rounded-2xl border border-[#F3D2D2] bg-white p-6 text-center">
            <p className="text-[13px] font-semibold text-[#1D1B27]">
              Payment history is temporarily unavailable
            </p>
            <p className="mt-1 text-[12px] text-[#8A87A0]">
              Please try again in a moment.
            </p>
          </div>
        ) : paymentHistory.length === 0 ? (
          <p className="mt-3 text-[13px] text-[#8A87A0]">
            No payment history yet.
          </p>
        ) : (
          <div className="mt-3.5">
            <PaymentHistoryTable payments={paymentHistory} />
          </div>
        )}
      </section>

      <SubscriptionDetailsSheet
        subscription={selectedSubscription}
        onClose={() => setSelectedSubscription(null)}
      />
    </div>
  );
}

function SubscriptionCard({
  subscription,
  onViewDetails,
}: {
  subscription: PersonSubscriptionPurchase;
  onViewDetails: () => void;
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
            <p className="mt-0.5 truncate text-[11.5px] text-[#8A87A0]">
              {subscription.businessName}
            </p>
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
          <ManageSubscriptionButton subscriptionId={subscription.id} />
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
