"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";
import type {
  PersonPaymentHistoryItem,
  PersonSubscriptionPurchase,
} from "@/lib/server/mymagnetix-service";
import { SubscriptionDetailsSheet } from "@/components/mymagnetix/subscription-details-sheet";
import { SubscriptionCard } from "@/components/mymagnetix/subscription-card";
import { PaymentHistoryTable } from "@/components/mymagnetix/payment-history-table";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";

/** Agency-sourced subscriptions (see agency-mymagnetix-billing-service.ts)
 *  aren't in the tenant `externalSubscriptions` ledger the default
 *  /api/my/billing/portal endpoint reads from, so they need the sibling
 *  agency portal-session route instead — same button/UI either way, see
 *  ManageSubscriptionButton's own `endpoint` prop. */
function manageEndpointFor(subscription: PersonSubscriptionPurchase): string | undefined {
  return subscription.subAccountId === "agency" ? "/api/my/billing/portal/agency" : undefined;
}

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
      <PageHeader title="Purchases" description="View your active subscriptions and purchases across your Magnetix businesses." />

      <section className="mt-6">
        <h2 className="text-section font-semibold text-foreground">
          Current subscriptions
        </h2>
        {subscriptionError ? (
          <div className="mt-3 rounded-card border border-destructive/30 bg-card p-6 text-center">
            <ReceiptText className="mx-auto h-6 w-6 text-destructive" />
            <p className="mt-2 text-body-sm font-semibold text-foreground">
              Purchases are temporarily unavailable
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              Please try again in a moment.
            </p>
          </div>
        ) : current.length === 0 ? (
          <EmptyState compact className="mt-3" icon={ReceiptText} title="No active subscriptions." />
        ) : (
          <div className="mt-3.5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {current.map((subscription) => (
              <SubscriptionCard
                key={subscription.id}
                subscription={subscription}
                onViewDetails={() => setSelectedSubscription(subscription)}
                manageEndpoint={manageEndpointFor(subscription)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-7">
        <h2 className="text-section font-semibold text-foreground">
          Payment history
        </h2>
        {paymentHistoryError ? (
          <div className="mt-3 rounded-card border border-destructive/30 bg-card p-6 text-center">
            <p className="text-body-sm font-semibold text-foreground">
              Payment history is temporarily unavailable
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              Please try again in a moment.
            </p>
          </div>
        ) : paymentHistory.length === 0 ? (
          <EmptyState compact className="mt-3" icon={ReceiptText} title="No payment history yet." />
        ) : (
          <div className="mt-3.5">
            <PaymentHistoryTable payments={paymentHistory} />
          </div>
        )}
      </section>

      <SubscriptionDetailsSheet
        subscription={selectedSubscription}
        onClose={() => setSelectedSubscription(null)}
        manageEndpoint={selectedSubscription ? manageEndpointFor(selectedSubscription) : undefined}
      />
    </div>
  );
}
